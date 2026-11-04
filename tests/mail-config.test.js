// Email delivery configuration: missing, misnamed and valid setups.
//
// These run the real lib/mail-config.ts, lib/auth-env.ts and lib/otp-email.ts
// modules. Values below are throwaway fixtures, never real credentials.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { loadTsModule } = require("./helpers/load-ts");

const mailConfig = loadTsModule(path.join(__dirname, "../lib/mail-config.ts"));
const authEnv = loadTsModule(path.join(__dirname, "../lib/auth-env.ts"));
const otpEmail = loadTsModule(path.join(__dirname, "../lib/otp-email.ts"));

const ROUTE_SOURCE = fs.readFileSync(path.join(__dirname, "../app/api/auth/otp/request/route.ts"), "utf8");
const EMAIL_SOURCE = fs.readFileSync(path.join(__dirname, "../lib/otp-email.ts"), "utf8");
const ENV_EXAMPLE = fs.readFileSync(path.join(__dirname, "../.env.example"), "utf8");

const GMAIL_USER = "owner.fixture@gmail.com";
const APP_PASSWORD = "abcdefghijklmnop"; // 16 letters, same shape as a real one
const SMTP_PASSWORD = "smtp-fixture-password";

function gmailEnv(overrides = {}) {
  return { GMAIL_USER, GMAIL_APP_PASSWORD: APP_PASSWORD, ...overrides };
}

function smtpEnv(overrides = {}) {
  return {
    SMTP_HOST: "smtp.fixture.test",
    SMTP_USER: "relay-user",
    SMTP_PASS: SMTP_PASSWORD,
    ...overrides,
  };
}

// --- missing configuration -------------------------------------------------

test("mail config: nothing set is reported as missing with actionable names", () => {
  const { config, diagnostics } = mailConfig.resolveMailConfig({});

  assert.strictEqual(config, null);
  assert.strictEqual(diagnostics.configured, false);
  assert.strictEqual(diagnostics.provider, null);
  assert.deepStrictEqual(diagnostics.missing, ["GMAIL_USER", "GMAIL_APP_PASSWORD"]);
  assert.deepStrictEqual(diagnostics.present, []);
  assert.deepStrictEqual(diagnostics.usedVars, []);
  assert.strictEqual(diagnostics.gmail.userPresent, false);
  assert.strictEqual(diagnostics.gmail.appPasswordPresent, false);
});

test("mail config: blank, whitespace-only and quoted-empty values are NOT configuration", () => {
  const cases = [
    { GMAIL_USER: "", GMAIL_APP_PASSWORD: "" },
    { GMAIL_USER: "   ", GMAIL_APP_PASSWORD: "\n\t " },
    { GMAIL_USER: '""', GMAIL_APP_PASSWORD: "''" },
    { SMTP_HOST: " ", SMTP_USER: "", SMTP_PASS: "\n" },
  ];

  for (const env of cases) {
    const { config, diagnostics } = mailConfig.resolveMailConfig(env);
    assert.strictEqual(config, null, `blank values must not be usable: ${JSON.stringify(env)}`);
    assert.strictEqual(diagnostics.configured, false);
    assert.ok(diagnostics.missing.length > 0);
    assert.deepStrictEqual(diagnostics.present, [], "blank names must not be reported as present");
  }
});

test("mail config: a Gmail user without an app password names the missing variable", () => {
  const { config, diagnostics } = mailConfig.resolveMailConfig({ GMAIL_USER });

  assert.strictEqual(config, null);
  assert.deepStrictEqual(diagnostics.missing, ["GMAIL_APP_PASSWORD"]);
  assert.deepStrictEqual(diagnostics.present, ["GMAIL_USER"]);
  assert.strictEqual(diagnostics.gmail.userPresent, true);
  assert.strictEqual(diagnostics.gmail.appPasswordPresent, false);
});

test("mail config: relay credentials without SMTP_HOST explain the real gap", () => {
  const { config, diagnostics } = mailConfig.resolveMailConfig({ SMTP_USER: "relay-user", SMTP_PASS: SMTP_PASSWORD });

  assert.strictEqual(config, null);
  assert.deepStrictEqual(diagnostics.missing, ["SMTP_HOST"]);
  assert.ok(
    diagnostics.issues.some((issue) => issue.includes("SMTP_HOST")),
    "an issue must explain that the relay host is missing",
  );
});

