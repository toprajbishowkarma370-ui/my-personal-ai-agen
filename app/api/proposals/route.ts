export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdminSession();
    const proposals = await prisma.proposal.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json({ success: true, proposals, count: proposals.length });
  } catch (err: any) {
    console.error("GET /api/proposals error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminSession();
    const body = await req.json();
    const { title, content, value, status = "DRAFT" } = body;

    if (!title || !content) {
      return NextResponse.json({ success: false, error: "Title and content are required" }, { status: 400 });
    }

    const created = await prisma.proposal.create({
      data: {
        title,
        content,
        value: value !== undefined ? Number(value) : null,
        status,
      },
    });

    await logAction("proposal.create", JSON.stringify({ id: created.id, title: created.title, status: created.status }));
    return NextResponse.json({ success: true, proposal: created }, { status: 201 });
  } catch (err: any) {
    console.error("POST /api/proposals error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireAdminSession();
    const body = await req.json();
    const { id, status, title, content, value } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "Proposal id is required" }, { status: 400 });
    }

    const proposal = await prisma.proposal.findUnique({ where: { id } });
    if (!proposal) {
      return NextResponse.json({ success: false, error: "Proposal not found" }, { status: 404 });
    }

    const updated = await prisma.proposal.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(content !== undefined ? { content } : {}),
        ...(value !== undefined ? { value: Number(value) } : {}),
        ...(status !== undefined ? { status } : {}),
      },
    });

    await logAction("proposal.update", JSON.stringify({ id: updated.id, status: updated.status, approvedBy: (session as any)?.user?.email }));
    return NextResponse.json({ success: true, proposal: updated });
  } catch (err: any) {
    console.error("PATCH /api/proposals error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
