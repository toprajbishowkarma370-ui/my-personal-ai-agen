export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdminSession();
    const payments = await prisma.payment.findMany({
      include: { invoice: { include: { customer: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ success: true, payments, count: payments.length });
  } catch (err: any) {
    console.error("GET /api/payments error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminSession();
    const body = await req.json();
    const { invoiceId, amount, method, referenceNumber, evidenceMetadata, currency = "NPR" } = body;

    if (!invoiceId || amount === undefined || !method) {
      return NextResponse.json({ success: false, error: "Missing required payment fields" }, { status: 400 });
    }

    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) {
      return NextResponse.json({ success: false, error: "Invoice not found" }, { status: 404 });
    }

    // All payments start as PENDING and require owner verification before marking invoice PAID.
    // Never auto-mark an invoice PAID without explicit owner verification.
    const payment = await prisma.payment.create({
      data: {
        invoiceId,
        amount: Number(amount),
        currency,
        method,
        status: "PENDING",
        referenceNumber: referenceNumber || null,
        evidenceMetadata: evidenceMetadata ? JSON.stringify(evidenceMetadata) : null,
      },
    });

    await logAction("payment.create", JSON.stringify({ id: payment.id, invoiceId, amount, method, status: "PENDING" }));
    return NextResponse.json({ success: true, payment }, { status: 201 });
  } catch (err: any) {
    console.error("POST /api/payments error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
