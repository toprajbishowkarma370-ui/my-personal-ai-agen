const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../app/login/page.tsx"), "utf8");
const auth = fs.readFileSync(path.join(__dirname, "../lib/auth.ts"), "utf8");
const middleware = fs.readFileSync(path.join(__dirname, "../middleware.ts"), "utf8");
const rootPage = fs.readFileSync(path.join(__dirname, "../app/page.tsx"), "utf8");
const dashboard = fs.readFileSync(path.join(__dirname, "../app/dashboard/layout.tsx"), "utf8");

function functionBody(name) {
  const start = source.indexOf(`async function ${name}`);
  assert.notEqual(start, -1, `${name} exists`);
  const nextFunction = source.indexOf("\n  async function ", start + 1);
  return source.slice(start, nextFunction === -1 ? source.length : nextFunction);
}

test("credentials sign-in confirms a fresh, cookie-authenticated ADMIN session before redirecting", () => {
  const handler = functionBody("handleCredentialsLogin");
  assert.match(handler, /if \(loading\) return/);
  assert.match(handler, /signIn\("credentials"/);
  assert.match(handler, /redirect: false/);
  assert.match(source, /fetch\("\/api\/auth\/session"/);
  assert.match(source, /credentials: "include"/);
  assert.match(source, /cache: "no-store"/);
  assert.match(source, /session\?\.user\?\.role === "ADMIN"/);
  assert.match(source, /Boolean\(session\.user\.id\)/);
  assert.match(source, /actualEmail === expectedEmail\.trim\(\)\.toLowerCase\(\)/);
  assert.ok(handler.indexOf("confirmAdminSession(email)") < handler.indexOf("window.location.assign(callbackUrl)"));
  assert.ok(handler.indexOf("confirmAdminSession(email)") < handler.indexOf('localStorage.setItem("owner_session_active"'));
});

test("Google OAuth completes through the protected callback URL, without localStorage authentication", () => {
  const handler = functionBody("handleGoogleLogin");
  assert.match(handler, /if \(loading\) return/);
  assert.match(handler, /signIn\("google"/);
  assert.match(handler, /callbackUrl/);
  assert.match(handler, /window\.location\.assign\(result\.url\)/);
  assert.doesNotMatch(handler, /localStorage/);
  assert.match(rootPage, /getServerSession\(authOptions\)/);
  assert.match(rootPage, /role === "ADMIN"/);
});

test("failed or malformed session checks fail closed and do not navigate", () => {
  assert.match(source, /if \(!response\.ok\) return false/);
  assert.match(source, /session\?\.user\?\.role === "ADMIN"/);
  assert.match(source, /actualEmail === expectedEmail\.trim\(\)\.toLowerCase\(\)/);
  assert.match(source, /if \(!\(await confirmAdminSession\(email\)\)\)/);
  assert.match(source, /ADMIN session could not be confirmed/);
});

test("session mapping preserves only a valid server-provided role", () => {
  assert.match(auth, /normalizeRole\(\(user as any\)\?\.role \?\? \(token as any\)\?\.role\)/);
  assert.match(auth, /delete \(token as any\)\.role/);
  assert.match(auth, /normalizeRole\(\(token as any\)\?\.role \?\? \(session\.user as any\)\?\.role\)/);
  assert.doesNotMatch(auth, /role\s*\|\|\s*"ADMIN"/);
});

test("invalid and missing roles cannot pass admin or agent server guards", () => {
  assert.match(auth, /role !== "ADMIN"/);
  assert.match(auth, /!role \|\| !\["ADMIN", "AGENT"\]\.includes\(role\)/);
  assert.match(middleware, /token\.role === "ADMIN"/);
  assert.match(middleware, /\["ADMIN", "AGENT"\]\.includes\(String\(token\.role\)\)/);
});

test("root and dashboard routes continue to enforce server-side ADMIN authorization", () => {
  assert.match(rootPage, /getServerSession\(authOptions\)/);
  assert.match(rootPage, /role === "ADMIN"/);
  assert.match(rootPage, /redirect\("\/login\?error=AccessDenied"\)/);
  assert.match(dashboard, /getServerSession\(authOptions\)/);
  assert.match(dashboard, /role !== "ADMIN"/);
});

test("the tested login page does not offer a local-only demo sign-in", () => {
  assert.doesNotMatch(source, /handleDemoLogin|Use One-Click Demo Session/);
});
