/**
 * Authentication environment validation.
 *
 * Kept dependency-free so the rules can be exercised directly by the test
 * runner. `lib/auth.ts` supplies the base required-variable list.
 *
 * OWNER_PASSWORD_HASH is OPTIONAL: either the owner password or an OTP email
 * channel must be configured, but both are not required.
 */

export type AuthEnv = Record<string, string | undefined>;

export function isGmailOtpConfigured(env: AuthEnv = process.env): boolean {
  return Boolean(env.GMAIL_USER && env.GMAIL_APP_PASSWORD);
}

export function isSmtpOtpConfigured(env: AuthEnv = process.env): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

/** True when OTP codes can actually be delivered to the owner. */
export function isOtpDeliveryConfigured(env: AuthEnv = process.env): boolean {
  return isGmailOtpConfigured(env) || isSmtpOtpConfigured(env);
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
  const missing = baseRequired.filter((name) => !env[name]);

  if (!env.OWNER_PASSWORD_HASH && !isOtpDeliveryConfigured(env)) {
    missing.push("OWNER_PASSWORD_HASH or GMAIL_USER/GMAIL_APP_PASSWORD");
  }

  return missing;
}
