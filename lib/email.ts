import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host,
      port: Number(port),
      secure: port === "465",
      auth: { user, pass },
    });
  }
  return transporter;
}

function getResendConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return null;
  }
  return { apiKey, from };
}

function emailHtml(otp: string): string {
  return `
    <div style="font-family:sans-serif;font-size:14px;color:#111827;">
      <p>Your One-Time Password (OTP) is <strong>${otp}</strong>.</p>
      <p>It expires in <strong>5 minutes</strong> and can be used <strong>once</strong>.</p>
      <p>If you did not request this, please ignore this email.</p>
    </div>
  `;
}

/** Send an OTP email. Returns true if mail was queued for delivery. */
export async function sendOTPEmail(to: string, otp: string): Promise<boolean> {
  // Try Resend HTTPS API first
  const resendConfig = getResendConfig();
  if (resendConfig) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendConfig.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: resendConfig.from,
          to,
          subject: "Your One-Time Password (OTP) - My Personal AI Business Agent",
          html: emailHtml(otp),
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        return true;
      }
      // Fall through to SMTP on failure
    } catch {
      // Fall through to SMTP on network error (including AbortError from timeout)
    }
  }

  // Fallback to SMTP
  const transporter = getTransporter();
  if (!transporter) {
    return false;
  }

  const from = process.env.SMTP_USER;
  await transporter.sendMail({
    from,
    to,
    subject: "Your One-Time Password (OTP) - My Personal AI Business Agent",
    text: `Your OTP code is ${otp}. It expires in 5 minutes and can be used once.`,
    html: emailHtml(otp),
  });

  return true;
}
