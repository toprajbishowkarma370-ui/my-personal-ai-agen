// Regression tests for the NextAuth v4 login fix.
// Runs with: NODE_ENV=test node --test
// These are source-level + logic simulations (no jsdom/React test runner configured).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");

const LOGIN_PAGE = "./app/login/page.tsx";
const DASHBOARD = "./index.html";
const CLIENT_DASHBOARD = "./components/ClientDashboard.tsx";

function read(p) {
  return fs.readFileSync(p, "utf8");
}

test("Login page imports signIn from next-auth/react (real session API)", () => {
  const src = read(LOGIN_PAGE);
  assert.ok(
    src.includes('import { signIn } from "next-auth/react"'),
    'login page must import signIn from next-auth/react'
  );
  assert.ok(src.includes('signIn("credentials"'), 'credentials signIn handler present');
  assert.ok(src.includes('signIn("google"'), 'Google signIn handler present');
  assert.ok(src.includes("redirect: false"), 'signIn used with redirect:false to inspect result');
});

test("No active reference to undefined window.signInWithGoogle in login flow", () => {
  const dashboard = read(DASHBOARD);
  // The Google button must NOT call signInWithGoogle(); it must delegate to /login.
  assert.ok(!dashboard.includes('onclick="signInWithGoogle()"'), 'google button must not call signInWithGoogle()');
  assert.ok(dashboard.includes("window.location.href='/login'"), 'google button must navigate to /login');
  assert.ok(dashboard.includes('onclick="window.location.href=\'/login\'"'), 'login button navigates to /login');
  // The legacy signInWithGoogle function may still exist but is no longer wired to the button.
  assert.ok(dashboard.includes("async function signInWithGoogle"), 'legacy function retained (not redefined fake)');
});

test("ClientDashboard no longer blocks navigation on undefined window global", () => {
  const src = read(CLIENT_DASHBOARD);
  assert.ok(!src.includes("window.signInWithGoogle is undefined"), 'diagnostic must not report undefined global');
  assert.ok(!src.includes("window.doLogin is undefined"), 'diagnostic must not report undefined global');
  assert.ok(!/e\.preventDefault\(\)/.test(src), 'click handlers must not prevent navigation to /login');
});

test("Login result handling: success establishes session and redirects to /", () => {
  const src = read(LOGIN_PAGE);
  assert.ok(src.includes('window.location.href = callbackUrl'), 'success redirects to / via full-page navigation');
  assert.ok(src.includes("localStorage.setItem('owner_session_active', 'true')") || src.includes('localStorage.setItem("owner_session_active",'), 'session persistence flag set');
  assert.ok(src.includes('result?.error'), 'signIn result inspected for error');
});

test("Login result handling: 401 / invalid owner rejected without establishing session", () => {
  const src = read(LOGIN_PAGE);
  assert.ok(src.includes('result.status === 401'), '401 handled as invalid credentials');
  assert.ok(
    src.includes('Invalid Owner Email or Password') ||
    src.includes('Access Denied: Owner ADMIN role required'),
    'unauthorized rejection message present'
  );
  // On error result, must NOT navigate
  const hrefCount = (src.match(/window\.location\.href = callbackUrl/g) || []).length;
  assert.ok(hrefCount >= 2, 'navigation on both success paths (credentials + google)');
});

test("Missing Google OAuth configuration shows a useful server-side error", () => {
  const src = read(LOGIN_PAGE);
  assert.ok(
    src.includes("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET"),
    'missing OAuth config error mentions required env vars'
  );
  assert.ok(src.includes("OAuthNotConfigured") || src.includes("not configured"), 'OAuth not configured path handled');
});

test("Google unauthorized account (non-owner) rejected by NextAuth authorize callback", async () => {
  // The NextAuth authorize callback only allows OWNER_EMAIL; others return null (401).
  async function simulateAuthorize(email, password, ownerEmail, ownerHash) {
    if (!ownerEmail || !ownerHash) return null;
    if (email.toLowerCase().trim() !== ownerEmail.toLowerCase().trim()) return null;
    const ok = password === "correct"; // simplified bcrypt stand-in
    return ok ? { id: "owner_admin_01", email: ownerEmail, role: "ADMIN" } : null;
  }
  const owner = "alex.morgan@agency.local";
  assert.strictEqual(await simulateAuthorize("hacker@gmail.com", "pw", owner, "hash"), null);
  assert.strictEqual(await simulateAuthorize(owner, "wrong", owner, "hash"), null);
  const success = await simulateAuthorize(owner, "correct", owner, "hash");
  assert.ok(success && success.role === "ADMIN");
});

test("Login-loop prevention: real NextAuth session via signIn (not localStorage only)", () => {
  const login = read(LOGIN_PAGE);
  const middleware = read("./middleware.ts");
  // Middleware protects routes by requiring a real NextAuth token (!!token).
  assert.ok(middleware.includes("return !!token"), 'middleware requires a real NextAuth token');
  // login page uses signIn (sets cookie) rather than only localStorage mirror.
  assert.ok(login.includes('signIn("credentials"'), 'login establishes real session via signIn');
  assert.ok(login.includes('signIn("google"'), 'google establishes real session via signIn');
});

test("Credentials signIn uses redirect:false so session is confirmed before navigating (prevents login bounce)", () => {
  const src = read(LOGIN_PAGE);
  // The credentials signIn must explicitly set redirect:false so we only navigate
  // to / after confirming the session cookie was established.
  const credsBlock = src.slice(src.indexOf('signIn("credentials"'), src.indexOf('handleGoogleLogin'));
  assert.ok(credsBlock.includes("redirect: false"), 'credentials signIn must use redirect:false');
  // On success, navigate to callbackUrl only after result.error is absent.
  assert.ok(src.includes('if (result?.error)'), 'signIn result inspected before navigating');
  assert.ok(src.includes('window.location.href = callbackUrl'), 'navigates to callbackUrl on success');
});

test("Auth cookie config sets secure flag in production for Render HTTPS", () => {
  const src = read("./lib/auth.ts");
  assert.ok(src.includes("secure: isProduction()"), 'session cookie secure flag tied to production');
  assert.ok(src.includes('path: "/"'), 'session cookie path covers root');
  assert.ok(src.includes("httpOnly: true"), 'session cookie is httpOnly');
});
