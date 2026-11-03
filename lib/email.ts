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

/** Send an OTP email. Returns true if mail was queued for delivery. */
export async function sendOTPEmail(to: string, otp: string): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) {
    // SMTP not configured: do not fail the request silently in a way that leaks
    // whether the email is registered. Log nothing that reveals the OTP.
    return false;
  }

  const from = process.env.SMTP_USER;

  await transporter.sendMail({
    from,
    to,
    subject: "Your One-Time Password (OTP) - My Personal AI Business Agent",
    text: `Your OTP code is ${otp}. It expires in 5 minutes and can be used once.`,
    html: `
      <div style="font-family:sans-serif;font-size:14px;color:#111827;">
        <p>Your One-Time Password (OTP) is <strong>${otp}</strong>.</p>
        <p>It expires in <strong>5 minutes</strong> and can be used <strong>once</strong>.</p>
        <p>If you did not request this, please ignore this email.</p>
      </div>
    `,
  });

  return true;
}
