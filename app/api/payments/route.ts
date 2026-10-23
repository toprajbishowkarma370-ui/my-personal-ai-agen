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
    const body = await req.json();
    const { invoiceId, amount, method, referenceNumber, evidenceMetadata, currency = "NPR" } = body;

    if (!invoiceId || amount === undefined || !method) {
      return NextResponse.json({ success: false, error: "Missing required payment fields" }, { status: 400 });
    }

    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) {
      return NextResponse.json({ success: false, error: "Invoice not found" }, { status: 404 });
    }

    // Bank transfers start as PENDING verification; online gateways might be COMPLETED
    const initialStatus = method === "BANK_TRANSFER" ? "PENDING" : "COMPLETED";

    const payment = await prisma.payment.create({
      data: {
        invoiceId,
        amount: Number(amount),
        currency,
        method,
        status: initialStatus,
        referenceNumber: referenceNumber || null,
        evidenceMetadata: evidenceMetadata ? JSON.stringify(evidenceMetadata) : null,
      },
    });

    if (initialStatus === "COMPLETED" && method !== "BANK_TRANSFER") {
      // Check if invoice is fully paid
      const allPayments = await prisma.payment.findMany({ where: { invoiceId, status: "COMPLETED" } });
      const paidSum = allPayments.reduce((acc, p) => acc + p.amount, 0) + Number(amount);
      if (paidSum >= invoice.total) {
        await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "PAID" } });
      } else {
        await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "PARTIALLY_PAID" } });
      }
    }

    await logAction("payment.create", JSON.stringify({ id: payment.id, invoiceId, amount, method, status: initialStatus }));
    return NextResponse.json({ success: true, payment }, { status: 201 });
  } catch (err: any) {
    console.error("POST /api/payments error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
