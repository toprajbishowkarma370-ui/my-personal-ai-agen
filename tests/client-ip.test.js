// Client IP resolution tests: the rate limiter must never trust a value the
// caller can choose (the left side of X-Forwarded-For).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { loadTsModule } = require("./helpers/load-ts");

const clientIp = loadTsModule(path.join(__dirname, "../lib/client-ip.ts"));
const ROUTE_SOURCE = fs.readFileSync(path.join(__dirname, "../app/api/auth/otp/request/route.ts"), "utf8");

test("a spoofed leftmost X-Forwarded-For entry is ignored; the proxy-appended entry wins", () => {
  // Render appends the real client to whatever the client sent.
  assert.strictEqual(
    clientIp.resolveClientIp({ forwardedFor: "9.9.9.9, 203.0.113.7", trustedProxyHops: 1 }),
    "203.0.113.7",
  );
  assert.strictEqual(
    clientIp.resolveClientIp({ forwardedFor: "1.2.3.4, 5.6.7.8, 198.51.100.20", trustedProxyHops: 1 }),
    "198.51.100.20",
  );
  // Even a long attacker-supplied chain cannot displace the trusted entry.
  assert.strictEqual(
    clientIp.resolveClientIp({ forwardedFor: "10.0.0.1, 10.0.0.2, 10.0.0.3, 203.0.113.9", trustedProxyHops: 1 }),
    "203.0.113.9",
  );
});

test("a single-entry header (proxy replaces the header) resolves correctly", () => {
  assert.strictEqual(clientIp.resolveClientIp({ forwardedFor: "203.0.113.7", trustedProxyHops: 1 }), "203.0.113.7");
  assert.strictEqual(clientIp.resolveClientIp({ forwardedFor: "  203.0.113.7  " }), "203.0.113.7");
});

test("multi-proxy deployments read the hop that matches the configured count", () => {
  // e.g. Cloudflare -> Render -> app: the client sits two entries from the right.
  assert.strictEqual(
    clientIp.resolveClientIp({ forwardedFor: "6.6.6.6, 203.0.113.7, 172.16.0.9", trustedProxyHops: 2 }),
    "203.0.113.7",
  );
  // Not enough hops: fail closed rather than falling back to a spoofable value.
  assert.strictEqual(clientIp.resolveClientIp({ forwardedFor: "203.0.113.7", trustedProxyHops: 2 }), null);
  assert.strictEqual(clientIp.resolveClientIp({ forwardedFor: "", trustedProxyHops: 1 }), null);
});

test("trustedProxyHops=0 trusts no forwarding header at all", () => {
  assert.strictEqual(clientIp.resolveClientIp({ forwardedFor: "203.0.113.7", trustedProxyHops: 0 }), null);
  assert.strictEqual(clientIp.resolveClientIp({ forwardedFor: "203.0.113.7", realIp: "203.0.113.7", trustedProxyHops: 0 }), null);
});

test("garbage and spoof attempts fail closed instead of creating a new bucket", () => {
  for (const value of ["not-an-ip", "999.1.1.1", "<script>", "203.0.113.7, not-an-ip", "::not::ip", ""]) {
    assert.strictEqual(
      clientIp.resolveClientIp({ forwardedFor: value, trustedProxyHops: 1 }),
      null,
      `"${value}" must not resolve to a usable client identity`,
    );
  }
  // Header exists but is unusable: do not silently fall back to x-real-ip.
  assert.strictEqual(clientIp.resolveClientIp({ forwardedFor: "garbage", realIp: "203.0.113.7", trustedProxyHops: 1 }), null);
});

test("IPv4 with port, bracketed IPv6 and bare IPv6 are parsed", () => {
  assert.strictEqual(clientIp.resolveClientIp({ forwardedFor: "203.0.113.7:51234", trustedProxyHops: 1 }), "203.0.113.7");
  assert.strictEqual(clientIp.resolveClientIp({ forwardedFor: "[2001:db8::1]:443", trustedProxyHops: 1 }), "2001:db8::1");
  assert.strictEqual(clientIp.resolveClientIp({ forwardedFor: "2001:db8::2", trustedProxyHops: 1 }), "2001:db8::2");
  assert.strictEqual(clientIp.resolveClientIp({ forwardedFor: "[2001:db8::3]", trustedProxyHops: 1 }), "2001:db8::3");
});

test("x-real-ip is only used when there is no forwarded chain", () => {
  assert.strictEqual(clientIp.resolveClientIp({ realIp: "198.51.100.5" }), "198.51.100.5");
  assert.strictEqual(clientIp.resolveClientIp({ realIp: "garbage" }), null);
  assert.strictEqual(clientIp.resolveClientIp({}), null);
});

test("TRUSTED_PROXY_HOPS parsing is bounded and defaults safely", () => {
  assert.strictEqual(clientIp.normalizeTrustedProxyHops(undefined), 1);
  assert.strictEqual(clientIp.normalizeTrustedProxyHops(null), 1);
  assert.strictEqual(clientIp.normalizeTrustedProxyHops(""), 1);
  assert.strictEqual(clientIp.normalizeTrustedProxyHops("0"), 0);
  assert.strictEqual(clientIp.normalizeTrustedProxyHops("2"), 2);
  assert.strictEqual(clientIp.normalizeTrustedProxyHops(2), 2);
  for (const bad of ["-1", "abc", "1.5", "9", "  ", Infinity, NaN]) {
    assert.strictEqual(clientIp.normalizeTrustedProxyHops(bad), 1, `${String(bad)} must fall back to the default`);
  }
});

test("the OTP endpoint uses the hardened resolver and never the leftmost entry", () => {
  assert.match(ROUTE_SOURCE, /resolveClientIp\(/);
  assert.match(ROUTE_SOURCE, /TRUSTED_PROXY_HOPS/);
  assert.ok(!ROUTE_SOURCE.includes('split(",")[0]'), "must not read the spoofable leftmost X-Forwarded-For entry");
  assert.ok(!ROUTE_SOURCE.includes('headers.get("x-forwarded-for")?.split'), "raw forwarding parsing must not bypass the resolver");
  assert.match(ROUTE_SOURCE, /resolved \?\? "untrusted"/, "unknown callers share one conservative bucket");
});
