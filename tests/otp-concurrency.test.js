// Concurrency integration tests against a REAL PostgreSQL server.
//
// These tests start an actual PostgreSQL cluster (embedded-postgres), create the
// LoginOtp table with the same DDL Prisma uses, load the shipped
// lib/otp-store.ts (Prisma) and then fire genuinely concurrent requests. They
// therefore exercise the production locking path, not a simulation:
//
// - concurrent issuance for one email must leave exactly ONE valid code
// - concurrent issuance must not bypass the per-email or per-IP limits
// - concurrent verification must consume a code exactly once
//
// If PostgreSQL cannot be started (for example a platform without the binaries)
// the tests skip with an explicit reason instead of silently passing.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const { loadTsModule } = require("./helpers/load-ts");

const SECRET = "concurrency-secret-value-long-enough";
const RUN = crypto.randomBytes(4).toString("hex");
const emailFor = (label) => `otp-${RUN}-${label}@agency.local`;
const freshIp = () => `198.51.100.${crypto.randomInt(1, 250)}`;

let cluster = null;
let prisma = null;
let store = null;
let otp = null;
let dataDir = null;
let unavailableReason = null;

function createTableSql() {
  return `
    CREATE TABLE "LoginOtp" (
      "id" TEXT NOT NULL,
      "email" TEXT NOT NULL,
      "codeHash" TEXT NOT NULL,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "consumedAt" TIMESTAMP(3),
      "attempts" INTEGER NOT NULL DEFAULT 0,
      "requestIp" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "LoginOtp_pkey" PRIMARY KEY ("id")
    );
    CREATE INDEX "LoginOtp_email_createdAt_idx" ON "LoginOtp"("email", "createdAt");
    CREATE INDEX "LoginOtp_email_codeHash_idx" ON "LoginOtp"("email", "codeHash");
    CREATE INDEX "LoginOtp_requestIp_createdAt_idx" ON "LoginOtp"("requestIp", "createdAt");
  `;
}

