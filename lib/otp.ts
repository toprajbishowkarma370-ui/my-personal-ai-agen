import bcrypt from "bcryptjs";
import * as crypto from "node:crypto";

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const RESET_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Rate limiting thresholds (per email / identifier)
export const OTP_MAX_REQUESTS_PER_WINDOW = 5;      // max OTP requests per window
export const OTP_REQUEST_WINDOW_MS = 60 * 60 * 1000; // 1 hour
export const OTP_MAX_FAILED_ATTEMPTS = 5;          // max failed verify attempts per window
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
