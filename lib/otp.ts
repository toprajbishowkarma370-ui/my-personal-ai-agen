import crypto from "node:crypto";

/**
 * Owner OTP (one-time passcode) login domain logic.
 *
 * This module is intentionally dependency-free (node:crypto only) so the exact
 * production rules can be exercised by the Node test runner. Persistence is
 * injected through `OtpStore`; `lib/otp-store.ts` provides the Prisma-backed
 * implementation used by the NextAuth Credentials provider.
 *
 * Security rules enforced here:
 * - 6-digit codes generated with a CSPRNG (uniform, leading zeros preserved)
 * - only a keyed HMAC-SHA256 digest of the code is persisted (never plaintext)
 * - 5 minute expiry
 * - exactly one successful verification per code (atomic consumption)
 * - replay of an already-consumed code is rejected
 * - per-email / per-IP request rate limiting and a bounded guess budget
 * - ADMIN-only: only OWNER_EMAIL can ever obtain a session
 */

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RATE_WINDOW_MS = 10 * 60 * 1000;
export const OTP_MAX_REQUESTS_PER_EMAIL = 3;
export const OTP_MAX_REQUESTS_PER_IP = 10;
export const OTP_MAX_CODE_LENGTH = 12;

/** Stable user id for the single owner account (matches the password login path). */
export const OWNER_USER_ID = "owner_admin_01";

export type OwnerRole = "ADMIN";

export type OtpRecord = {
  id: string;
  email: string;
  codeHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  attempts: number;
  createdAt: Date;
};

export type OtpRateSnapshot = {
  emailCount: number;
  ipCount: number;
  oldestEmailCreatedAt: Date | null;
  oldestIpCreatedAt: Date | null;
};

/**
 * Persistence contract for the OTP flow. Implementations MUST make
 * `consumeIfActive` atomic (a single conditional UPDATE) so two concurrent
 * verifications cannot both succeed for the same code.
 */
export interface OtpStore {
  countRequestsSince(input: { email: string; ip: string | null; since: Date }): Promise<OtpRateSnapshot>;
  invalidateActive(email: string, now: Date): Promise<number>;
  create(input: {
    email: string;
    codeHash: string;
    expiresAt: Date;
    requestIp: string | null;
    createdAt: Date;
  }): Promise<OtpRecord>;
  findActive(email: string, now: Date): Promise<OtpRecord[]>;
  findLatestUnconsumed(email: string): Promise<OtpRecord | null>;
  findConsumedByHash(email: string, codeHash: string): Promise<OtpRecord | null>;
  incrementAttempts(id: string, now: Date): Promise<number>;
  consumeIfActive(id: string, now: Date): Promise<boolean>;
}

export type OtpRequestResult =
  | {
      status: "sent";
      email: string;
      /** True only when the address is OWNER_EMAIL and delivery is configured. */
      deliver: boolean;
      /** Plaintext code, handed to the mailer only. Never serialized to HTTP. */
      code: string;
      expiresAt: Date;
    }
  | { status: "rate_limited"; retryAfterSeconds: number }
  | { status: "invalid_email" }
  | { status: "unavailable" };

export type OtpFailureReason = "invalid" | "expired" | "reused" | "locked" | "unavailable";

export type OtpVerifyResult =
  | {
      ok: true;
      user: { id: string; email: string; name: string; role: OwnerRole };
    }
  | { ok: false; reason: OtpFailureReason };

