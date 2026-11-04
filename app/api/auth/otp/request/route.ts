import { NextRequest, NextResponse } from "next/server";
import { normalizeTrustedProxyHops, resolveClientIp } from "@/lib/client-ip";
import { requestOtpLogin } from "@/lib/otp";
import { prismaOtpStore } from "@/lib/otp-store";
import { isOtpDeliveryConfigured, sendOtpEmail } from "@/lib/otp-email";

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

  if (!isOtpDeliveryConfigured()) {
    return json(
      {
        success: false,
        error: "Email delivery is not configured on the server. Set GMAIL_USER and GMAIL_APP_PASSWORD (or SMTP_HOST, SMTP_USER, SMTP_PASS).",
      },
      503,
    );
  }

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
        await sendOtpEmail({ to: result.email, code: result.code, expiresAt: result.expiresAt });
      } catch (error) {
        const name = error instanceof Error ? error.name : "UnknownError";
        console.error("[otp] delivery failed:", name);
        return json({ success: false, error: "Could not send the sign-in code. Check the mail server configuration." }, 502);
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
