import { requireResendConfig } from "./email";

const RESEND_API_URL = "https://api.resend.com/emails";

/**
 * OTP delivery over the Resend HTTPS API (port 443).
 *
 * Render free web services block outbound SMTP ports 25, 465 and 587, so SMTP
 * is never used. Delivery requires RESEND_API_KEY and EMAIL_FROM.
 *
 * The sign-in code itself is never logged.
 */

export class OtpDeliveryNotConfiguredError extends Error {
  readonly missing: string[];

  constructor(missing: string[] = []) {
    super(
      missing.length > 0
        ? `OTP email delivery is not configured (missing: ${missing.join(", ")})`
        : "OTP Email delivery is not configured",
    );
    this.name = "OtpDeliveryNotConfiguredError";
    this.missing = missing;
  }
}

/** Resolve and validate the Resend sender configuration. Throws if incomplete. */
function requiredResendEnv() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const missing: string[] = [];
  if (!apiKey) missing.push("RESEND_API_KEY");
  if (!from) missing.push("EMAIL_FROM");
  if (missing.length > 0) {
    throw new OtpDeliveryNotConfiguredError(missing);
  }
  return { apiKey, from };
}

function emailText(code: string, minutes: number): string {
  return [
    "Your one-time owner sign-in code is:",
    "",
    `    ${code}`,
    "",
    `It expires in ${minutes} minute(s) and can be used only once.`,
    "If you did not request this code, ignore this email and consider changing your password.",
  ].join("\n");
}

/**
 * Send an OTP email via the Resend HTTPS API (port 443).
 *
 * Resolves only when Resend accepts the message. Rejects on any delivery or
 * configuration failure — it never reports success when delivery did not happen.
 * SMTP is never attempted.
 */
export async function sendOtpEmail(input: {
  to: string;
  code: string;
  expiresAt: Date;
}): Promise<void> {
  const { apiKey, from } = requiredResendEnv();

  const minutes = Math.max(1, Math.round((input.expiresAt.getTime() - Date.now()) / 60000));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: "Your owner sign-in code",
        text: emailText(input.code, minutes),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      let detail = "";
      try {
        const body = await res.json();
        detail = body.message || JSON.stringify(body);
      } catch {
        detail = res.statusText;
      }
      throw new Error(`Resend API rejected the message (${res.status}): ${detail}`);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}
