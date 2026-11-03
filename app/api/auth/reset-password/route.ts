import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const resetToken = String(body?.resetToken ?? "");
    const newPassword = String(body?.newPassword ?? "");

    if (!resetToken || !newPassword) {
      return NextResponse.json({ ok: false, error: "Reset token and new password are required." }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ ok: false, error: "New password must be at least 8 characters." }, { status: 400 });
    }

    const record = await prisma.verificationToken.findFirst({
      where: {
        token: resetToken,
        identifier: { startsWith: "reset:" },
      },
    });

    if (!record) {
      return NextResponse.json({ ok: false, error: "Invalid or expired reset token." }, { status: 400 });
    }

    if (record.expires < new Date()) {
      await prisma.verificationToken.delete({ where: { identifier: record.identifier, token: record.token } });
      return NextResponse.json({ ok: false, error: "Reset token has expired." }, { status: 400 });
    }

    const email = record.identifier.replace(/^reset:/, "").toLowerCase();
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Upsert the owner's password hash in the database. This is the source of
    // truth for password-based login when OWNER_PASSWORD_HASH env is not set; it
    // also serves as the fallback when the env hash does not match.
    await prisma.user.upsert({
      where: { email },
      update: { passwordHash },
      create: { email, passwordHash, role: "ADMIN" },
    });

    // Single-use: consume the reset token.
    await prisma.verificationToken.delete({ where: { identifier: record.identifier, token: record.token } });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Password reset failed." }, { status: 500 });
  }
}
