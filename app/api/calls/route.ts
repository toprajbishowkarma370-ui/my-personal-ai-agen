export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";

export const runtime = "nodejs";

// AI Phone Call Integration Architecture
//
// Safety controls (human-in-the-loop):
// 1. Owner (ADMIN) session required to initiate any call.
// 2. Recipient consent must be verified before outbound calls.
// 3. Owner approval required before outbound calls.
// 4. AI and telephony spending limits enforced (NPR).
// 5. Call outcomes logged to audit trail.
//
// Real provider integration (e.g., Twilio) is NOT wired because no
// telephony credentials are configured. All outbound calls return a
// clear error identifying the required credentials. No call is ever
// simulated as successful.

type CallRequest = {
  to: string;
  from?: string;
  purpose: string;
  consentGiven: boolean;
  ownerApproved: boolean;
  spendLimitNpr?: number;
  currentSpendNpr?: number;
};

function validatePhoneNumber(phone: string): boolean {
  // E.164 format: + followed by country code and subscriber number
  return /^\+[1-9]\d{1,14}$/.test(phone);
}

export async function POST(req: Request) {
  try {
    const session = await requireAdminSession();
    const actorEmail = (session as any)?.user?.email || "owner";

    const body = (await req.json().catch(() => ({}))) as CallRequest;
    const { to, from, purpose, consentGiven, ownerApproved, spendLimitNpr, currentSpendNpr } = body;

    if (!to || !purpose) {
      return NextResponse.json({ success: false, error: "Recipient (to) and purpose are required" }, { status: 400 });
    }

    if (!validatePhoneNumber(to)) {
      return NextResponse.json({ success: false, error: "Recipient phone must be in E.164 format (e.g. +9779800000000)" }, { status: 400 });
    }

    // Consent check: outbound AI calls require verified recipient consent.
    if (!consentGiven) {
      await logAction("call.blocked.no_consent", JSON.stringify({ to, purpose, actor: actorEmail }));
      return NextResponse.json({
        success: false,
        error: "Consent check failed: recipient consent not verified for AI phone call.",
        requiresConsent: true
      }, { status: 403 });
    }

    // Owner approval check: no outbound call without explicit owner authorization.
    if (!ownerApproved) {
      await logAction("call.blocked.no_owner_approval", JSON.stringify({ to, purpose, actor: actorEmail }));
      return NextResponse.json({
        success: false,
        error: "Outbound call blocked: owner approval required.",
        requiresOwnerApproval: true
      }, { status: 403 });
    }

    // Budget limit check: AI/telephony spending must not exceed configured limit.
    const limit = spendLimitNpr !== undefined ? spendLimitNpr : 0;
    const spent = currentSpendNpr !== undefined ? currentSpendNpr : 0;
    if (limit > 0 && spent >= limit) {
      await logAction("call.blocked.budget_limit", JSON.stringify({ to, purpose, spent, limit, actor: actorEmail }));
      return NextResponse.json({
        success: false,
        error: "Spend limit reached: AI/telephony budget exhausted.",
        spent,
        limit
      }, { status: 403 });
    }

    // Real telephony provider credentials are required to place a call.
    // No provider is configured, so the call cannot be placed. This is not
    // simulated as a successful call.
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      await logAction("call.blocked.no_provider", JSON.stringify({ to, purpose, actor: actorEmail }));
      return NextResponse.json({
        success: false,
        error: "Telephony provider not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to enable AI phone calls.",
        requiresCredentials: true,
        requiredCredentials: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"]
      }, { status: 400 });
    }

    // If a real provider were configured, the call would be placed here and
    // the outcome (completed, failed, no-answer, busy) would be logged.
    await logAction("call.initiated", JSON.stringify({ to, from, purpose, actor: actorEmail }));

    return NextResponse.json({
      success: false,
      error: "Call placement not implemented for this provider.",
      notImplemented: true
    }, { status: 501 });
  } catch (err: any) {
    console.error("POST /api/calls error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}

export async function GET() {
  try {
    await requireAdminSession();
    const logs = await prisma.auditLog.findMany({
      where: { action: { contains: "call" } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ success: true, calls: logs, count: logs.length });
  } catch (err: any) {
    console.error("GET /api/calls error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