async function startDatabase() {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "otp-pg-"));
  const port = 56000 + crypto.randomInt(0, 900);

  cluster = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "postgres",
    password: "postgres",
    port,
    persistent: false,
  });

  await cluster.initialise();
  await cluster.start();
  await cluster.createDatabase("otp_concurrency");

  process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${port}/otp_concurrency?schema=public`;

  const client = cluster.getPgClient("otp_concurrency", "127.0.0.1");
  await client.connect();
  await client.query(createTableSql());
  await client.end();

  prisma = loadTsModule(path.join(__dirname, "../lib/prisma.ts")).prisma;
  store = loadTsModule(path.join(__dirname, "../lib/otp-store.ts")).prismaOtpStore;
  otp = loadTsModule(path.join(__dirname, "../lib/otp.ts"));

  // Fail loudly instead of skipping if the schema or client is wrong.
  await prisma.$queryRaw`SELECT 1`;
}

before(async () => {
  try {
    await startDatabase();
  } catch (error) {
    unavailableReason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }
});

after(async () => {
  try {
    if (prisma) await prisma.$disconnect();
  } catch {
    /* ignore teardown errors */
  }
  try {
    if (cluster) await cluster.stop();
  } catch {
    /* ignore teardown errors */
  }
  try {
    if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* ignore teardown errors */
  }
});

function skipIfUnavailable(t) {
  if (unavailableReason) {
    t.skip(`PostgreSQL unavailable: ${unavailableReason}`);
    return true;
  }
  return false;
}

// Each test address is treated as the configured OWNER_EMAIL, which keeps the
// tests isolated from each other while still exercising the real ADMIN-only
// verification path.
const request = (email, ip) =>
  otp.requestOtpLogin({
    email,
    ip,
    ownerEmail: email,
    secret: SECRET,
    now: new Date(),
    store,
  });

const verify = (code, email) =>
  otp.verifyOtpLogin({
    email,
    code,
    ownerEmail: email,
    secret: SECRET,
    now: new Date(),
    store,
  });

describe("OTP issuance concurrency (real PostgreSQL + Prisma store)", () => {
  it("8 concurrent requests for one email leave exactly one valid code and honor the limit", async (t) => {
    if (skipIfUnavailable(t)) return;

    const email = emailFor("single");
    const ip = freshIp();

    const results = await Promise.all(Array.from({ length: 8 }, () => request(email, ip)));
    const sent = results.filter((result) => result.status === "sent");
    const limited = results.filter((result) => result.status === "rate_limited");

    assert.strictEqual(sent.length, otp.OTP_MAX_REQUESTS_PER_EMAIL, "per-email limit must hold under concurrency");
    assert.strictEqual(limited.length, 8 - otp.OTP_MAX_REQUESTS_PER_EMAIL);
    assert.ok(limited.every((result) => result.retryAfterSeconds > 0));

    const active = await prisma.loginOtp.findMany({ where: { email, consumedAt: null, expiresAt: { gt: new Date() } } });
    assert.strictEqual(active.length, 1, `expected exactly one active code, found ${active.length}`);
    assert.strictEqual(active[0].attempts, 0);

    // Only the surviving code may sign in: a superseded code must be dead.
    const accepted = [];
    const reasons = [];
    for (const result of sent) {
      const outcome = await verify(result.code, email);
      reasons.push(outcome.ok ? "ok" : outcome.reason);
      if (outcome.ok) accepted.push(result.code);
    }
    assert.strictEqual(accepted.length, 1, `exactly one issued code must be usable (reasons: ${reasons.join(", ")})`);

    const consumed = await prisma.loginOtp.findMany({ where: { email, consumedAt: { not: null } } });
    assert.strictEqual(consumed.length, 1);
  });

  it("12 concurrent requests across 4 emails from one IP never exceed the IP budget", async (t) => {
    if (skipIfUnavailable(t)) return;

    const ip = freshIp();
    const emails = [emailFor("ip-a"), emailFor("ip-b"), emailFor("ip-c"), emailFor("ip-d")];
    const calls = [];
    for (const email of emails) {
      for (let i = 0; i < 3; i += 1) calls.push(request(email, ip));
    }

    const results = await Promise.all(calls);
    const sent = results.filter((result) => result.status === "sent");
    const limited = results.filter((result) => result.status === "rate_limited");

    assert.strictEqual(sent.length, otp.OTP_MAX_REQUESTS_PER_IP, "IP limit must hold under concurrency");
    assert.strictEqual(limited.length, 12 - otp.OTP_MAX_REQUESTS_PER_IP);
    assert.strictEqual(results.filter((result) => result.status !== "sent" && result.status !== "rate_limited").length, 0);

    const rows = await prisma.loginOtp.findMany({ where: { email: { in: emails } } });
    assert.strictEqual(rows.length, otp.OTP_MAX_REQUESTS_PER_IP, "no extra rows may be created past the limit");

    const now = new Date();
    for (const email of emails) {
      const active = rows.filter((row) => row.email === email && row.consumedAt === null && row.expiresAt > now);
      assert.ok(active.length <= 1, `email ${email} must not have ${active.length} active codes`);
    }
  });

  it("concurrent requests for one email from different IPs still cannot exceed the email limit", async (t) => {
    if (skipIfUnavailable(t)) return;

    const email = emailFor("multi-ip");
    const results = await Promise.all(Array.from({ length: 6 }, () => request(email, freshIp())));

    assert.strictEqual(results.filter((result) => result.status === "sent").length, otp.OTP_MAX_REQUESTS_PER_EMAIL);
    assert.strictEqual(results.filter((result) => result.status === "rate_limited").length, 6 - otp.OTP_MAX_REQUESTS_PER_EMAIL);

    const active = await prisma.loginOtp.findMany({ where: { email, consumedAt: null, expiresAt: { gt: new Date() } } });
    assert.strictEqual(active.length, 1);
  });

  it("a burst that starts with the window already full issues nothing", async (t) => {
    if (skipIfUnavailable(t)) return;

    const email = emailFor("full-window");
    const ip = freshIp();
    for (let i = 0; i < otp.OTP_MAX_REQUESTS_PER_EMAIL; i += 1) {
      const result = await request(email, ip);
      assert.strictEqual(result.status, "sent");
    }

    const burst = await Promise.all(Array.from({ length: 5 }, () => request(email, ip)));
    assert.ok(burst.every((result) => result.status === "rate_limited"), "a full window must reject every concurrent attempt");

    const count = await prisma.loginOtp.count({ where: { email } });
    assert.strictEqual(count, otp.OTP_MAX_REQUESTS_PER_EMAIL, "rate-limited requests must not insert rows");
  });

  it("a code issued under concurrency is consumed exactly once by concurrent verifications", async (t) => {
    if (skipIfUnavailable(t)) return;

    const email = emailFor("consume");
    const issued = await request(email, freshIp());
    assert.strictEqual(issued.status, "sent");

    const [first, second] = await Promise.all([verify(issued.code, email), verify(issued.code, email)]);
    const successes = [first, second].filter((outcome) => outcome.ok);
    const reasons = [first, second].map((outcome) => (outcome.ok ? "ok" : outcome.reason)).join(", ");

    assert.strictEqual(successes.length, 1, `only one concurrent verification may succeed (got ${reasons})`);
    assert.strictEqual(successes[0].user.role, "ADMIN");
    assert.strictEqual([first, second].find((outcome) => !outcome.ok).reason, "reused");

    const consumed = await prisma.loginOtp.count({ where: { email, consumedAt: { not: null } } });
    assert.strictEqual(consumed, 1, "a code must be consumed exactly once");
  });
});
