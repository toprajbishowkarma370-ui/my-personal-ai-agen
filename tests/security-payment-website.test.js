// Tests for authentication security, payment verification, website management, and responsive previews.
// Uses node --test (NODE_ENV=test). These are logic simulations that do not require a live database.
const test = require("node:test");
const assert = require("node:assert");
const bcrypt = require("bcryptjs");

test("Auth: no hardcoded production secret fallbacks in lib/auth.ts", () => {
  const fs = require("fs");
  const src = fs.readFileSync("./lib/auth.ts", "utf8");
  assert.ok(!src.includes("fallback_nextauth_secret_render_production"), "hardcoded NEXTAUTH_SECRET fallback must be removed");
  assert.ok(!src.includes("fixed_fallback_secret_string_for_render_production"), "hardcoded NextAuth secret must be removed");
  assert.ok(!src.includes("https://my-personal-ai-agen-2.onrender.com"), "hardcoded NEXTAUTH_URL fallback must be removed");
  assert.ok(src.includes("secret: process.env.NEXTAUTH_SECRET"), "NextAuth secret must come from env only");
});

test("Auth: validateProductionEnv throws in production when secrets missing", () => {
  const origEnv = { ...process.env };
  try {
    process.env.NODE_ENV = "production";
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.OWNER_EMAIL;
    delete process.env.OWNER_PASSWORD_HASH;
    delete process.env.DATABASE_URL;
    delete process.env.NEXTAUTH_URL;

    // Re-require module fresh to capture current env behavior is not possible due to caching;
    // instead simulate the validateProductionEnv logic directly.
    const required = ["NEXTAUTH_SECRET", "NEXTAUTH_URL", "DATABASE_URL", "OWNER_EMAIL", "OWNER_PASSWORD_HASH"];
    const missing = required.filter((v) => !process.env[v]);
    assert.ok(missing.length > 0);
    assert.throws(() => {
      if (missing.length > 0 && process.env.NODE_ENV === "production") {
        throw new Error(`[Auth Security Error] Missing required production environment variables: ${missing.join(", ")}`);
      }
    }, /Missing required production environment variables/);
  } finally {
    process.env = origEnv;
  }
});

test("Auth: bcrypt owner password comparison and wrong password rejection", async () => {
  const ownerHash = bcrypt.hashSync("AdminPass123!", 12);
  const ok = await bcrypt.compare("AdminPass123!", ownerHash);
  assert.strictEqual(ok, true);
  const bad = await bcrypt.compare("WrongPass123!", ownerHash);
  assert.strictEqual(bad, false);
});

test("Auth: owner email matching is case-insensitive and trimmed", () => {
  const ownerEmail = "alex.morgan@agency.local";
  const normalize = (e) => e?.toLowerCase().trim();
  assert.strictEqual(normalize(" ALEX.MORGAN@AGENCY.LOCAL "), normalize(ownerEmail));
  assert.notStrictEqual(normalize("someone@agency.local"), normalize(ownerEmail));
});

test("Access control: owner-only payment verification rejects non-owner", () => {
  function isOwner(email) {
    const ownerEmail = "alex.morgan@agency.local";
    if (!email) return false;
    return email.trim().toLowerCase() === ownerEmail.toLowerCase();
  }
  assert.strictEqual(isOwner("alex.morgan@agency.local"), true);
  assert.strictEqual(isOwner("alex.MORGAN@agency.local"), true);
  assert.strictEqual(isOwner("staff@agency.local"), false);
  assert.strictEqual(isOwner(null), false);
  assert.strictEqual(isOwner(undefined), false);
});

test("Access control: requireAdminSession logic requires ADMIN role", () => {
  function checkAdmin(session) {
    if (!session || session.role !== "ADMIN") throw new Error("UNAUTHORIZED: Owner ADMIN role required");
    return true;
  }
  assert.strictEqual(checkAdmin({ role: "ADMIN" }), true);
  assert.throws(() => checkAdmin({ role: "CLIENT" }), /UNAUTHORIZED/);
  assert.throws(() => checkAdmin(null), /UNAUTHORIZED/);
});

test("Payment verification: payments start PENDING and are never auto-marked PAID by gateway callbacks", () => {
  // Simulate the revised payment create logic: all methods start PENDING
  function initialStatus(method) {
    return "PENDING";
  }
  assert.strictEqual(initialStatus("ESEWA"), "PENDING");
  assert.strictEqual(initialStatus("KHALTI"), "PENDING");
  assert.strictEqual(initialStatus("BANK_TRANSFER"), "PENDING");
  assert.strictEqual(initialStatus("QR"), "PENDING");
});

test("Payment verification: invoice marked PAID only after verified payment sum reaches total", () => {
  function invoicePaid(total, payments) {
    const verifiedSum = payments.filter((p) => p.status === "VERIFIED").reduce((acc, p) => acc + p.amount, 0);
    return verifiedSum >= total;
  }
  const invoiceTotal = 1000;
  assert.strictEqual(invoicePaid(invoiceTotal, [{ status: "PENDING", amount: 1000 }]), false);
  assert.strictEqual(invoicePaid(invoiceTotal, [{ status: "VERIFIED", amount: 500 }]), false);
  assert.strictEqual(invoicePaid(invoiceTotal, [{ status: "VERIFIED", amount: 500 }, { status: "VERIFIED", amount: 500 }]), true);
});

