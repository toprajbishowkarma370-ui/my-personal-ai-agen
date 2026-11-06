export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdminSession();
    const outreaches = await prisma.outreach.findMany({
      include: { lead: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ success: true, outreaches, count: outreaches.length });
  } catch (err: any) {
    console.error("GET /api/outreach error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminSession();
    const body = await req.json();
    const { channel = "EMAIL", recipient, subjectNp, subjectEn, contentNp, contentEn, status = "STAGED", leadId } = body;

    if (!recipient) {
      return NextResponse.json({ success: false, error: "Recipient is required" }, { status: 400 });
    }

    const created = await prisma.outreach.create({
      data: {
        channel,
        recipient,
        subjectNp: subjectNp || null,
        subjectEn: subjectEn || null,
        contentNp: contentNp || null,
        contentEn: contentEn || null,
        status,
        leadId: leadId || null,
      },
    });

    await logAction("outreach.create", JSON.stringify({ id: created.id, channel: created.channel, recipient: created.recipient, status: created.status }));
    return NextResponse.json({ success: true, outreach: created }, { status: 201 });
  } catch (err: any) {
    console.error("POST /api/outreach error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireAdminSession();
    const body = await req.json();
    const { id, status, subjectNp, subjectEn, contentNp, contentEn, channel } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "Outreach id is required" }, { status: 400 });
    }

    const outreach = await prisma.outreach.findUnique({ where: { id } });
    if (!outreach) {
      return NextResponse.json({ success: false, error: "Outreach not found" }, { status: 404 });
    }

    const updated = await prisma.outreach.update({
      where: { id },
      data: {
        ...(channel !== undefined ? { channel } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(subjectNp !== undefined ? { subjectNp } : {}),
        ...(subjectEn !== undefined ? { subjectEn } : {}),
        ...(contentNp !== undefined ? { contentNp } : {}),
        ...(contentEn !== undefined ? { contentEn } : {}),
      },
    });

    await logAction("outreach.update", JSON.stringify({ id: updated.id, status: updated.status }));
    return NextResponse.json({ success: true, outreach: updated });
  } catch (err: any) {
    console.error("PATCH /api/outreach error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