// --- valid Gmail configuration --------------------------------------------

test("mail config: valid Gmail config resolves to implicit TLS on 465", () => {
  const { config, diagnostics } = mailConfig.resolveMailConfig(gmailEnv());

  assert.strictEqual(diagnostics.configured, true);
  assert.strictEqual(diagnostics.provider, "gmail");
  assert.deepStrictEqual(diagnostics.missing, []);
  assert.deepStrictEqual(diagnostics.issues, []);
  assert.strictEqual(config.provider, "gmail");
  assert.strictEqual(config.host, "smtp.gmail.com");
  assert.strictEqual(config.port, 465);
  assert.strictEqual(config.secure, true);
  assert.strictEqual(config.requireTLS, false);
  assert.strictEqual(config.user, GMAIL_USER);
  assert.strictEqual(config.pass, APP_PASSWORD);
  assert.strictEqual(config.from, GMAIL_USER, "Gmail sends as the authenticated account");
  assert.deepStrictEqual(config.usedVars, ["GMAIL_USER", "GMAIL_APP_PASSWORD"]);
});

test("mail config: app password is normalised when Google's grouped format is pasted", () => {
  const { config, diagnostics } = mailConfig.resolveMailConfig({
    GMAIL_USER,
    GMAIL_APP_PASSWORD: "  abcd efgh ijkl mnop\n",
  });

  assert.strictEqual(config.pass, APP_PASSWORD, "spaces/newlines are not part of an app password");
  assert.strictEqual(diagnostics.gmail.appPasswordLooksValid, true);
  assert.deepStrictEqual(diagnostics.issues, []);
});

test("mail config: values wrapped in quotes from a dashboard still work", () => {
  const { config, diagnostics } = mailConfig.resolveMailConfig({
    GMAIL_USER: `"${GMAIL_USER}"`,
    GMAIL_APP_PASSWORD: `'${APP_PASSWORD}'`,
  });

  assert.strictEqual(diagnostics.configured, true);
  assert.strictEqual(config.user, GMAIL_USER);
  assert.strictEqual(config.pass, APP_PASSWORD);
  assert.strictEqual(diagnostics.issues.length, 2, "both quoted values are reported");
  assert.ok(diagnostics.issues.every((issue) => issue.includes("wrapped in quotes")));
});

test("mail config: documented aliases are accepted and reported", () => {
  const alias = mailConfig.resolveMailConfig({ GMAIL_USER, GMAIL_APP_PASS: APP_PASSWORD });
  assert.strictEqual(alias.config.provider, "gmail");
  assert.deepStrictEqual(alias.config.usedVars, ["GMAIL_USER", "GMAIL_APP_PASS"]);

  const legacy = mailConfig.resolveMailConfig({ GMAIL_USER, GMAIL_PASS: APP_PASSWORD });
  assert.strictEqual(legacy.config.provider, "gmail");
  assert.deepStrictEqual(legacy.config.usedVars, ["GMAIL_USER", "GMAIL_PASS"]);

  const smtpAlias = mailConfig.resolveMailConfig({
    SMTP_HOST: "smtp.fixture.test",
    SMTP_USER: "relay-user",
    SMTP_PASSWORD,
  });
  assert.strictEqual(smtpAlias.config.provider, "smtp");
  assert.ok(smtpAlias.config.usedVars.includes("SMTP_PASSWORD"));
});

test("mail config: a normal account password is usable but flagged, never silently accepted", () => {
  const { config, diagnostics } = mailConfig.resolveMailConfig({
    GMAIL_USER,
    GMAIL_APP_PASSWORD: "my-normal-account-password",
  });

  assert.strictEqual(config.provider, "gmail", "delivery is still attempted");
  assert.strictEqual(diagnostics.gmail.appPasswordLooksValid, false);
  assert.ok(diagnostics.issues.some((issue) => issue.includes("16 letters")));
});

test("mail config: a Gmail SMTP_USER without SMTP_HOST is detected as Gmail", () => {
  const inferred = mailConfig.resolveMailConfig({ SMTP_USER: GMAIL_USER, GMAIL_APP_PASSWORD: APP_PASSWORD });
  assert.strictEqual(inferred.config.provider, "gmail");

  const withGmailHost = mailConfig.resolveMailConfig({
    SMTP_HOST: "smtp.gmail.com",
    SMTP_USER: GMAIL_USER,
    SMTP_PASS: APP_PASSWORD,
  });
  assert.strictEqual(withGmailHost.config.provider, "gmail");
  assert.strictEqual(withGmailHost.config.port, 465);
});

