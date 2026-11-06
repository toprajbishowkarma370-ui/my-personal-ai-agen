import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyOTP, generateResetToken, checkFailedAttemptLimit, incrementFailedAttempt, clearFailedAttempts } from "@/lib/otp";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const otp = String(body?.otp ?? "");

    if (!email || !otp) {
      return NextResponse.json({ ok: false, error: "Email and OTP are required." }, { status: 400 });
    }

    const limit = checkFailedAttemptLimit(email);
    if (!limit.allowed) {
      return NextResponse.json({ ok: false, error: limit.reason || "Too many failed attempts." }, { status: 429 });
    }

    const record = await prisma.verificationToken.findFirst({
      where: { identifier: email },
    });

    if (!record) {
      incrementFailedAttempt(email);
      return NextResponse.json({ ok: false, error: "Invalid or expired OTP." }, { status: 400 });
    }

    if (record.expires < new Date()) {
      incrementFailedAttempt(email);
      await prisma.verificationToken.delete({ where: { identifier: email, token: record.token } });
      return NextResponse.json({ ok: false, error: "OTP has expired." }, { status: 400 });
    }

    const valid = await verifyOTP(otp, record.token);
    if (!valid) {
      incrementFailedAttempt(email);
      return NextResponse.json({ ok: false, error: "Invalid OTP." }, { status: 400 });
    }

    // OTP verified: single-use. Consume it and issue a short-lived reset token.
    await prisma.verificationToken.delete({ where: { identifier: email, token: record.token } });
    clearFailedAttempts(email);

    const resetToken = generateResetToken();
    await prisma.verificationToken.create({
      data: {
        identifier: `reset:${email}`,
        token: resetToken,
        expires: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      },
    });

    return NextResponse.json({ ok: true, resetToken });
  } catch {
    return NextResponse.json({ ok: false, error: "Verification failed." }, { status: 500 });
  }
}
