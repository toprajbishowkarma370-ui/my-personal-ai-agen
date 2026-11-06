/**
 * Authentication environment validation.
 *
 * Kept dependency-free so the rules can be exercised directly by the test
 * runner. `lib/auth.ts` supplies the base required-variable list.
 *
 * OWNER_PASSWORD_HASH is OPTIONAL: either the owner password or an OTP email
 * channel must be configured, but both are not required.
 */

import { cleanEnvValue, resolveMailConfig } from "./mail-config";

export type AuthEnv = Record<string, string | undefined>;

/**
 * Delivery checks delegate to `lib/mail-config.ts`, which trims values, strips
 * copy/paste quotes and accepts the documented aliases. Keeping one resolver
 * means the login gate and the transport can never disagree about whether mail
 * is configured.
 */
export function isGmailOtpConfigured(env: AuthEnv = process.env): boolean {
  return resolveMailConfig(env).config?.provider === "gmail";
}

export function isSmtpOtpConfigured(env: AuthEnv = process.env): boolean {
  return resolveMailConfig(env).config?.provider === "smtp";
}

/** True when OTP codes can actually be delivered to the owner. */
export function isOtpDeliveryConfigured(env: AuthEnv = process.env): boolean {
  return resolveMailConfig(env).config !== null;
}

/** True when the legacy owner password login is usable. */
export function isPasswordLoginConfigured(env: AuthEnv = process.env): boolean {
  return Boolean(env.OWNER_EMAIL && env.OWNER_PASSWORD_HASH);
}

/** At least one owner login method must be configured. */
export function isAnyOwnerLoginConfigured(env: AuthEnv = process.env): boolean {
  return isPasswordLoginConfigured(env) || isOtpDeliveryConfigured(env);
}

/**
 * Returns the list of missing required variables. The password hash is only
 * required when no OTP delivery channel exists, so OTP-only deployments are
 * valid without OWNER_PASSWORD_HASH.
 */
export function findMissingAuthEnv(baseRequired: readonly string[], env: AuthEnv = process.env): string[] {
  // A blank or whitespace-only value is not usable configuration.
  const missing = baseRequired.filter((name) => cleanEnvValue(env[name]).length === 0);

  if (cleanEnvValue(env.OWNER_PASSWORD_HASH).length === 0 && !isOtpDeliveryConfigured(env)) {
    missing.push("OWNER_PASSWORD_HASH or GMAIL_USER/GMAIL_APP_PASSWORD");
  }

  return missing;
}