// --- valid SMTP configuration --------------------------------------------

test("mail config: SMTP relay on 587 requires STARTTLS", () => {
  const { config, diagnostics } = mailConfig.resolveMailConfig(smtpEnv({ SMTP_FROM: "agency@fixture.test" }));

  assert.strictEqual(diagnostics.provider, "smtp");
  assert.strictEqual(config.host, "smtp.fixture.test");
  assert.strictEqual(config.port, 587);
  assert.strictEqual(config.secure, false);
  assert.strictEqual(config.requireTLS, true);
  assert.strictEqual(config.from, "agency@fixture.test");
});

test("mail config: port 465 and SMTP_SECURE are honoured", () => {
  const implicit = mailConfig.resolveMailConfig(smtpEnv({ SMTP_PORT: "465" }));
  assert.strictEqual(implicit.config.port, 465);
  assert.strictEqual(implicit.config.secure, true);
  assert.strictEqual(implicit.config.requireTLS, false);

  const forced = mailConfig.resolveMailConfig(smtpEnv({ SMTP_PORT: "587", SMTP_SECURE: "true" }));
  assert.strictEqual(forced.config.secure, true);

  const insecureRelay = mailConfig.resolveMailConfig(smtpEnv({ SMTP_PORT: "2525" }));
  assert.strictEqual(insecureRelay.config.port, 2525);
  assert.strictEqual(insecureRelay.config.secure, false);
  assert.strictEqual(insecureRelay.config.requireTLS, false);
});

test("mail config: an invalid SMTP_PORT falls back instead of producing NaN", () => {
  const { config, diagnostics } = mailConfig.resolveMailConfig(smtpEnv({ SMTP_PORT: "not-a-port" }));

  assert.strictEqual(config.port, 587);
  assert.ok(diagnostics.issues.some((issue) => issue.includes("SMTP_PORT")));
});

test("mail config: a host that includes the port is split correctly", () => {
  const { config } = mailConfig.resolveMailConfig(smtpEnv({ SMTP_HOST: "smtp.fixture.test:2525" }));

  assert.strictEqual(config.host, "smtp.fixture.test");
  assert.strictEqual(config.port, 2525);
});

// --- diagnostics never leak secrets --------------------------------------

