import bcrypt from "bcryptjs";
import * as crypto from "node:crypto";

// ============================================================================
// Shared constants (both branches agreed on these values)
// ============================================================================

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const RESET_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ============================================================================
// kilo/bronze-haze-kuy (PR #30) simple OTP API
// bcrypt-based hash, in-memory rate-limit map, Math.random code generation
// Used by: forgot-password/route.ts, verify-otp/route.ts
// ============================================================================

export const OTP_MAX_REQUESTS_PER_WINDOW = 5;
export const OTP_REQUEST_WINDOW_MS = 60 * 60 * 1000; // 1 hour
export const OTP_MAX_FAILED_ATTEMPTS = 5;
export const OTP_FAILED_WINDOW_MS = 60 * 60 * 1000; // 1 hour

interface RateLimitEntry {
  count: number;
  firstSeen: number;
  failed: number;
  failedFirstSeen: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

function now() {
  return Date.now();
}

function prune(entry: RateLimitEntry, ttl: number) {
  if (now() - entry.firstSeen > ttl) {
    entry.count = 0;
    entry.firstSeen = now();
  }
  if (now() - entry.failedFirstSeen > ttl) {
    entry.failed = 0;
    entry.failedFirstSeen = now();
  }
}

export function checkRateLimit(identifier: string): { allowed: boolean; reason?: string } {
  const entry = rateLimitMap.get(identifier) || { count: 0, firstSeen: now(), failed: 0, failedFirstSeen: now() };
  prune(entry, OTP_REQUEST_WINDOW_MS);
  if (entry.count >= OTP_MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, reason: "Too many OTP requests. Try again later." };
  }
  rateLimitMap.set(identifier, entry);
  return { allowed: true };
}

export function incrementRequestCount(identifier: string) {
  const entry = rateLimitMap.get(identifier) || { count: 0, firstSeen: now(), failed: 0, failedFirstSeen: now() };
  entry.count += 1;
  if (entry.count === 1) entry.firstSeen = now();
  rateLimitMap.set(identifier, entry);
}

export function checkFailedAttemptLimit(identifier: string): { allowed: boolean; reason?: string } {
  const entry = rateLimitMap.get(identifier) || { count: 0, firstSeen: now(), failed: 0, failedFirstSeen: now() };
  prune(entry, OTP_FAILED_WINDOW_MS);
  if (entry.failed >= OTP_MAX_FAILED_ATTEMPTS) {
    return { allowed: false, reason: "Too many failed attempts. Try again later." };
  }
  rateLimitMap.set(identifier, entry);
  return { allowed: true };
}

export function incrementFailedAttempt(identifier: string) {
  const entry = rateLimitMap.get(identifier) || { count: 0, firstSeen: now(), failed: 0, failedFirstSeen: now() };
  entry.failed += 1;
  if (entry.failed === 1) entry.failedFirstSeen = now();
  rateLimitMap.set(identifier, entry);
}

export function clearFailedAttempts(identifier: string) {
  const entry = rateLimitMap.get(identifier);
  if (entry) {
    entry.failed = 0;
    entry.failedFirstSeen = now();
    rateLimitMap.set(identifier, entry);
  }
}

/** Generate a 6-digit numeric OTP. */
export function generateOTP(): string {
  let otp = "";
  for (let i = 0; i < OTP_LENGTH; i += 1) {
    otp += String(Math.floor(Math.random() * 10));
  }
  return otp;
}

/** Hash an OTP for storage. */
export async function hashOTP(otp: string): Promise<string> {
  return bcrypt.hash(otp, 10);
}

/** Verify an OTP against its stored hash. */
export async function verifyOTP(otp: string, hash: string): Promise<boolean> {
  return bcrypt.compare(otp, hash);
}

/** Generate a cryptographically secure reset token. */
export function generateResetToken(): string {
  const bytes = crypto.randomBytes(32);
  return bytes.toString("hex");
}

// ============================================================================
// main advanced OTP API
// crypto keyed-HMAC, OtpStore interface, atomic issuance/verification
// Used by: lib/auth.ts, otp/request/route.ts, lib/otp-store.ts
// ============================================================================

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

export interface OtpTransaction {
  countRequestsSince(input: { email: string; ip: string | null; since: Date }): Promise<OtpRateSnapshot>;
  invalidateActive(email: string, now: Date): Promise<number>;
  create(input: {
    email: string;
    codeHash: string;
    expiresAt: Date;
    requestIp: string | null;
    createdAt: Date;
  }): Promise<OtpRecord>;
}

export interface OtpStore extends OtpTransaction {
  withLock<T>(keys: { email: string; ip: string | null }, fn: (tx: OtpTransaction) => Promise<T>): Promise<T>;
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
      deliver: boolean;
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

/** Generate a 6-digit numeric code with a cryptographically secure RNG. */
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

  return await input.store.withLock({ email, ip }, async (tx) => {
    const since = new Date(now.getTime() - OTP_RATE_WINDOW_MS);
    const rate = await tx.countRequestsSince({ email, ip, since });

    if (rate.emailCount >= OTP_MAX_REQUESTS_PER_EMAIL) {
      return { status: "rate_limited" as const, retryAfterSeconds: retryAfterSeconds(rate.oldestEmailCreatedAt, now) };
    }

    if (ip && rate.ipCount >= OTP_MAX_REQUESTS_PER_IP) {
      return { status: "rate_limited" as const, retryAfterSeconds: retryAfterSeconds(rate.oldestIpCreatedAt, now) };
    }

    const code = generateOtpCode();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

    await tx.invalidateActive(email, now);
    await tx.create({
      email,
      codeHash: hashOtpCode(code, input.secret),
      expiresAt,
      requestIp: ip,
      createdAt: now,
    });

    return {
      status: "sent" as const,
      email,
      deliver: isOwnerEmail(email, input.ownerEmail),
      code,
      expiresAt,
    };
  });
}

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

  const consumedNow = await input.store.consumeIfActive(matched.id, now);
  if (!consumedNow) {
    return { ok: false, reason: "reused" };
  }

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
