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
  // Google OAuth uses NextAuth's full-page redirect; the signIn call must not set redirect:false
  assert.match(handler, /await signIn\("google", \{[^}]*callbackUrl/);
  // Verify redirect:false is not in the Google signIn call parameters (the comment may contain it, but the call must not)
  const googleCall = handler.match(/signIn\("google", \{[^}]*\}\)/);
  assert.ok(googleCall, 'Google signIn call found');
  const callStr = googleCall[0];
  assert.ok(!callStr.includes('redirect: false'), 'Google signIn must not use redirect: false');
  assert.doesNotMatch(handler, /window\.location\.assign\(/);
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

test("Google OAuth callback URL derives from NEXTAUTH_URL, never localhost", () => {
  // The redirect_uri_mismatch (http://localhost:3000/api/auth/callback/google)
  // was caused by trustHost: true deriving the callback URL from the request
  // Host header instead of NEXTAUTH_URL. trustHost must be absent as a NextAuth
  // option (matched as trustHost: so explanatory comments do not false-positive).
  assert.doesNotMatch(auth, /trustHost\s*:/);

  // NEXTAUTH_URL must be required so the OAuth callback always resolves to the
  // configured production HTTPS domain, never localhost.
  assert.match(auth, /"NEXTAUTH_URL"/);
  assert.match(auth, /Missing required production environment variables/);

  // No hardcoded localhost callback URL (with scheme) in auth or login page.
  assert.doesNotMatch(auth, /https?:\/\/localhost:3000/);
  assert.doesNotMatch(source, /https?:\/\/localhost:3000/);
});
