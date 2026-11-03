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

test("Google OAuth starts through NextAuth's full-page redirect and does not fake a session", () => {
  const handler = functionBody("handleGoogleLogin");
  assert.match(handler, /if \(loading\) return/);
  assert.match(handler, /await signIn\("google", \{ callbackUrl \}\)/);
  // NextAuth v4 performs the browser navigation when redirect:false is omitted.
  // Inspecting a result URL or navigating directly to callbackUrl can skip OAuth.
  assert.doesNotMatch(handler, /redirect:\s*false/);
  assert.doesNotMatch(handler, /result\.url|localStorage/);
  assert.match(rootPage, /getServerSession\(authOptions\)/);
  assert.match(rootPage, /role === "ADMIN"/);
});

test("failed or malformed credentials session checks fail closed and do not navigate", () => {
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

test("Google sign-in is restricted to the verified configured owner account", () => {
  assert.match(auth, /account\?\.provider === "google"/);
  assert.match(auth, /if \(!isVerified\) \{\s*return false/);
  assert.match(auth, /if \(ownerEmail && userEmail === ownerEmail\)/);
  assert.match(auth, /Google sign-in rejected: user email does not match OWNER_EMAIL/);
});

test("the tested login page does not offer a local-only demo sign-in", () => {
  assert.doesNotMatch(source, /handleDemoLogin|Use One-Click Demo Session/);
});

test("Google OAuth callback URL derives from NEXTAUTH_URL, never localhost", () => {
  // trustHost must not allow forwarded host headers to replace NEXTAUTH_URL.
  assert.doesNotMatch(auth, /trustHost\s*:/);
  assert.match(auth, /"NEXTAUTH_URL"/);
  assert.match(auth, /Missing required production environment variables/);
  assert.doesNotMatch(auth, /https?:\/\/localhost:3000/);
  assert.doesNotMatch(source, /https?:\/\/localhost:3000/);
});
