export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { password, setupToken } = body;

    const expectedToken = process.env.SETUP_RESET_TOKEN || process.env.NEXTAUTH_SECRET;
    if (!expectedToken || setupToken !== expectedToken) {
      return NextResponse.json({ success: false, error: "Unauthorized. Invalid setupToken." }, { status: 401 });
    }

    if (!password || password.length < 12) {
      return NextResponse.json({ success: false, error: "Password must be at least 12 characters." }, { status: 400 });
    }

    const salt = bcrypt.genSaltSync(12);
    const hash = bcrypt.hashSync(password, salt);

    return NextResponse.json({
      success: true,
      message: "Hash generated successfully. Copy it and set as OWNER_PASSWORD_HASH in Render environment variables.",
      OWNER_PASSWORD_HASH: hash
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
