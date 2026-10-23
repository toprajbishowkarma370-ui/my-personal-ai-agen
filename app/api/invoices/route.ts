export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdminSession();
    const invoices = await prisma.invoice.findMany({
      include: { customer: true, payments: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ success: true, invoices, count: invoices.length });
  } catch (err: any) {
    console.error("GET /api/invoices error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminSession();
    const body = await req.json();
    const { customerId, leadId, title, items, subtotal, tax = 0, total, dueDate, notes, currency = "NPR" } = body;

    if (!customerId || !title || !items || subtotal === undefined || total === undefined || !dueDate) {
      return NextResponse.json({ success: false, error: "Missing required invoice fields" }, { status: 400 });
    }

    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        customerId,
        leadId: leadId || null,
        title,
        items: typeof items === "string" ? items : JSON.stringify(items),
        currency,
        subtotal: Number(subtotal),
        tax: Number(tax),
        total: Number(total),
        dueDate: new Date(dueDate),
        status: "ISSUED",
        notes: notes || null,
      },
      include: { customer: true },
    });

    await logAction("invoice.create", JSON.stringify({ id: invoice.id, invoiceNumber, total }));
    return NextResponse.json({ success: true, invoice }, { status: 201 });
  } catch (err: any) {
    console.error("POST /api/invoices error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
