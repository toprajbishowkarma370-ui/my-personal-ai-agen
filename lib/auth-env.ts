/**
 * Authentication environment validation.
 *
 * Kept dependency-free so the rules can be exercised directly by the test
 * runner. `lib/auth.ts` supplies the base required-variable list.
 *
 * OWNER_PASSWORD_HASH is OPTIONAL: either the owner password or an OTP email
 * channel must be configured, but both are not required. OTP email delivery
 * uses the Resend HTTPS API (port 443); SMTP is never used because Render free
 * web services block outbound SMTP ports 25, 465 and 587.
 */

export type AuthEnv = Record<string, string | undefined>;

/** A blank or whitespace-only value is not usable configuration. */
function cleanEnvValue(raw: string | undefined): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/^\uFEFF/, "").trim();
}

export function isResendConfigured(env: AuthEnv = process.env): boolean {
  const apiKey = cleanEnvValue(env.RESEND_API_KEY);
  const from = cleanEnvValue(env.EMAIL_FROM);
  return apiKey.length > 0 && from.length > 0;
}

/** True when OTP codes can actually be delivered to the owner. */
export function isOtpDeliveryConfigured(env: AuthEnv = process.env): boolean {
  return isResendConfigured(env);
}

/** True when the legacy owner password login is usable. */
export function isPasswordLoginConfigured(env: AuthEnv = process.env): boolean {
  return Boolean(cleanEnvValue(env.OWNER_EMAIL) && cleanEnvValue(env.OWNER_PASSWORD_HASH));
}

/** At least one owner login method must be configured. */
export function isAnyOwnerLoginConfigured(env: AuthEnv = process.env): boolean {
  return isPasswordLoginConfigured(env) || isOtpDeliveryConfigured(env);
}

/**
 * Returns the list of missing required variables. The password hash is only
 * required when no OTP delivery channel exists, so OTP-only deployments are
 * valid without OWNER_PASSWORD_HASH when Resend is configured.
 */
export function findMissingAuthEnv(baseRequired: readonly string[], env: AuthEnv = process.env): string[] {
  const missing = baseRequired.filter((name) => cleanEnvValue(env[name]).length === 0);

  if (cleanEnvValue(env.OWNER_PASSWORD_HASH).length === 0 && !isOtpDeliveryConfigured(env)) {
    missing.push("OWNER_PASSWORD_HASH or RESEND_API_KEY/EMAIL_FROM");
  }

  return missing;
}
