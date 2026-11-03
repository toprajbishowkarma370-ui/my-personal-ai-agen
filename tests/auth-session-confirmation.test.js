const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../app/login/page.tsx"), "utf8");
const auth = fs.readFileSync(path.join(__dirname, "../lib/auth.ts"), "utf8");
const middleware = fs.readFileSync(path.join(__dirname, "../middleware.ts"), "utf8");
const rootPage = fs.readFileSync(path.join(__dirname, "../app/page.tsx"), "utf8");
const dashboard = fs.readFileSync(path.join(__dirname, "../app/dashboard/layout.tsx"), "utf8");

test("credentials sign-in confirms the server session endpoint before redirecting", () => {
  assert.match(source, /signIn\("credentials"/);
  assert.match(source, /redirect: false/);
  assert.match(source, /fetch\("\/api\/auth\/session"/);
  assert.match(source, /credentials: "include"/);
  assert.match(source, /cache: "no-store"/);
  assert.match(source, /session\?\.user\?\.role === "ADMIN"/);
  assert.match(source, /window\.location\.assign\(callbackUrl\)/);
  assert.doesNotMatch(source, /owner_session_active.*(?:if|===)/s);
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
