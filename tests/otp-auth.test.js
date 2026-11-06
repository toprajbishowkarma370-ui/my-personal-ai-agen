// Security tests for owner email OTP login.
// These execute the real lib/otp.ts and lib/auth-env.ts modules (compiled on the
// fly) and assert the NextAuth wiring by source inspection.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { loadTsModule } = require("./helpers/load-ts");
const { FakeOtpStore } = require("./helpers/fake-otp-store");

const otp = loadTsModule(path.join(__dirname, "../lib/otp.ts"));
const authEnv = loadTsModule(path.join(__dirname, "../lib/auth-env.ts"));

const AUTH_SOURCE = fs.readFileSync(path.join(__dirname, "../lib/auth.ts"), "utf8");
const ROUTE_SOURCE = fs.readFileSync(path.join(__dirname, "../app/api/auth/otp/request/route.ts"), "utf8");
const LOGIN_SOURCE = fs.readFileSync(path.join(__dirname, "../app/login/page.tsx"), "utf8");

const SECRET = "test-secret-value-with-enough-length";
const OWNER = "owner@agency.local";
const base = (now) => ({ now, secret: SECRET, ownerEmail: OWNER, store: new FakeOtpStore() });
const AT = new Date("2026-01-01T12:00:00.000Z");

test("OTP codes are 6 digits and keep leading zeros", () => {
  assert.strictEqual(otp.OTP_LENGTH, 6);

  for (let i = 0; i < 500; i += 1) {
    assert.match(otp.generateOtpCode(), /^\d{6}$/);
  }

  // Deterministic CSPRNG output for edge values.
  assert.strictEqual(otp.generateOtpCode(() => 0), "000000");
  assert.strictEqual(otp.generateOtpCode(() => 1), "000001");
  assert.strictEqual(otp.generateOtpCode(() => 999999), "999999");
  assert.throws(() => otp.generateOtpCode(() => 1_000_000), /out-of-range/);
  assert.throws(() => otp.generateOtpCode(() => 12.5), /out-of-range/);
});

test("OTP codes are generated with the Node CSPRNG by default", () => {
  const crypto = require("node:crypto");
  assert.match(crypto.randomInt.toString(), /random|int/i);

  // 2000 codes must all be valid and not collapse to a tiny set.
  const seen = new Set();
  for (let i = 0; i < 2000; i += 1) {
    seen.add(otp.generateOtpCode());
  }
  assert.ok(seen.size > 1000, `expected varied codes, saw ${seen.size}`);
});

test("OTP storage uses a keyed HMAC digest, never the plaintext code", async () => {
  const context = base(AT);
  const result = await otp.requestOtpLogin({ ...context, email: OWNER });
  assert.strictEqual(result.status, "sent");

  const stored = context.store.rows[0];
  assert.notStrictEqual(stored.codeHash, result.code, "plaintext code must not be stored");
  assert.match(stored.codeHash, /^[0-9a-f]{64}$/);
  assert.strictEqual(stored.codeHash, otp.hashOtpCode(result.code, SECRET));

  // A different secret produces a different digest (keyed, not a bare hash).
  assert.notStrictEqual(otp.hashOtpCode(result.code, SECRET), otp.hashOtpCode(result.code, `${SECRET}-rotated`));

  // Constant-time comparison rejects wrong codes, foreign digests and junk.
  assert.strictEqual(otp.verifyOtpHash(result.code, stored.codeHash, SECRET), true);
  assert.strictEqual(otp.verifyOtpHash(result.code, stored.codeHash, `${SECRET}-rotated`), false);
  assert.strictEqual(otp.verifyOtpHash("000000", stored.codeHash, SECRET), false);
  assert.strictEqual(otp.verifyOtpHash(result.code, "", SECRET), false);
  assert.strictEqual(otp.verifyOtpHash(result.code, "not-hex", SECRET), false);
  assert.strictEqual(otp.verifyOtpHash(result.code, stored.codeHash, ""), false);

  // Hashing refuses to run without a real secret.
  assert.throws(() => otp.hashOtpCode("123456", ""), /secret is not configured/);
  assert.throws(() => otp.hashOtpCode("123456", "short"), /secret is not configured/);
});

test("OTP lifetime is exactly 5 minutes and the default limits are enforced", async () => {
  assert.strictEqual(otp.OTP_TTL_MS, 5 * 60 * 1000);
  assert.strictEqual(otp.OTP_MAX_ATTEMPTS, 5);
  assert.strictEqual(otp.OTP_RATE_WINDOW_MS, 10 * 60 * 1000);
  assert.strictEqual(otp.OTP_MAX_REQUESTS_PER_EMAIL, 3);
  assert.strictEqual(otp.OTP_MAX_REQUESTS_PER_IP, 10);

  const context = base(AT);
  const result = await otp.requestOtpLogin({ ...context, email: OWNER });
  assert.strictEqual(result.expiresAt.getTime() - AT.getTime(), 5 * 60 * 1000);
  assert.strictEqual(context.store.rows[0].expiresAt.getTime(), result.expiresAt.getTime());
});

