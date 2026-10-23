export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdminSession();
    const approvals = await prisma.approval.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json({ success: true, approvals, count: approvals.length });
  } catch (err: any) {
    console.error("GET /api/approvals error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminSession();
    const body = await req.json();
    const created = await prisma.approval.create({ data: body });
    await logAction("approval.create", JSON.stringify({ id: created.id, title: created.title }));
    return NextResponse.json({ success: true, approval: created }, { status: 201 });
  } catch (err: any) {
    console.error("POST /api/approvals error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireAdminSession();
    const body = await req.json();
    const { id, status } = body;
    if (!id || !status) {
      return NextResponse.json({ success: false, error: "Missing id or status" }, { status: 400 });
    }
    const updated = await prisma.approval.update({
      where: { id },
      data: {
        status,
        approvedBy: (session as any)?.user?.email || "admin",
        approvedAt: new Date(),
      },
    });
    await logAction("approval.update", JSON.stringify({ id, status }));
    return NextResponse.json({ success: true, approval: updated });
  } catch (err: any) {
    console.error("PATCH /api/approvals error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
