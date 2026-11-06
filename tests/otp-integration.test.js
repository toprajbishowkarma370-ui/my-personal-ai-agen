// Integration tests for the complete owner OTP login flow.
// request code -> sign in through the same verify function the NextAuth
// Credentials provider calls -> ADMIN session user, plus every failure mode:
// invalid, expired, reused, rate-limited, locked, superseded, non-owner.
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

const { loadTsModule } = require("./helpers/load-ts");
const { FakeOtpStore } = require("./helpers/fake-otp-store");

const otp = loadTsModule(path.join(__dirname, "../lib/otp.ts"));

const SECRET = "integration-secret-value-long-enough";
const OWNER = "owner@agency.local";
const START = new Date("2026-03-01T09:00:00.000Z");
const T0 = START;
const plus = (ms) => new Date(T0.getTime() + ms);

function createFlow(overrides = {}) {
  const store = new FakeOtpStore();
  const ownerEmail = overrides.ownerEmail ?? OWNER;
  const secret = overrides.secret ?? SECRET;

  return {
    store,
    request: (email = OWNER, now = T0, ip = "203.0.113.7") =>
      otp.requestOtpLogin({ email, ip, ownerEmail, secret, now, store }),
    verify: (code, email = OWNER, now = plus(30_000)) => otp.verifyOtpLogin({ email, code, ownerEmail, secret, now, store }),
    consumedRows: () => store.rows.filter((row) => row.consumedAt !== null),
  };
}

test("complete OTP login: request, single verification, ADMIN session", async () => {
  const flow = createFlow();

  const requested = await flow.request();
  assert.strictEqual(requested.status, "sent");
  assert.strictEqual(requested.deliver, true);
  assert.match(requested.code, /^\d{6}$/);
  assert.strictEqual(flow.store.rows.length, 1);

  const signedIn = await flow.verify(requested.code);
  assert.strictEqual(signedIn.ok, true);
  assert.strictEqual(signedIn.user.role, "ADMIN", "OTP login creates an ADMIN session only");
  assert.strictEqual(signedIn.user.email, OWNER);

  // The returned user is what NextAuth stores in the JWT; the dashboard and
  // middleware both require exactly this role, so a refresh keeps access.
  assert.deepStrictEqual(signedIn.user, { id: otp.OWNER_USER_ID, email: OWNER, name: "Owner Admin", role: "ADMIN" });

  // Exactly one record was consumed and the code is gone from the active set.
  assert.strictEqual(flow.consumedRows().length, 1);
  assert.strictEqual((await flow.store.findActive(OWNER, plus(31_000))).length, 0);
});

test("an invalid code is rejected and the real code still works afterwards", async () => {
  const flow = createFlow();
  const requested = await flow.request();

  const wrong = await flow.verify("000000" === requested.code ? "111111" : "000000");
  assert.strictEqual(wrong.ok, false);
  assert.strictEqual(wrong.reason, "invalid");
  assert.strictEqual(flow.consumedRows().length, 0, "a failed guess must not consume the code");

  const correct = await flow.verify(requested.code);
  assert.strictEqual(correct.ok, true);
  assert.strictEqual(correct.user.role, "ADMIN");
});

test("an expired code is rejected after 5 minutes", async () => {
  const flow = createFlow();
  const requested = await flow.request(OWNER, T0);

  const justBefore = await flow.verify(requested.code, OWNER, plus(otp.OTP_TTL_MS - 1000));
  assert.strictEqual(justBefore.ok, true);

  const secondFlow = createFlow();
  const secondRequest = await secondFlow.request(OWNER, T0);
  const expired = await secondFlow.verify(secondRequest.code, OWNER, plus(otp.OTP_TTL_MS + 1000));
  assert.strictEqual(expired.ok, false);
  assert.strictEqual(expired.reason, "expired");
  assert.strictEqual(secondFlow.consumedRows().length, 0);
});

test("a reuse of an already-consumed code is rejected (replay protection)", async () => {
  const flow = createFlow();
  const requested = await flow.request();

  const first = await flow.verify(requested.code, OWNER, plus(10_000));
  assert.strictEqual(first.ok, true);

  const replay = await flow.verify(requested.code, OWNER, plus(20_000));
  assert.strictEqual(replay.ok, false);
  assert.strictEqual(replay.reason, "reused");

  const replayLater = await flow.verify(requested.code, OWNER, plus(40_000));
  assert.strictEqual(replayLater.ok, false);
  assert.strictEqual(replayLater.reason, "reused");

  assert.strictEqual(flow.consumedRows().length, 1, "a code is consumed exactly once");
});

test("concurrent verification of one code yields exactly one session", async () => {
  const flow = createFlow();
  const requested = await flow.request();

  const [first, second] = await Promise.all([flow.verify(requested.code), flow.verify(requested.code)]);
  const successes = [first, second].filter((result) => result.ok);

  assert.strictEqual(successes.length, 1, "only one concurrent verification may succeed");
  assert.strictEqual(successes[0].user.role, "ADMIN");
  assert.strictEqual(flow.consumedRows().length, 1);

  const loser = [first, second].find((result) => !result.ok);
  assert.strictEqual(loser.reason, "reused");
});

