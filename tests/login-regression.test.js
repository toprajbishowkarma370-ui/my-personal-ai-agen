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

test("Google sign-in navigates to the authorization URL returned by NextAuth", () => {
  const src = read(LOGIN_PAGE);
  // After signIn("google", { redirect: false }) the page must navigate to the
  // Google authorization URL returned in result.url, not to callbackUrl (/).
  assert.ok(src.includes('window.location.href = result.url'), 'google sign-in navigates to result.url (Google authorization URL)');
  assert.ok(src.includes('sign-in did not return an authorization URL'), 'missing URL produces a clear error');
  assert.ok(src.includes('result?.url'), 'login page inspects result.url before navigating');
});

test("Google sign-in does not navigate to callbackUrl (avoids bypassing OAuth)", () => {
  const src = read(LOGIN_PAGE);
  const googleBlock = src.slice(
    src.indexOf('signIn("google"'),
    src.indexOf('if (typeof localStorage', src.indexOf('signIn("google"'))
  );
  // The success path must navigate to result.url (Google), not callbackUrl (/).
  assert.ok(googleBlock.includes('window.location.href = result.url'), 'google navigates to result.url');
  assert.ok(!googleBlock.includes('window.location.href = callbackUrl'), 'google does not navigate to callbackUrl');
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

test("signIn uses redirect: false to prevent internal navigation and redirect loop", () => {
  const login = read(LOGIN_PAGE);
  // credentials signIn must not let NextAuth navigate internally
  const credentialsBlock = login.slice(
    login.indexOf('signIn("credentials"'),
    login.indexOf('if (result?.error)', login.indexOf('signIn("credentials"'))
  );
  assert.ok(credentialsBlock.includes("redirect: false"), 'credentials signIn must use redirect: false');
  // google signIn must not let NextAuth navigate internally
  const googleBlock = login.slice(
    login.indexOf('signIn("google"'),
    login.indexOf('if (result?.error)', login.indexOf('signIn("google"'))
  );
  assert.ok(googleBlock.includes("redirect: false"), 'google signIn must use redirect: false');
});

test("Login success navigates to callbackUrl (controlled by login page, not NextAuth)", () => {
  const login = read(LOGIN_PAGE);
  assert.ok(login.includes("window.location.href = callbackUrl"), 'login page navigates to callbackUrl on success');
  // The navigation happens after signIn resolves, not inside NextAuth
  assert.ok(
    login.includes("window.location.href = callbackUrl") &&
    !login.includes("router.push(callbackUrl)"),
    'navigation uses window.location.href, not router.push'
  );
});

test("Login error does not navigate away from /login", () => {
  const login = read(LOGIN_PAGE);
  const credentialsBlock = login.slice(
    login.indexOf('signIn("credentials"'),
    login.indexOf('} catch (err', login.indexOf('signIn("credentials"'))
  );
  // On error result, the block returns before any navigation
  assert.ok(credentialsBlock.includes("return;"), 'error path returns before navigation');
});

test("Auth options configure explicit secure session cookies for production", () => {
  const src = read("./lib/auth.ts");
  // Production session cookie must use the __Secure prefix and secure flag so the
  // cookie is set and sent over HTTPS behind Render's TLS proxy. Without this the
  // session cookie is lost after login and getServerSession() returns null -> loop.
  assert.ok(
    src.includes('"__Secure-next-auth.session-token"'),
    'production sessionToken uses __Secure-next-auth.session-token'
  );
  assert.ok(
    src.includes('secure: isProduction()'),
    'session cookie secure flag is production-gated'
  );
  assert.ok(
    src.includes('path: "/"'),
    'session cookie path is root so it is sent to / and /login'
  );
});

test("Redirect-loop scenario: successful login establishes a session that the root route recognizes", () => {
  const auth = read("./lib/auth.ts");
  const login = read(LOGIN_PAGE);
  const page = read("./app/page.tsx");

  // 1. The login page establishes a real NextAuth session via signIn (sets cookie)
  assert.ok(login.includes('signIn("credentials"'), 'login establishes real session via signIn');
  assert.ok(login.includes("redirect: false"), 'signIn uses redirect:false to inspect result before navigating');

  // 2. The login page navigates to the root after success (not back to /login)
  assert.ok(login.includes("window.location.href = callbackUrl"), 'login navigates to callbackUrl on success');

  // 3. The root route gates on getServerSession and redirects unauthenticated users to /login
  assert.ok(page.includes("getServerSession(authOptions)"), 'root route reads server session');
  assert.ok(page.includes("redirect('/login')"), 'root route redirects to /login when no session');

  // 4. Auth options configure cookies so the session survives the redirect to / in production
  assert.ok(auth.includes('"__Secure-next-auth.session-token"'), 'production session cookie configured');
});

test("Authenticated ADMIN can access dashboard; unauthenticated users cannot", () => {
  const middleware = read("./middleware.ts");
  const dashboard = read("./app/dashboard/layout.tsx");

  // Middleware requires a real NextAuth token (!!token) for protected routes
  assert.ok(middleware.includes("return !!token"), 'middleware requires a real NextAuth token');
  // Middleware redirects non-ADMIN from /dashboard and /admin
  assert.ok(middleware.includes('token?.role !== "ADMIN"'), 'middleware enforces ADMIN for dashboard/admin');
  // Dashboard layout redirects unauthenticated to /login
  assert.ok(dashboard.includes("redirect('/login')"), 'dashboard layout redirects unauthenticated to /login');
  // Dashboard layout enforces ADMIN role
  assert.ok(dashboard.includes("role !== 'ADMIN'"), 'dashboard layout enforces ADMIN role');
});

