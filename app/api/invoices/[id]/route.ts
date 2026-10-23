export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdminSession();
    const invoice = await prisma.invoice.findUnique({
      where: { id: params.id },
      include: { customer: true, payments: true, lead: true },
    });
    if (!invoice) {
      return NextResponse.json({ success: false, error: "Invoice not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, invoice });
  } catch (err: any) {
    console.error("GET /api/invoices/[id] error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdminSession();
    const body = await req.json();
    const { status, notes } = body;

    const invoice = await prisma.invoice.update({
      where: { id: params.id },
      data: {
        ...(status ? { status } : {}),
        ...(notes !== undefined ? { notes } : {}),
      },
      include: { customer: true, payments: true },
    });

    await logAction("invoice.update", JSON.stringify({ id: invoice.id, status: invoice.status }));
    return NextResponse.json({ success: true, invoice });
  } catch (err: any) {
    console.error("PATCH /api/invoices/[id] error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
