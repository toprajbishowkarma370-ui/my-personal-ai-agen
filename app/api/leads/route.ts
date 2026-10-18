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
    const created = await prisma.lead.create({ data: body });
    await logAction("lead.create", JSON.stringify({ id: created.id, company: created.company }));
    return NextResponse.json({ success: true, lead: created }, { status: 201 });
  } catch (err: any) {
    console.error("POST /api/leads error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