test("mail diagnostics contain no address, password or sender value", () => {
  const env = gmailEnv({ SMTP_FROM: "someone-else@fixture.test" });
  const { config, diagnostics } = mailConfig.resolveMailConfig(env);

  const serialized = JSON.stringify(diagnostics);
  const formatted = mailConfig.formatMailDiagnostics(diagnostics);

  for (const secret of [APP_PASSWORD, GMAIL_USER, "someone-else@fixture.test"]) {
    assert.ok(!serialized.includes(secret), "diagnostics JSON must not contain a value");
    assert.ok(!formatted.includes(secret), "formatted diagnostics must not contain a value");
  }
  assert.strictEqual(config.pass, APP_PASSWORD, "the resolved config does hold the password for sending");

  // The log line the server emits carries names only, configured or not.
  assert.match(formatted, /missing=\[/);
  assert.match(formatted, /configured=true/);

  const broken = mailConfig.resolveMailConfig({});
  assert.match(mailConfig.formatMailDiagnostics(broken.diagnostics), /configured=false/);
});

test("mail config: SMTP_PASSWORD is not echoed by diagnostics when the relay is incomplete", () => {
  const { diagnostics } = mailConfig.resolveMailConfig({ SMTP_USER: "relay-user", SMTP_PASS: SMTP_PASSWORD });
  const serialized = JSON.stringify(diagnostics);

  assert.ok(!serialized.includes(SMTP_PASSWORD));
  assert.ok(!serialized.includes("relay-user"));
});

// --- delegated auth-env behaviour ----------------------------------------

test("auth-env: delivery checks agree with the mail resolver", () => {
  assert.strictEqual(authEnv.isOtpDeliveryConfigured(gmailEnv()), true);
  assert.strictEqual(authEnv.isGmailOtpConfigured(gmailEnv()), true);
  assert.strictEqual(authEnv.isSmtpOtpConfigured(gmailEnv()), false);

  assert.strictEqual(authEnv.isOtpDeliveryConfigured(smtpEnv()), true);
  assert.strictEqual(authEnv.isSmtpOtpConfigured(smtpEnv()), true);
  assert.strictEqual(authEnv.isGmailOtpConfigured(smtpEnv()), false);

  assert.strictEqual(authEnv.isOtpDeliveryConfigured({ GMAIL_USER: "  ", GMAIL_APP_PASSWORD: '""' }), false);
  assert.strictEqual(authEnv.isOtpDeliveryConfigured({ GMAIL_USER, GMAIL_PASS: APP_PASSWORD }), true);
});

test("auth-env: whitespace-only required variables count as missing", () => {
  const baseRequired = ["NEXTAUTH_SECRET", "NEXTAUTH_URL", "DATABASE_URL", "OWNER_EMAIL"];
  const env = {
    NEXTAUTH_SECRET: "   ",
    NEXTAUTH_URL: "https://example.test",
    DATABASE_URL: "postgres://example",
    OWNER_EMAIL: "   ",
    ...gmailEnv(),
  };

  assert.deepStrictEqual(authEnv.findMissingAuthEnv(baseRequired, env), ["NEXTAUTH_SECRET", "OWNER_EMAIL"]);
  // The legacy message is preserved for compatibility with existing deployments.
  assert.ok(
    authEnv.findMissingAuthEnv(baseRequired, {}).includes("OWNER_PASSWORD_HASH or GMAIL_USER/GMAIL_APP_PASSWORD"),
  );
});

// --- transport and sending ------------------------------------------------

test("otp email: transport reflects the resolved host, port and TLS mode", () => {
  const gmailTransport = otpEmail.createOtpTransport(mailConfig.resolveMailConfig(gmailEnv()).config);
  assert.strictEqual(gmailTransport.options.host, "smtp.gmail.com");
  assert.strictEqual(gmailTransport.options.port, 465);
  assert.strictEqual(gmailTransport.options.secure, true);
  assert.ok(gmailTransport.options.connectionTimeout > 0, "a hung SMTP connect must time out");
  assert.ok(gmailTransport.options.socketTimeout > 0);

  const smtpTransport = otpEmail.createOtpTransport(mailConfig.resolveMailConfig(smtpEnv()).config);
  assert.strictEqual(smtpTransport.options.host, "smtp.fixture.test");
  assert.strictEqual(smtpTransport.options.port, 587);
  assert.strictEqual(smtpTransport.options.secure, false);
  assert.strictEqual(smtpTransport.options.requireTLS, true);
});

test("otp email: sending without configuration throws the not-configured error", async () => {
  const saved = { ...process.env };
  for (const name of ["GMAIL_USER", "GMAIL_APP_PASSWORD", "GMAIL_APP_PASS", "GMAIL_PASS", "SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_PASSWORD"]) {
    delete process.env[name];
  }

  try {
    await assert.rejects(
      () => otpEmail.sendOtpEmail({ to: GMAIL_USER, code: "123456", expiresAt: new Date(Date.now() + 60_000) }),
      (error) => {
        assert.strictEqual(error.name, "OtpDeliveryNotConfiguredError");
        assert.deepStrictEqual(error.missing, ["GMAIL_USER", "GMAIL_APP_PASSWORD"]);
        return true;
      },
    );
  } finally {
    process.env = saved;
  }
});

test("otp email: a configured send uses the authenticated sender and the requested recipient", async () => {
  const sent = [];
  const config = mailConfig.resolveMailConfig(gmailEnv({ SMTP_FROM: "outreach@fixture.test" })).config;

  await otpEmail.sendOtpEmail({
    to: "recipient@fixture.test",
    code: "654321",
    expiresAt: new Date(Date.now() + 5 * 60_000),
    config,
    transport: {
      sendMail: async (message) => {
        sent.push(message);
        return { accepted: [message.to] };
      },
    },
  });

  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].to, "recipient@fixture.test");
  assert.strictEqual(sent[0].from, GMAIL_USER, "SMTP_FROM must not override the Gmail account");
  assert.match(sent[0].subject, /sign-in code/i);
  assert.match(sent[0].text, /654321/);
  assert.match(sent[0].text, /expires in 5 minute/i);
});

