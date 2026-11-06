import nodemailer from "nodemailer";
import { isOtpDeliveryConfigured } from "./auth-env";
import { formatMailDiagnostics, resolveMailConfig, type MailConfig } from "./mail-config";

/**
 * OTP delivery over Gmail (preferred) or a generic SMTP relay.
 *
 * Env vars:
 * - GMAIL_USER + GMAIL_APP_PASSWORD  -> Google Workspace / Gmail SMTP
 *   (aliases accepted: GMAIL_APP_PASS, GMAIL_PASS)
 * - SMTP_HOST + SMTP_USER + SMTP_PASS -> any SMTP relay
 *   (optional SMTP_PORT/SMTP_SECURE/SMTP_FROM; alias SMTP_PASSWORD)
 *
 * Resolution, validation and diagnostics live in `lib/mail-config.ts` so the
 * route and the transport can never disagree about whether mail is configured.
 *
 * The sign-in code itself is never logged.
 */

export class OtpDeliveryNotConfiguredError extends Error {
  readonly missing: string[];

  constructor(missing: string[] = []) {
    super(
      missing.length > 0
        ? `OTP email delivery is not configured (missing: ${missing.join(", ")})`
        : "OTP email delivery is not configured",
    );
    this.name = "OtpDeliveryNotConfiguredError";
    this.missing = missing;
  }
}

export { isOtpDeliveryConfigured };

const CONNECTION_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 20_000;

/** Minimal transport surface so tests can inject a fake without SMTP. */
export type MailTransport = {
  sendMail(message: { from: string; to: string; subject: string; text: string }): Promise<unknown>;
};

/**
 * Build the transport from resolved configuration. Explicit host/port/secure is
 * used instead of nodemailer's `service: "gmail"` so the effective settings are
 * inspectable in tests, and STARTTLS is required on port 587 so credentials are
 * never sent over a plaintext session.
 */
export function createOtpTransport(config: MailConfig): MailTransport {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTLS,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    greetingTimeout: CONNECTION_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
  });
}

export type DeliveryFailureKind = "auth" | "timeout" | "connection" | "recipient" | "unknown";

export type DeliveryFailure = {
  /** Stable, secret-free classification the route can map to a message. */
  kind: DeliveryFailureKind;
  /** Error class name (no message: SMTP errors can echo addresses). */
  name: string;
  /** SMTP/transport code such as EAUTH or ETIMEDOUT, when present. */
  transportCode?: string;
  /** SMTP numeric reply code, when the server sent one. */
  smtpCode?: number;
};

/**
 * Classify a transport error without exposing the provider message. Useful in
 * Render logs: `EAUTH` means the credential is wrong, `ETIMEDOUT`/`ESOCKET`
 * means outbound SMTP is blocked or the host/port is wrong.
 */
export function classifyDeliveryFailure(error: unknown): DeliveryFailure {
  const err = error as { code?: unknown; responseCode?: unknown } | null;
  const code = typeof err?.code === "string" ? err.code : undefined;
  const smtpCode = typeof err?.responseCode === "number" ? err.responseCode : undefined;
  const name = error instanceof Error ? error.name : "UnknownError";

  const authCodes = new Set(["EAUTH"]);
  const recipientCodes = new Set(["EENVELOPE"]);
  const timeoutCodes = new Set(["ETIMEDOUT", "ESOCKET"]);
  const connectionCodes = new Set(["ECONNECTION", "ECONNREFUSED", "EHOSTUNREACH", "ENOTFOUND", "EDNS", "ECONNRESET"]);

  let kind: DeliveryFailureKind = "unknown";
  if ((code && authCodes.has(code)) || smtpCode === 535 || smtpCode === 534 || smtpCode === 530) {
    kind = "auth";
  } else if ((code && recipientCodes.has(code)) || smtpCode === 550 || smtpCode === 553 || smtpCode === 554) {
    kind = "recipient";
  } else if (code && timeoutCodes.has(code)) {
    kind = "timeout";
  } else if (code && connectionCodes.has(code)) {
    kind = "connection";
  }

  return { kind, name, transportCode: code, smtpCode };
}

let issuesLogged = false;

/**
 * Log configuration diagnostics once per process. Contains variable names,
 * booleans and remediation hints only — never a value, address or password.
 */
export function logMailConfigDiagnostics(config: MailConfig | null, diagnostics = resolveMailConfig().diagnostics): void {
  if (issuesLogged) return;
  issuesLogged = true;

  if (!config) {
    console.warn(`[otp] email delivery not configured: ${formatMailDiagnostics(diagnostics)}`);
    return;
  }
  if (diagnostics.issues.length > 0) {
    console.warn(`[otp] email configuration warnings: ${formatMailDiagnostics(diagnostics)}`);
  }
}

/** Test hook: allow a later test in the same process to observe log output. */
export function resetMailDiagnosticsLog(): void {
  issuesLogged = false;
}

export async function sendOtpEmail(input: {
  to: string;
  code: string;
  expiresAt: Date;
  config?: MailConfig;
  transport?: MailTransport;
}): Promise<void> {
  const config = input.config ?? resolveMailConfig(process.env).config;
  if (!config) {
    throw new OtpDeliveryNotConfiguredError(resolveMailConfig(process.env).diagnostics.missing);
  }

  const transport = input.transport ?? createOtpTransport(config);
  const minutes = Math.max(1, Math.round((input.expiresAt.getTime() - Date.now()) / 60000));

  await transport.sendMail({
    from: config.from,
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