export function normalizeEmail(email: unknown): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function isValidEmail(email: string): boolean {
  if (!email || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isOwnerEmail(email: string, ownerEmail: string | null | undefined): boolean {
  const owner = normalizeEmail(ownerEmail);
  return Boolean(owner) && email === owner;
}

/**
 * Generate a 6-digit numeric code with a cryptographically secure RNG.
 * `randomInt` is injectable for deterministic tests only.
 */
export function generateOtpCode(randomInt: (min: number, max: number) => number = crypto.randomInt): string {
  const value = randomInt(0, 10 ** OTP_LENGTH);
  if (!Number.isInteger(value) || value < 0 || value >= 10 ** OTP_LENGTH) {
    throw new Error("OTP generator produced an out-of-range value");
  }
  return String(value).padStart(OTP_LENGTH, "0");
}

function otpKey(secret: string | null | undefined): Buffer {
  if (!secret || secret.length < 16) {
    throw new Error("OTP hashing secret is not configured");
  }
  return Buffer.from(secret, "utf8");
}

/**
 * Keyed digest of a code. A database leak alone cannot reveal pending codes
 * without NEXTAUTH_SECRET, and the digest is not reversible.
 */
export function hashOtpCode(code: string, secret: string | null | undefined): string {
  return crypto.createHmac("sha256", otpKey(secret)).update(`owner-otp:${String(code).trim()}`).digest("hex");
}

export function verifyOtpHash(code: string, storedHash: unknown, secret: string | null | undefined): boolean {
  if (typeof storedHash !== "string" || storedHash.length === 0) return false;
  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = Buffer.from(storedHash, "hex");
    actual = Buffer.from(hashOtpCode(code, secret), "hex");
  } catch {
    return false;
  }
  if (expected.length === 0 || expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

function normalizeCode(code: unknown): string | null {
  if (typeof code !== "string") return null;
  const trimmed = code.replace(/\s+/g, "");
  if (trimmed.length > OTP_MAX_CODE_LENGTH) return null;
  return /^\d{6}$/.test(trimmed) ? trimmed : null;
}

function retryAfterSeconds(oldest: Date | null, now: Date): number {
  if (!oldest) return Math.ceil(OTP_RATE_WINDOW_MS / 1000);
  const remaining = oldest.getTime() + OTP_RATE_WINDOW_MS - now.getTime();
  return Math.max(1, Math.ceil(remaining / 1000));
}

/**
 * Issue a new OTP. A new request invalidates any earlier active code so only
 * one code can ever be valid for an address.
 *
 * The result is identical for owner and non-owner addresses (aside from the
 * internal `deliver` flag) so the endpoint cannot be used to enumerate the
 * owner account.
 */
export async function requestOtpLogin(input: {
  email: unknown;
  ip?: string | null;
  ownerEmail?: string | null;
  secret?: string | null;
  now?: Date;
  store: OtpStore;
}): Promise<OtpRequestResult> {
  const now = input.now ?? new Date();
  const email = normalizeEmail(input.email);
  const ip = typeof input.ip === "string" && input.ip.length > 0 ? input.ip : null;

  if (!isValidEmail(email)) {
    return { status: "invalid_email" };
  }

  if (!input.secret) {
    return { status: "unavailable" };
  }

  const since = new Date(now.getTime() - OTP_RATE_WINDOW_MS);
  const rate = await input.store.countRequestsSince({ email, ip, since });

  if (rate.emailCount >= OTP_MAX_REQUESTS_PER_EMAIL) {
    return { status: "rate_limited", retryAfterSeconds: retryAfterSeconds(rate.oldestEmailCreatedAt, now) };
  }

  if (ip && rate.ipCount >= OTP_MAX_REQUESTS_PER_IP) {
    return { status: "rate_limited", retryAfterSeconds: retryAfterSeconds(rate.oldestIpCreatedAt, now) };
  }

  const code = generateOtpCode();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

  await input.store.invalidateActive(email, now);
  await input.store.create({
    email,
    codeHash: hashOtpCode(code, input.secret),
    expiresAt,
    requestIp: ip,
    createdAt: now,
  });

  return {
    status: "sent",
    email,
    deliver: isOwnerEmail(email, input.ownerEmail),
    code,
    expiresAt,
  };
}

/**
 * Verify and consume an OTP exactly once. Callers must treat every failure
 * reason as the same generic "invalid or expired code" for the end user.
 */
export async function verifyOtpLogin(input: {
  email: unknown;
  code: unknown;
  ownerEmail?: string | null;
  secret?: string | null;
  now?: Date;
  store: OtpStore;
}): Promise<OtpVerifyResult> {
  const now = input.now ?? new Date();
  const email = normalizeEmail(input.email);
  const code = normalizeCode(input.code);

  if (!input.secret) {
    return { ok: false, reason: "unavailable" };
  }
  if (!isValidEmail(email) || !code) {
    return { ok: false, reason: "invalid" };
  }

  // ADMIN-only: never read or consume state for a non-owner address.
  if (!isOwnerEmail(email, input.ownerEmail)) {
    return { ok: false, reason: "invalid" };
  }

  let codeHash: string;
  try {
    codeHash = hashOtpCode(code, input.secret);
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  const active = await input.store.findActive(email, now);
  let matched: OtpRecord | null = null;
  let lockedCandidate: OtpRecord | null = null;

  for (const record of active) {
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      if (!lockedCandidate) lockedCandidate = record;
      continue;
    }
    // Compare every candidate without short-circuiting on the first mismatch.
    const isMatch = verifyOtpHash(code, record.codeHash, input.secret);
    if (isMatch && !matched) {
      matched = record;
    }
  }

  if (!matched) {
    if (active.length > 0) {
      const newest = active.reduce((latest, record) => (record.createdAt > latest.createdAt ? record : latest), active[0]);
      const attempts = await input.store.incrementAttempts(newest.id, now);
      if (attempts >= OTP_MAX_ATTEMPTS) {
        return { ok: false, reason: "locked" };
      }
      return { ok: false, reason: "invalid" };
    }

    if (lockedCandidate) {
      return { ok: false, reason: "locked" };
    }

    // Replay detection: the exact code was already used successfully.
    const consumed = await input.store.findConsumedByHash(email, codeHash);
    if (consumed) {
      return { ok: false, reason: "reused" };
    }

    const latest = await input.store.findLatestUnconsumed(email);
    if (latest && latest.expiresAt.getTime() <= now.getTime()) {
      return { ok: false, reason: "expired" };
    }

    return { ok: false, reason: "invalid" };
  }

  // Atomic single-use consumption. If another request consumed it first this
  // returns false and the replay is rejected.
  const consumedNow = await input.store.consumeIfActive(matched.id, now);
  if (!consumedNow) {
    return { ok: false, reason: "reused" };
  }

  // Defence in depth: no other code for this address may remain valid.
  await input.store.invalidateActive(email, now);

  return {
    ok: true,
    user: {
      id: OWNER_USER_ID,
      email,
      name: "Owner Admin",
      role: "ADMIN",
    },
  };
}
