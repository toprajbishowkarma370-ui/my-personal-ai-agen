import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateOTP, hashOTP, checkRateLimit, incrementRequestCount } from "@/lib/otp";
import { sendOTPEmail } from "@/lib/email";
import { requireOwnerEmail } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body?.email ?? "").trim().toLowerCase();

    // Generic response shape: never reveal whether an email is registered.
    const genericOk = NextResponse.json({ ok: true });

    const ownerEmail = requireOwnerEmail(); // throws if OWNER_EMAIL not configured
    if (email !== ownerEmail) {
      // Do not reveal whether an arbitrary email is registered.
      return genericOk;
    }

    // Rate limit OTP requests per email to prevent abuse.
    const limit = checkRateLimit(email);
    if (!limit.allowed) {
      return NextResponse.json({ ok: false, error: limit.reason || "Too many requests." }, { status: 429 });
    }
    incrementRequestCount(email);

    const otp = generateOTP();
    const otpHash = await hashOTP(otp);
    const expires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Store the OTP hash so it can be verified server-side later.
    await prisma.verificationToken.create({
      data: {
        identifier: email,
        token: otpHash,
        expires,
      },
    });

    // Send the OTP via Resend HTTPS. Delivery failures are surfaced: we never
    // report success when the code was not actually sent.
    await sendOTPEmail(email, otp);

    return genericOk;
  } catch {
    return NextResponse.json({ ok: false, error: "Request failed." }, { status: 500 });
  }
}