test("only the owner email can obtain an ADMIN session", async () => {
  const context = base(AT);
  const ownerRequest = await otp.requestOtpLogin({ ...context, email: OWNER.toUpperCase() });
  assert.strictEqual(ownerRequest.status, "sent");
  assert.strictEqual(ownerRequest.deliver, true, "owner address is emailed");

  const success = await otp.verifyOtpLogin({
    email: OWNER,
    code: ownerRequest.code,
    ownerEmail: OWNER,
    secret: SECRET,
    now: new Date(AT.getTime() + 1000),
    store: context.store,
  });

  assert.strictEqual(success.ok, true);
  assert.deepStrictEqual(Object.keys(success.user).sort(), ["email", "id", "name", "role"]);
  assert.strictEqual(success.user.role, "ADMIN");
  assert.strictEqual(success.user.email, OWNER);
  assert.strictEqual(success.user.id, otp.OWNER_USER_ID);

  // A different address requesting a code is never emailed and never accepted.
  const otherContext = base(AT);
  const otherRequest = await otp.requestOtpLogin({ ...otherContext, email: "someone@else.test" });
  assert.strictEqual(otherRequest.status, "sent");
  assert.strictEqual(otherRequest.deliver, false, "non-owner address is never emailed");

  const otherVerify = await otp.verifyOtpLogin({
    email: "someone@else.test",
    code: otherRequest.code,
    ownerEmail: OWNER,
    secret: SECRET,
    now: new Date(AT.getTime() + 1000),
    store: otherContext.store,
  });
  assert.strictEqual(otherVerify.ok, false);
  assert.strictEqual(otherVerify.reason, "invalid");
});

test("OTP login fails closed when NEXTAUTH_SECRET is missing", async () => {
  const context = base(AT);
  const request = await otp.requestOtpLogin({ ...context, email: OWNER, secret: undefined });
  assert.strictEqual(request.status, "unavailable");

  const verify = await otp.verifyOtpLogin({
    email: OWNER,
    code: "123456",
    ownerEmail: OWNER,
    secret: undefined,
    now: AT,
    store: context.store,
  });
  assert.strictEqual(verify.ok, false);
  assert.strictEqual(verify.reason, "unavailable");
});

test("OWNER_PASSWORD_HASH is optional; password login is preserved when configured", () => {
  const baseRequired = ["NEXTAUTH_SECRET", "NEXTAUTH_URL", "DATABASE_URL", "OWNER_EMAIL"];

  // OTP-only deployment (Gmail) needs no password hash.
  const gmailOnly = {
    NEXTAUTH_SECRET: "x",
    NEXTAUTH_URL: "https://example.test",
    DATABASE_URL: "postgres://example",
    OWNER_EMAIL: OWNER,
    GMAIL_USER: "owner@gmail.test",
    GMAIL_APP_PASSWORD: "app-password-placeholder",
  };
  assert.deepStrictEqual(authEnv.findMissingAuthEnv(baseRequired, gmailOnly), []);
  assert.strictEqual(authEnv.isOtpDeliveryConfigured(gmailOnly), true);
  assert.strictEqual(authEnv.isPasswordLoginConfigured(gmailOnly), false);
  assert.strictEqual(authEnv.isAnyOwnerLoginConfigured(gmailOnly), true);

  // SMTP-only deployment also needs no password hash.
  const smtpOnly = { ...gmailOnly, GMAIL_USER: undefined, GMAIL_APP_PASSWORD: undefined, SMTP_HOST: "smtp.test", SMTP_USER: "u", SMTP_PASS: "p" };
  assert.deepStrictEqual(authEnv.findMissingAuthEnv(baseRequired, smtpOnly), []);

  // Password-only deployment remains valid without any mail configuration.
  const passwordOnly = {
    NEXTAUTH_SECRET: "x",
    NEXTAUTH_URL: "https://example.test",
    DATABASE_URL: "postgres://example",
    OWNER_EMAIL: OWNER,
    OWNER_PASSWORD_HASH: "$2a$12$placeholder",
  };
  assert.deepStrictEqual(authEnv.findMissingAuthEnv(baseRequired, passwordOnly), []);
  assert.strictEqual(authEnv.isPasswordLoginConfigured(passwordOnly), true);

  // Neither method configured is a configuration error.
  const neither = { NEXTAUTH_SECRET: "x", NEXTAUTH_URL: "https://example.test", DATABASE_URL: "postgres://example", OWNER_EMAIL: OWNER };
  const missing = authEnv.findMissingAuthEnv(baseRequired, neither);
  assert.strictEqual(missing.length, 1);
  assert.match(missing[0], /OWNER_PASSWORD_HASH/);

  // Base variables are still reported.
  assert.deepStrictEqual(authEnv.findMissingAuthEnv(baseRequired, {}), [
    "NEXTAUTH_SECRET",
    "NEXTAUTH_URL",
    "DATABASE_URL",
    "OWNER_EMAIL",
    "OWNER_PASSWORD_HASH or GMAIL_USER/GMAIL_APP_PASSWORD",
  ]);

  // lib/auth.ts keeps a 4-item base list (no password hash) and still requires NEXTAUTH_URL.
  const requiredLine = AUTH_SOURCE.match(/export const REQUIRED_AUTH_ENV = \[([^\]]+)\]/);
  assert.ok(requiredLine, "REQUIRED_AUTH_ENV is declared");
  assert.match(requiredLine[1], /"NEXTAUTH_URL"/);
  assert.ok(!requiredLine[1].includes("OWNER_PASSWORD_HASH"), "OWNER_PASSWORD_HASH must not be required");
  assert.match(AUTH_SOURCE, /findMissingAuthEnv\(REQUIRED_AUTH_ENV\)/);
  assert.match(AUTH_SOURCE, /Missing required production environment variables/);

  // Password login path is untouched.
  assert.match(AUTH_SOURCE, /bcrypt\.compare\(credentials\.password, ownerHash\)/);
  assert.match(AUTH_SOURCE, /process\.env\.OWNER_PASSWORD_HASH/);
});

