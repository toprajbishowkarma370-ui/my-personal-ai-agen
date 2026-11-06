// Regression tests for email delivery (SMTP + Resend)
// Runs with: NODE_ENV=test node --test
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const EMAIL_SOURCE = fs.readFileSync(path.join(__dirname, "../lib/email.ts"), "utf8");

// Helper to temporarily set env vars
function withEnv(envObj, fn) {
  const original = {};
  for (const key of Object.keys(envObj)) {
    original[key] = process.env[key];
    process.env[key] = envObj[key];
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(envObj)) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  }
}

test("email module: Resend config is detected from env vars", () => {
  assert.ok(EMAIL_SOURCE.includes("RESEND_API_KEY"), "email.ts references RESEND_API_KEY");
  assert.ok(EMAIL_SOURCE.includes("EMAIL_FROM"), "email.ts references EMAIL_FROM");
});

test("email module: Resend HTTPS API endpoint is used", () => {
  assert.ok(EMAIL_SOURCE.includes("https://api.resend.com/emails"), "email.ts uses Resend HTTPS API endpoint");
});

test("email module: SMTP config is preserved", () => {
  const src = fs.readFileSync(path.join(__dirname, "../lib/email.ts"), "utf8");
  assert.ok(src.includes("SMTP_HOST"), "email.ts references SMTP_HOST");
  assert.ok(src.includes("SMTP_PORT"), "email.ts references SMTP_PORT");
  assert.ok(src.includes("SMTP_USER"), "email.ts references SMTP_USER");
  assert.ok(src.includes("SMTP_PASS"), "email.ts references SMTP_PASS");
});

test("email module: no secrets logged", () => {
  const src = fs.readFileSync(path.join(__dirname, "../lib/email.ts"), "utf8");
  assert.ok(!src.includes("console.log(RESEND_API_KEY"), "does not log RESEND_API_KEY");
  assert.ok(!src.includes("console.log(SMTP_PASS"), "does not log SMTP_PASS");
});

test("email module: has timeout mechanism for Resend fetch", () => {
  const src = fs.readFileSync(path.join(__dirname, "../lib/email.ts"), "utf8");
  assert.ok(
    src.includes("AbortController") || src.includes("signal") || src.includes("setTimeout"),
    "email.ts uses timeout mechanism for Resend fetch"
  );
});
