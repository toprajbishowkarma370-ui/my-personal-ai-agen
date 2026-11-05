import { NextRequest, NextResponse } from "next/server";
import { normalizeTrustedProxyHops, resolveClientIp } from "@/lib/client-ip";
import { requestOtpLogin } from "@/lib/otp";
import { prismaOtpStore } from "@/lib/otp-store";
import { resolveOtpEmailConfig as resolveMailConfig } from "@/lib/otp-email-config";
import {
  OtpDeliveryNotConfiguredError,
  classifyDeliveryFailure,
  logMailConfigDiagnostics,
  sendOtpEmail,
} from "@/lib/otp-email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const GENERIC_MESSAGE = "If this address is authorized, a 6-digit sign-in code has been sent.";

function clientIp(req: NextRequest): string {
  const resolved = resolveClientIp({
    forwardedFor: req.headers.get("x-forwarded-for"),
    realIp: req.headers.get("x-real-ip"),
    trustedProxyHops: normalizeTrustedProxyHops(process.env.TRUSTED_PROXY_HOPS),
  });
  return resolved ?? "untrusted";
}

function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host;
    const requestHost = req.headers.get("x-forwarded-host") || req.headers.get("host");
    return Boolean(requestHost) && originHost === requestHost;
  } catch {
    return false;
  }
}

function json(body: Record<string, unknown>, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/** Safe configuration diagnostics: only names, flags and provider are returned. */
export async function GET() {
  const { config, diagnostics } = resolveMailConfig();
  return json({
    success: diagnostics.configured,
    configured: diagnostics.configured,
    provider: diagnostics.provider,
    missing: diagnostics.missing,
    present: diagnostics.present,
    usedVars: diagnostics.usedVars,
    issues: diagnostics.issues,
    secure: config && (config.provider === "gmail" || config.provider === "smtp") ? config.secure : false,
  });
}

/** OTP creation, expiry, rate limits, and verification remain in the auth service. */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return json({ success: false, error: "Cross-origin request rejected." }, 403);

  let email: unknown;
  try {
    const body = await req.json();
    email = (body as { email?: unknown })?.email;
  } catch {
    return json({ success: false, error: "Invalid request body." }, 400);
  }
  if (typeof email !== "string" || email.trim().length === 0) return json({ success: false, error: "Enter a valid email address." }, 400);

  const { config: mailConfig, diagnostics: mailDiagnostics } = resolveMailConfig();
  if (!mailConfig) {
    logMailConfigDiagnostics(null, mailDiagnostics);
    const missing = mailDiagnostics.missing.length ? mailDiagnostics.missing.join(", ") : "mail credentials";
    return json({ success: false, error: `Email delivery is not configured on the server. Missing: ${missing}.`, missing: mailDiagnostics.missing }, 503);
  }
  logMailConfigDiagnostics(mailConfig, mailDiagnostics);

  try {
    const result = await requestOtpLogin({
      email,
      ip: clientIp(req),
      ownerEmail: process.env.OWNER_EMAIL,
      secret: process.env.NEXTAUTH_SECRET,
      store: prismaOtpStore,
    });
    if (result.status === "invalid_email") return json({ success: false, error: "Enter a valid email address." }, 400);
    if (result.status === "unavailable") return json({ success: false, error: "Sign-in codes are not available on this server." }, 503);
    if (result.status === "rate_limited") {
      return json({ success: false, error: "Too many sign-in code requests. Please wait before requesting another code.", retryAfterSeconds: result.retryAfterSeconds }, 429, { "Retry-After": String(result.retryAfterSeconds) });
    }

    if (result.deliver) {
      try {
        await sendOtpEmail({ to: result.email, code: result.code, expiresAt: result.expiresAt, config: mailConfig });
      } catch (error) {
        if (error instanceof OtpDeliveryNotConfiguredError) {
          logMailConfigDiagnostics(null);
          return json({ success: false, error: "Email delivery is not configured on the server.", missing: error.missing }, 503);
        }
        const failure = classifyDeliveryFailure(error);
        console.error(`[otp] delivery failed: kind=${failure.kind} code=${failure.transportCode ?? "none"} name=${failure.name}`);
        const message = failure.kind === "auth"
          ? (mailConfig.provider === "resend" ? "The email API rejected its credentials. Check RESEND_API_KEY." : "The mail server rejected the stored credentials. Check the Gmail App Password or SMTP credentials.")
          : failure.kind === "recipient"
            ? "The email provider rejected the recipient or sender address. Check the sender domain and recipient restrictions."
            : failure.kind === "timeout"
              ? "The email provider did not respond before the request timed out."
              : failure.kind === "connection"
                ? "The email provider could not be reached. Check the provider configuration and outbound access."
                : "Could not send the sign-in code. Check the email provider configuration.";
        return json({ success: false, error: message, reason: failure.kind, provider: mailConfig.provider }, 502);
      }
    }

    return json({ success: true, message: GENERIC_MESSAGE, expiresInSeconds: Math.round((result.expiresAt.getTime() - Date.now()) / 1000) });
  } catch (error) {
    const name = error instanceof Error ? error.name : "UnknownError";
    console.error("[otp] request failed:", name);
    return json({ success: false, error: "Could not create a sign-in code." }, 500);
  }
}
