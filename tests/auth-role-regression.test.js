const test = require("node:test");
const assert = require("node:assert");

const VALID_ROLES = new Set(["ADMIN", "AGENT", "CLIENT"]);

function normalizeRole(role) {
  return typeof role === "string" && VALID_ROLES.has(role) ? role : undefined;
}

function hasAdminAccess(role) {
  return role === "ADMIN";
}

function hasAgentAccess(role) {
  return role === "ADMIN" || role === "AGENT";
}

test("valid ADMIN credentials and session keep a trusted ADMIN role", () => {
  const session = { user: { id: "u_1", email: "owner@example.com", role: "ADMIN" } };
  const role = normalizeRole(session.user.role);

  assert.strictEqual(role, "ADMIN");
  assert.strictEqual(hasAdminAccess(role), true);
});

test("missing role is rejected", () => {
  assert.strictEqual(normalizeRole(undefined), undefined);
  assert.strictEqual(normalizeRole(null), undefined);
  assert.strictEqual(normalizeRole(""), undefined);
});

test("invalid role is rejected", () => {
  assert.strictEqual(normalizeRole("ADMINISTRATOR"), undefined);
  assert.strictEqual(normalizeRole("root"), undefined);
  assert.strictEqual(normalizeRole("admin"), undefined);
});

test("AGENT is allowed only for agent routes", () => {
  assert.strictEqual(hasAgentAccess("ADMIN"), true);
  assert.strictEqual(hasAgentAccess("AGENT"), true);
  assert.strictEqual(hasAgentAccess("CLIENT"), false);
  assert.strictEqual(hasAdminAccess("AGENT"), false);
});

test("CLIENT is blocked from admin dashboard", () => {
  assert.strictEqual(hasAdminAccess("CLIENT"), false);
  assert.strictEqual(hasAgentAccess("CLIENT"), false);
});

test("root dashboard requires ADMIN session", () => {
  const valid = { user: { role: "ADMIN" } };
  const invalid = { user: { role: "CLIENT" } };
  const missing = { user: { role: undefined } };

  assert.strictEqual(normalizeRole(valid.user.role), "ADMIN");
  assert.strictEqual(hasAdminAccess(normalizeRole(invalid.user.role)), false);
  assert.strictEqual(hasAdminAccess(normalizeRole(missing.user.role)), false);
});

test("session role persists across refresh only when trusted", () => {
  const refreshedSession = { user: { role: "ADMIN" } };
  const staleSession = { user: { role: "ADMINISTRATOR" } };

  assert.strictEqual(normalizeRole(refreshedSession.user.role), "ADMIN");
  assert.strictEqual(normalizeRole(staleSession.user.role), undefined);
});

test("login redirect loop regression - no implicit fallbacks to ADMIN", () => {
  const tokenRole = undefined;
  const role = normalizeRole(tokenRole);

  assert.strictEqual(role, undefined);
  assert.strictEqual(hasAdminAccess(role), false);
});

test("middleware and server-side auth both require trusted role checks", () => {
  const middlewareRole = "ADMIN";
  const serverRole = "AGENT";

  assert.strictEqual(hasAdminAccess(middlewareRole), true);
  assert.strictEqual(hasAdminAccess(serverRole), false);
  assert.strictEqual(hasAgentAccess(serverRole), true);
});
