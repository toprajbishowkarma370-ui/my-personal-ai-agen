const RESEND_API_URL = "https://api.resend.com/emails";

function emailHtml(otp: string): string {
  return `
    <div style="font-family:sans-serif;font-size:14px;color:#111827;">
      <p>Your One-Time Password (OTP) is <strong>${otp}</strong>.</p>
      <p>It expires in <strong>5 minutes</strong> and can be used <strong>once</strong>.</p>
      <p>If you did not request this, please ignore this email.</p>
    </div>
  `;
}

/** Required Render environment variables for Resend email delivery. */
export const REQUIRED_RESEND_ENV = ["RESEND_API_KEY", "EMAIL_FROM"] as const;

export function requireResendConfig(): { apiKey: string; from: string } {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error(
      "Resend email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM in Render environment variables.",
    );
  }
  return { apiKey, from };
}

/**
 * Send an OTP email via the Resend HTTPS API (port 443).
 *
 * Resolves only when Resend accepts the message. Rejects on any delivery or
 * configuration failure — it never reports success when delivery did not happen.
 * SMTP is never attempted: Render free web services block outbound SMTP ports
 * 25, 465 and 587.
 */
export async function sendOTPEmail(to: string, otp: string): Promise<boolean> {
  const { apiKey, from } = requireResendConfig();

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
        to,
        subject: "Your One-Time Password (OTP) - My Personal AI Business Agent",
        html: emailHtml(otp),
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

    return true;
  } finally {
    clearTimeout(timeoutId);
  }
}
