import { NextRequest, NextResponse } from "next/server";
import { normalizeTrustedProxyHops, resolveClientIp } from "@/lib/client-ip";
import { requestOtpLogin } from "@/lib/otp";
import { prismaOtpStore } from "@/lib/otp-store";
import { resolveMailConfig } from "@/lib/mail-config";
import {
  OtpDeliveryNotConfiguredError,
  classifyDeliveryFailure,
  logMailConfigDiagnostics,
  sendOtpEmail,
} from "@/lib/otp-email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const GENERIC_MESSAGE = "If this address is authorized, a 6-digit sign-in code has been sent.";

/**
 * Resolve the rate-limiting identity of the caller.
 *
 * Render (and other proxies) append their peer's address to X-Forwarded-For,
 * so its left side is attacker-controlled and must never be used. The trusted
 * entry is read from the right (see lib/client-ip.ts). When no trustworthy
 * address is available the request joins a single shared "untrusted" bucket
 * instead of getting a fresh, spoofable identity.
 */
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
  // Same-origin browser POSTs send Origin. Non-browser clients may omit it.
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
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

/**
 * Secret-free configuration diagnostics.
 *
 * Exists because a production deployment reported "email delivery is not
 * configured" while the dashboard showed the variables were set: the previous
 * 503 could not distinguish a missing variable, an empty one, a quoted value or
 * a name variant. This reports variable NAMES, booleans and remediation hints
 * only — never a value, address or password — and is what the running Render
 * process actually sees.
 */
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
    secure: config ? config.secure : false,
  });
}

/**
 * Issue an owner OTP. This endpoint NEVER verifies or consumes a code — that
 * happens exactly once inside the NextAuth Credentials provider.
 */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return json({ success: false, error: "Cross-origin request rejected." }, 403);
  }

  let email: unknown;
  try {
    const body = await req.json();
    email = (body as { email?: unknown })?.email;
  } catch {
    return json({ success: false, error: "Invalid request body." }, 400);
  }

  if (typeof email !== "string" || email.trim().length === 0) {
    return json({ success: false, error: "Enter a valid email address." }, 400);
  }

  // One resolver decides both the gate and the transport, so they can never
  // disagree about whether mail is configured.
  const { config: mailConfig, diagnostics: mailDiagnostics } = resolveMailConfig();

  if (!mailConfig) {
    logMailConfigDiagnostics(null, mailDiagnostics);
    const missing = mailDiagnostics.missing.length > 0 ? mailDiagnostics.missing.join(", ") : "mail credentials";
    return json(
      {
        success: false,
        error: `Email delivery is not configured on the server. Missing: ${missing}. Set GMAIL_USER and GMAIL_APP_PASSWORD (or SMTP_HOST, SMTP_USER, SMTP_PASS).`,
        missing: mailDiagnostics.missing,
      },
      503,
    );
  }

  // Surface usable-but-suspicious configuration (wrong app-password shape,
  // quoted values, invalid port) once per process. Names and hints only.
  logMailConfigDiagnostics(mailConfig, mailDiagnostics);

  try {
    const result = await requestOtpLogin({
      email,
      ip: clientIp(req),
      ownerEmail: process.env.OWNER_EMAIL,
      secret: process.env.NEXTAUTH_SECRET,
      store: prismaOtpStore,
    });

    if (result.status === "invalid_email") {
      return json({ success: false, error: "Enter a valid email address." }, 400);
    }

    if (result.status === "unavailable") {
      return json({ success: false, error: "Sign-in codes are not available on this server." }, 503);
    }

    if (result.status === "rate_limited") {
      return json(
        {
          success: false,
          error: "Too many sign-in code requests. Please wait before requesting another code.",
          retryAfterSeconds: result.retryAfterSeconds,
        },
        429,
        { "Retry-After": String(result.retryAfterSeconds) },
      );
    }

    // Only the owner address receives mail. The response is identical for any
    // address so this endpoint cannot be used to discover OWNER_EMAIL.
    if (result.deliver) {
      try {
        await sendOtpEmail({ to: result.email, code: result.code, expiresAt: result.expiresAt, config: mailConfig });
      } catch (error) {
        if (error instanceof OtpDeliveryNotConfiguredError) {
          logMailConfigDiagnostics(null);
          return json({ success: false, error: "Email delivery is not configured on the server.", missing: error.missing }, 503);
        }

        const failure = classifyDeliveryFailure(error);
        // Classification only: provider messages can quote addresses.
        console.error(`[otp] delivery failed: kind=${failure.kind} smtp=${failure.transportCode ?? "none"} name=${failure.name}`);

        const message =
          failure.kind === "auth"
            ? "The mail server rejected the stored credentials. Check the Gmail App Password (or SMTP_USER/SMTP_PASS) on the server."
            : failure.kind === "recipient"
              ? "The mail server rejected the recipient address. Check the configured sender/relay restrictions."
              : failure.kind === "timeout"
                ? "The mail server did not respond in time. Check outbound SMTP access (ports 465/587) and the host/port settings."
                : failure.kind === "connection"
                  ? "The mail server could not be reached from the server. Check SMTP_HOST/SMTP_PORT and outbound access."
                  : "Could not send the sign-in code. Check the mail server configuration.";

        return json({ success: false, error: message, reason: failure.kind, provider: mailConfig.provider }, 502);
      }
    }

    return json({
      success: true,
      message: GENERIC_MESSAGE,
      expiresInSeconds: Math.round((result.expiresAt.getTime() - Date.now()) / 1000),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "UnknownError";
    console.error("[otp] request failed:", name);
    return json({ success: false, error: "Could not create a sign-in code." }, 500);
  }
}