test("otp email: delivery failures are classified without provider text", () => {
  const smtpError = Object.assign(new Error("535-5.7.8 Username and Password not accepted for owner@example.com"), {
    name: "Error",
    code: "EAUTH",
    responseCode: 535,
  });
  const auth = otpEmail.classifyDeliveryFailure(smtpError);
  assert.strictEqual(auth.kind, "auth");
  assert.strictEqual(auth.transportCode, "EAUTH");
  assert.strictEqual(auth.smtpCode, 535);
  assert.ok(!JSON.stringify(auth).includes("Username and Password"), "provider text must not be propagated");

  assert.strictEqual(otpEmail.classifyDeliveryFailure(Object.assign(new Error("x"), { code: "ETIMEDOUT" })).kind, "timeout");
  assert.strictEqual(otpEmail.classifyDeliveryFailure(Object.assign(new Error("x"), { code: "ESOCKET" })).kind, "timeout");
  assert.strictEqual(otpEmail.classifyDeliveryFailure(Object.assign(new Error("x"), { code: "ECONNECTION" })).kind, "connection");
  assert.strictEqual(otpEmail.classifyDeliveryFailure(Object.assign(new Error("x"), { code: "EENVELOPE" })).kind, "recipient");
  assert.strictEqual(otpEmail.classifyDeliveryFailure(new Error("boom")).kind, "unknown");
});

// --- route wiring ---------------------------------------------------------

test("OTP route: exposes secret-free diagnostics and names the missing variables", () => {
  assert.match(ROUTE_SOURCE, /export async function GET\(\)/, "a diagnostics GET handler exists");
  assert.match(ROUTE_SOURCE, /missing: diagnostics\.missing/);
  assert.match(ROUTE_SOURCE, /present: diagnostics\.present/);
  assert.match(ROUTE_SOURCE, /issues: diagnostics\.issues/);
  assert.match(ROUTE_SOURCE, /Missing: \$\{missing\}/, "the 503 names what is missing");
  assert.match(ROUTE_SOURCE, /resolveMailConfig\(\)/, "one resolver drives the gate and the transport");
  assert.ok(!/isOtpDeliveryConfigured\(\)/.test(ROUTE_SOURCE), "the route no longer duplicates the check");

  // Diagnostics and errors must never echo a credential.
  assert.ok(!/pass(word)?\s*:\s*(process\.env|mailConfig|config)\./i.test(ROUTE_SOURCE), "no response may carry the password");
  assert.ok(!/error:\s*[^,)]*mailConfig\.(user|pass)/.test(ROUTE_SOURCE));
  assert.ok(!/console\.(error|warn)\([^)]*mailConfig\.(user|pass)/.test(ROUTE_SOURCE), "logs must not print credentials");
  assert.match(ROUTE_SOURCE, /Cache-Control": "no-store"/);
});

test("otp email: logging is limited to secret-free diagnostics", () => {
  assert.ok(!/console\.(log|info|debug)\(/.test(EMAIL_SOURCE), "the mailer must not log routine output");

  const logCalls = EMAIL_SOURCE.match(/console\.(?:warn|error)\([^;]*/g) || [];
  assert.ok(logCalls.length > 0, "the diagnostics warning exists");
  for (const call of logCalls) {
    assert.ok(
      !/config\.(user|pass)|input\.code|input\.to/.test(call),
      `a log call must not reference a credential or code: ${call}`,
    );
    assert.ok(/formatMailDiagnostics|\[otp\]/.test(call), "log output is limited to the diagnostics text");
  }

  assert.ok(!/pass:\s*[a-z]/i.test(EMAIL_SOURCE.replace(/auth: \{ user: config\.user, pass: config\.pass \}/, "")), "no hard-coded password");
});

test(".env.example documents the accepted aliases and the diagnostics endpoint", () => {
  assert.match(ENV_EXAMPLE, /GET \/api\/auth\/otp\/request/);
  assert.match(ENV_EXAMPLE, /GMAIL_APP_PASS/);
  assert.match(ENV_EXAMPLE, /SMTP_PASSWORD is accepted as an alias/);
  assert.match(ENV_EXAMPLE, /myaccount\.google\.com\/apppasswords/);
});