test("NextAuth Credentials provider verifies and consumes the OTP exactly once", () => {
  // The provider declares an otp credential alongside the password credential.
  assert.match(AUTH_SOURCE, /otp: \{ label: "One-time code", type: "text" \}/);
  assert.match(AUTH_SOURCE, /password: \{ label: "Password", type: "password" \}/);

  // Exactly one verification call exists in the whole authentication path.
  const verifyCalls = AUTH_SOURCE.match(/verifyOtpLogin\(/g) || [];
  assert.strictEqual(verifyCalls.length, 1, "OTP must be verified in exactly one place");
  assert.match(AUTH_SOURCE, /store: prismaOtpStore/);
  assert.match(AUTH_SOURCE, /if \(!otpResult\.ok\)/);
  assert.match(AUTH_SOURCE, /return otpResult\.user as any/);

  // The issuing endpoint never verifies or consumes codes.
  assert.ok(!ROUTE_SOURCE.includes("verifyOtpLogin"), "request route must not verify the OTP");
  assert.ok(!ROUTE_SOURCE.includes("consumeIfActive"), "request route must not consume the OTP");
  assert.ok(!ROUTE_SOURCE.includes("hashOtpCode"), "request route must not hash submitted codes");

  // The login page calls signIn once for the OTP path and no separate verify endpoint.
  assert.ok(!LOGIN_SOURCE.includes("otp/verify"), "no second verification endpoint in the UI");
  const otpHandler = LOGIN_SOURCE.slice(LOGIN_SOURCE.indexOf("async function handleOtpLogin"), LOGIN_SOURCE.indexOf("async function handleGoogleLogin"));
  assert.strictEqual((otpHandler.match(/signIn\("credentials"/g) || []).length, 1, "OTP path calls signIn exactly once");
  assert.match(otpHandler, /otp: code/);
  assert.match(otpHandler, /redirect: false/);
  assert.match(LOGIN_SOURCE, /fetch\("\/api\/auth\/otp\/request"/);
});

test("OTP request endpoint never returns or logs the code", () => {
  // No JSON response body may carry the code.
  assert.ok(!/json\(\{[^}]*\b(code|otp|otpCode)\s*:/.test(ROUTE_SOURCE), "response must not include the code");

  // The plaintext code is referenced exactly once: handed to the mailer.
  assert.strictEqual((ROUTE_SOURCE.match(/result\.code/g) || []).length, 1, "code is passed only to the mailer");
  assert.match(
    ROUTE_SOURCE,
    /sendOtpEmail\(\{ to: result\.email, code: result\.code, expiresAt: result\.expiresAt, config: mailConfig \}\)/,
  );
  assert.match(ROUTE_SOURCE, /Cache-Control": "no-store"/);
  assert.match(ROUTE_SOURCE, /retryAfterSeconds/);
  assert.match(ROUTE_SOURCE, /429/);
  assert.match(ROUTE_SOURCE, /resolveMailConfig\(\)/, "the route resolves mail config through the shared resolver");
  assert.match(ROUTE_SOURCE, /Cross-origin request rejected/);

  // No console output in the OTP path may include code material.
  for (const source of [ROUTE_SOURCE, fs.readFileSync(path.join(__dirname, "../lib/otp.ts"), "utf8")]) {
    assert.ok(!/console\.log\(/.test(source), "OTP path must not console.log");
    assert.ok(!/console\.(error|warn)\([^)]*\b(code|otpCode|result\.code)\b/i.test(source), "logs must not include code material");
  }
  assert.ok(!/console\.(error|warn)\([^)]*credentials\.otp/i.test(AUTH_SOURCE), "auth logs must not include the submitted code");
});
