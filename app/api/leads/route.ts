export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdminSession();
    const leads = await prisma.lead.findMany({ orderBy: { score: "desc" } });
    return NextResponse.json({ success: true, leads, count: leads.length });
  } catch (err: any) {
    console.error("GET /api/leads error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminSession();
    const body = await req.json();
    const company = body.company?.trim();
    if (!company) {
      return NextResponse.json({ success: false, error: "Company name is required" }, { status: 400 });
    }

    // Deduplication check using normalized company name
    const normalizedCompany = company.toLowerCase().replace(/[^a-z0-9]/g, "");
    const existingLeads = await prisma.lead.findMany();
    const isDuplicate = existingLeads.some(
      (l) => l.company.toLowerCase().replace(/[^a-z0-9]/g, "") === normalizedCompany
    );

    if (isDuplicate) {
      return NextResponse.json(
        { success: false, error: "Duplicate lead detected: A lead with this normalized company name already exists." },
        { status: 400 }
      );
    }

    const created = await prisma.lead.create({ data: { ...body, company } });
    await logAction("lead.create", JSON.stringify({ id: created.id, company: created.company }));
    return NextResponse.json({ success: true, lead: created }, { status: 201 });
  } catch (err: any) {
    console.error("POST /api/leads error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAdminSession();
    const body = await req.json();
    const { id, status, category, score, notes } = body;
    if (!id) {
      return NextResponse.json({ success: false, error: "Lead id is required" }, { status: 400 });
    }

    const updateData: any = {};
    if (status !== undefined) updateData.status = status;
    if (category !== undefined) updateData.category = category;
    if (score !== undefined) updateData.score = score;
    if (notes !== undefined) updateData.notes = notes;

    const updated = await prisma.lead.update({
      where: { id },
      data: updateData,
    });

    await logAction("lead.update", JSON.stringify({ id, status: updated.status }));
    return NextResponse.json({ success: true, lead: updated });
  } catch (err: any) {
    console.error("PATCH /api/leads error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
