export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdminSession();
    const customers = await prisma.customer.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json({ success: true, customers, count: customers.length });
  } catch (err: any) {
    console.error("GET /api/customers error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminSession();
    const body = await req.json();
    const created = await prisma.customer.create({ data: body });
    await logAction("customer.create", JSON.stringify({ id: created.id, name: created.name }));
    return NextResponse.json({ success: true, customer: created }, { status: 201 });
  } catch (err: any) {
    console.error("POST /api/customers error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
