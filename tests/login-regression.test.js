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
  const googleBlock = src.slice(src.indexOf('async function handleGoogleLogin'), src.indexOf('\n  return ('));
  assert.ok(googleBlock.includes('signIn("google", { callbackUrl })'), 'Google OAuth uses full-page redirect');
  assert.ok(!googleBlock.includes('redirect: false'), 'Google OAuth does not disable redirects');
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

test("Login-session-root-dashboard regression: no implicit ADMIN fallback", () => {
  const login = read(LOGIN_PAGE);
  const auth = read("./lib/auth.ts");
  const rootPage = read("./app/page.tsx");
  const dashboard = read("./app/dashboard/layout.tsx");
  const middleware = read("./middleware.ts");

  // Login confirms a real server-issued ADMIN session (cookie-authenticated) before redirecting.
  assert.ok(login.includes('fetch("/api/auth/session"'), 'login confirms session via /api/auth/session');
  assert.ok(login.includes('credentials: "include"'), 'session request includes cookies');
  assert.ok(
    login.includes('session?.user?.role === "ADMIN"'),
    'login requires ADMIN role'
  );

  // auth.ts maps only valid server-provided roles; no silent ADMIN fallback.
  assert.ok(auth.includes("normalizeRole"), 'auth.ts normalizes roles');
  assert.ok(!/role\s*\|\|\s*"ADMIN"/.test(auth), 'no silent ADMIN fallback in auth.ts');

  // Root and dashboard enforce server-side ADMIN authorization.
  assert.ok(rootPage.includes("getServerSession(authOptions)"), 'root reads server session');
  assert.ok(rootPage.includes('redirect("/login'), 'root redirects unauthenticated to /login');
  assert.ok(dashboard.includes("getServerSession(authOptions)"), 'dashboard reads server session');

  // Middleware requires a real NextAuth token and ADMIN for dashboard/admin routes.
  assert.ok(middleware.includes("return !!token"), 'middleware requires a real NextAuth token');
  assert.ok(middleware.includes('role !== "ADMIN"'), 'middleware enforces ADMIN for dashboard/admin');
});

test("Credentials signIn uses redirect:false so session is confirmed before navigating (prevents login bounce)", () => {
  const src = read(LOGIN_PAGE);
  // The credentials signIn must explicitly set redirect:false so we only navigate
  // to / after confirming the session cookie was established.
  const credsBlock = src.slice(src.indexOf('signIn("credentials"'), src.indexOf('handleGoogleLogin'));
  assert.ok(credsBlock.includes("redirect: false"), 'credentials signIn must use redirect:false');
  // On success, navigate to callbackUrl only after result.error is absent.
  // The session is confirmed server-side before any navigation.
  assert.ok(src.includes('confirmAdminSession(email)'), 'server session confirmed before navigating');
  assert.ok(src.includes("window.location.assign(callbackUrl)"), 'navigates to callbackUrl on success');
  assert.ok(src.includes('if (!result || result.error)'), 'signIn result inspected before navigating');
});

test("Auth cookie config sets secure flag in production for Render HTTPS", () => {
  const src = read("./lib/auth.ts");
  assert.ok(
    src.includes('__Secure-next-auth.session-token') ||
      src.includes('secure: process.env.NODE_ENV === "production"'),
    'production session cookie uses __Secure prefix and secure flag'
  );
  assert.ok(src.includes('path: "/"'), 'session cookie path covers root');
  assert.ok(src.includes("httpOnly: true"), 'session cookie is httpOnly');
});