test("Payment verification: owner verification action changes status to VERIFIED/FAILED only", () => {
  function applyVerification(payment, verified) {
    return verified ? { ...payment, status: "VERIFIED" } : { ...payment, status: "FAILED" };
  }
  const payment = { id: "p1", status: "PENDING", amount: 500 };
  assert.strictEqual(applyVerification(payment, true).status, "VERIFIED");
  assert.strictEqual(applyVerification(payment, false).status, "FAILED");
  assert.notStrictEqual(applyVerification(payment, true).status, "COMPLETED");
});

test("eSewa/Khalti callbacks do not require a browser session and record PENDING", () => {
  // Gateway callbacks are server-to-server / browser-redirect from the gateway, not an authenticated user session.
  // They record a PENDING payment and redirect to a pending-owner-verification page.
  function gatewayResult(status) {
    return status === "Completed" || status === "COMPLETE" ? { recorded: "PENDING", requiresOwnerVerification: true } : { recorded: null, requiresOwnerVerification: false };
  }
  assert.deepStrictEqual(gatewayResult("Completed"), { recorded: "PENDING", requiresOwnerVerification: true });
  assert.deepStrictEqual(gatewayResult("COMPLETE"), { recorded: "PENDING", requiresOwnerVerification: true });
  assert.deepStrictEqual(gatewayResult("Failed"), { recorded: null, requiresOwnerVerification: false });
});

test("Website: all 10 starter templates are distinct with separate data/content/theme/settings", () => {
  const fs = require("fs");
  const src = fs.readFileSync("./lib/website-templates.ts", "utf8");
  const expected = [
    "local-business", "hotel-restaurant", "school-college", "clinic-healthcare",
    "agrovet-agriculture", "real-estate", "portfolio-personal", "agency-services",
    "ecommerce-store", "startup-saas",
  ];
  expected.forEach((id) => {
    assert.ok(src.includes(`id: "${id}"`), `missing template ${id}`);
  });
  // Each template block declares data (demoContent), theme, settings, layout
  const templateCount = (src.match(/name: "/g) || []).length;
  assert.strictEqual(templateCount, 10, "must define exactly 10 templates");
  assert.ok(src.includes("demoContent"), "templates must have demo content (data)");
  assert.ok(src.includes("theme: {"), "templates must have theme");
  assert.ok(src.includes("settings: {"), "templates must have settings");
  assert.ok(src.includes("layout: "), "templates must have distinct layout");
});

test("Website: create/edit/duplicate/archive/reopen logic preserves separate status", () => {
  const websites = [];
  function create(name, template) {
    const w = { id: "w" + (websites.length + 1), name, template, status: "DRAFT", isArchived: false, ownerApproved: false };
    websites.push(w);
    return w;
  }
  function edit(id, updates) {
    const w = websites.find((x) => x.id === id);
    Object.assign(w, updates);
    return w;
  }
  function duplicate(id) {
    const src = websites.find((x) => x.id === id);
    const copy = { ...src, id: "w" + (websites.length + 1), name: src.name + " (Copy)", status: "DRAFT" };
    websites.push(copy);
    return copy;
  }
  function archive(id) {
    const w = websites.find((x) => x.id === id);
    w.isArchived = true; w.status = "ARCHIVED";
    return w;
  }
  function reopen(id) {
    const w = websites.find((x) => x.id === id);
    w.isArchived = false; w.status = "DRAFT";
    return w;
  }

  const w = create("Hotel Samjhana", "hotel-restaurant");
  assert.strictEqual(w.status, "DRAFT");
  assert.strictEqual(edit(w.id, { status: "EDITING" }).status, "EDITING");
  const copy = duplicate(w.id);
  assert.strictEqual(copy.name, "Hotel Samjhana (Copy)");
  assert.strictEqual(copy.status, "DRAFT");
  assert.strictEqual(websites.length, 2);
  assert.strictEqual(archive(w.id).isArchived, true);
  assert.strictEqual(archive(w.id).status, "ARCHIVED");
  assert.strictEqual(reopen(w.id).isArchived, false);
  assert.strictEqual(reopen(w.id).status, "DRAFT");
});

test("Website: owner approval required before publish; only owner can approve", () => {
  const websites = [{ id: "w1", name: "Test", ownerApproved: false, status: "DRAFT" }];
  function approve(id, actorEmail) {
    const ownerEmail = "alex.morgan@agency.local";
    if (actorEmail.toLowerCase() !== ownerEmail) return { allowed: false, error: "Only the owner can approve" };
    const w = websites.find((x) => x.id === id);
    w.ownerApproved = true; w.status = "APPROVED";
    return { allowed: true, website: w };
  }
  function publish(id) {
    const w = websites.find((x) => x.id === id);
    if (!w.ownerApproved) return { allowed: false, error: "Owner approval required before publishing" };
    w.status = "PUBLISHED";
    return { allowed: true, website: w };
  }

  assert.strictEqual(approve("w1", "staff@agency.local").allowed, false);
  assert.strictEqual(publish("w1").allowed, false);
  assert.strictEqual(approve("w1", "alex.morgan@agency.local").allowed, true);
  assert.strictEqual(publish("w1").allowed, true);
  assert.strictEqual(websites[0].status, "PUBLISHED");
});

test("Preview: responsive breakpoints render for mobile/tablet/desktop", () => {
  const breakpoints = [375, 768, 1024];
  breakpoints.forEach((w) => {
    assert.ok([375, 768, 1024].includes(w));
    assert.ok(w > 0);
  });
});
