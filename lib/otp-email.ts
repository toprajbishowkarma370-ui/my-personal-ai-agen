import nodemailer from "nodemailer";
import { isOtpDeliveryConfigured } from "./auth-env";

/**
 * OTP delivery over Gmail (preferred) or a generic SMTP relay.
 *
 * Env vars:
 * - GMAIL_USER + GMAIL_APP_PASSWORD  -> Google Workspace / Gmail SMTP
 * - SMTP_HOST + SMTP_USER + SMTP_PASS -> any SMTP relay (optional SMTP_PORT/SMTP_FROM)
 *
 * The code itself is never logged.
 */

export class OtpDeliveryNotConfiguredError extends Error {
  constructor() {
    super("OTP email delivery is not configured");
    this.name = "OtpDeliveryNotConfiguredError";
  }
}

export { isOtpDeliveryConfigured };

function createTransport() {
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  throw new OtpDeliveryNotConfiguredError();
}

export async function sendOtpEmail(input: { to: string; code: string; expiresAt: Date }): Promise<void> {
  const transport = createTransport();
  const minutes = Math.max(1, Math.round((input.expiresAt.getTime() - Date.now()) / 60000));

  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.GMAIL_USER,
    to: input.to,
    subject: "Your owner sign-in code",
    text: [
      "Your one-time owner sign-in code is:",
      "",
      `    ${input.code}`,
      "",
      `It expires in ${minutes} minute(s) and can be used only once.`,
      "If you did not request this code, ignore this email and consider changing your password.",
    ].join("\n"),
  });
}