test("repeated requests are rate limited per email and produce no extra codes", async () => {
  const flow = createFlow();

  for (let i = 0; i < otp.OTP_MAX_REQUESTS_PER_EMAIL; i += 1) {
    const result = await flow.request(OWNER, plus(i * 1000));
    assert.strictEqual(result.status, "sent");
  }
  assert.strictEqual(flow.store.rows.length, 3);

  const limited = await flow.request(OWNER, plus(4000));
  assert.strictEqual(limited.status, "rate_limited");
  assert.ok(limited.retryAfterSeconds > 0 && limited.retryAfterSeconds <= otp.OTP_RATE_WINDOW_MS / 1000);
  assert.strictEqual(flow.store.rows.length, 3, "rate-limited requests must not create codes");

  // A code issued before the limit still works.
  const active = await flow.store.findActive(OWNER, plus(5000));
  assert.strictEqual(active.length, 1);

  // The email window resets after OTP_RATE_WINDOW_MS.
  const afterWindow = await flow.request(OWNER, plus(otp.OTP_RATE_WINDOW_MS + 5000));
  assert.strictEqual(afterWindow.status, "sent");
});

test("repeated requests from one IP are rate limited across addresses", async () => {
  const flow = createFlow();
  let limitedAt = null;

  for (let account = 0; account < 4 && limitedAt === null; account += 1) {
    for (let attempt = 0; attempt < otp.OTP_MAX_REQUESTS_PER_EMAIL; attempt += 1) {
      const result = await flow.request(`owner${account}@agency.local`, plus(account * 100 + attempt), "198.51.100.9");
      if (result.status === "rate_limited") {
        limitedAt = { account, attempt, result };
        break;
      }
      assert.strictEqual(result.status, "sent");
    }
  }

  assert.ok(limitedAt, "the per-IP limit must eventually trigger");
  assert.ok(limitedAt.result.retryAfterSeconds > 0);

  // A different address from another IP is unaffected.
  const otherIp = await flow.request("owner@agency.local", plus(1000), "203.0.113.44");
  assert.strictEqual(otherIp.status, "sent");
});

test("requesting a new code invalidates the previous one", async () => {
  const flow = createFlow();
  const first = await flow.request(OWNER, T0);
  const second = await flow.request(OWNER, plus(60_000));

  assert.notStrictEqual(first.code, second.code);

  const oldCode = await flow.verify(first.code, OWNER, plus(70_000));
  assert.strictEqual(oldCode.ok, false, "a superseded code must not work");

  const newCode = await flow.verify(second.code, OWNER, plus(80_000));
  assert.strictEqual(newCode.ok, true);
  assert.strictEqual(newCode.user.role, "ADMIN");
});

test("guessing is capped: the code locks after the attempt budget", async () => {
  const flow = createFlow();
  const requested = await flow.request();

  for (let attempt = 1; attempt < otp.OTP_MAX_ATTEMPTS; attempt += 1) {
    const wrong = await flow.verify("999999" === requested.code ? "111111" : "999999", OWNER, plus(attempt * 1000));
    assert.strictEqual(wrong.ok, false);
    assert.strictEqual(wrong.reason, "invalid");
  }

  const locked = await flow.verify("888888" === requested.code ? "111111" : "888888", OWNER, plus(otp.OTP_MAX_ATTEMPTS * 1000));
  assert.strictEqual(locked.ok, false);
  assert.strictEqual(locked.reason, "locked");

  const correctButLocked = await flow.verify(requested.code, OWNER, plus(otp.OTP_MAX_ATTEMPTS * 1000 + 1000));
  assert.strictEqual(correctButLocked.ok, false);
  assert.strictEqual(correctButLocked.reason, "locked");
  assert.strictEqual(flow.consumedRows().length, 0);
});

test("non-owner addresses never receive a session even with the issued code", async () => {
  const flow = createFlow();
  const attacker = "attacker@elsewhere.test";
  const requested = await flow.request(attacker);

  assert.strictEqual(requested.status, "sent");
  assert.strictEqual(requested.deliver, false, "non-owner codes are never emailed");

  const attempt = await flow.verify(requested.code, attacker, plus(10_000));
  assert.strictEqual(attempt.ok, false);
  assert.strictEqual(attempt.reason, "invalid");
  assert.strictEqual(flow.consumedRows().length, 0, "non-owner verification must not consume state");

  // The attacker cannot use the owner's email either without the owner's code.
  const ownerAttempt = await flow.verify(requested.code, OWNER, plus(11_000));
  assert.strictEqual(ownerAttempt.ok, false);
});

test("malformed codes are rejected without touching the pending code", async () => {
  const flow = createFlow();
  const requested = await flow.request();

  for (const invalid of ["", "12345", "1234567", "abcdef", "  ", "12345a", null, undefined, 123456]) {
    const result = await flow.verify(invalid);
    assert.strictEqual(result.ok, false, `code ${String(invalid)} must be rejected`);
    assert.strictEqual(result.reason, "invalid");
  }

  assert.strictEqual(flow.consumedRows().length, 0);
  const correct = await flow.verify(requested.code);
  assert.strictEqual(correct.ok, true);
});

test("missing or invalid owner configuration fails closed", async () => {
  const withoutOwner = createFlow({ ownerEmail: "" });
  const requested = await withoutOwner.request();
  assert.strictEqual(requested.status, "sent");
  assert.strictEqual(requested.deliver, false);
  const attempt = await withoutOwner.verify(requested.code);
  assert.strictEqual(attempt.ok, false);

  const withoutSecret = createFlow({ secret: "" });
  const noSecretRequest = await withoutSecret.request();
  assert.strictEqual(noSecretRequest.status, "unavailable");
  assert.strictEqual(withoutSecret.store.rows.length, 0);
});

test("only owner-format codes are ever issued for a well-formed address", async () => {
  const flow = createFlow();
  const malformed = await flow.request("not-an-email");
  assert.strictEqual(malformed.status, "invalid_email");
  assert.strictEqual(flow.store.rows.length, 0);

  const requested = await flow.request("  OWNER@Agency.Local  ");
  assert.strictEqual(requested.status, "sent");
  assert.strictEqual(requested.email, OWNER, "email is normalized before use");
  assert.strictEqual(flow.store.rows[0].email, OWNER);
});
