import { isIP } from "node:net";

/**
 * Client IP resolution for rate limiting behind a reverse proxy.
 *
 * X-Forwarded-For is attacker-controlled on the left: a client may send
 * `X-Forwarded-For: 9.9.9.9` and proxies (Render included) append/keep entries.
 * The only position that a client cannot freely choose is the entry added by
 * your own proxy, which sits on the RIGHT. We therefore read the Nth entry
 * counted from the right and never the leftmost one.
 *
 * TRUSTED_PROXY_HOPS = number of proxies in front of the app (default 1, i.e.
 * the rightmost entry is the client; set 2 for e.g. Cloudflare + Render).
 * 0 means "no trusted proxy": forwarding headers are ignored, which makes every
 * such request share one conservative rate-limit bucket instead of trusting a
 * spoofable value.
 *
 * The result is always validated with node:net isIP; anything unparseable
 * yields null so callers can fall back to a shared bucket.
 */

export const DEFAULT_TRUSTED_PROXY_HOPS = 1;
const MAX_CHAIN_ENTRIES = 32;

function parseCandidate(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  let candidate = raw.trim();
  if (!candidate) return null;

  // [2001:db8::1]:443 -> 2001:db8::1
  if (candidate.startsWith("[")) {
    const end = candidate.indexOf("]");
    if (end === -1) return null;
    candidate = candidate.slice(1, end);
  } else if (isIP(candidate) === 0) {
    // 203.0.113.7:443 -> 203.0.113.7 (IPv4 with port). Bare IPv6 is left as is.
    const parts = candidate.split(":");
    if (parts.length === 2 && isIP(parts[0]) === 4) {
      candidate = parts[0];
    }
  }

  return isIP(candidate) ? candidate : null;
}

export function normalizeTrustedProxyHops(raw: unknown): number {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return DEFAULT_TRUSTED_PROXY_HOPS;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 5) {
    return DEFAULT_TRUSTED_PROXY_HOPS;
  }
  return value;
}

export function resolveClientIp(input: {
  forwardedFor?: string | null;
  realIp?: string | null;
  trustedProxyHops?: number;
}): string | null {
  const hops = input.trustedProxyHops === undefined
    ? DEFAULT_TRUSTED_PROXY_HOPS
    : normalizeTrustedProxyHops(input.trustedProxyHops);

  // Without a trusted proxy there is no trustworthy forwarding information.
  if (hops === 0) return null;

  const chain = (input.forwardedFor ?? "")
    .split(",")
    .slice(-MAX_CHAIN_ENTRIES)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (chain.length > 0) {
    const index = chain.length - hops;
    // Not enough hops for the configured trust level: fail closed.
    if (index < 0) return null;
    return parseCandidate(chain[index]);
  }

  // x-real-ip is only consulted when no forwarded chain exists at all.
  return parseCandidate(input.realIp);
}
