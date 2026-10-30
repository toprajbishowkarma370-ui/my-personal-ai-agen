export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireAdminSession();
    const { invoiceId } = await req.json();
    if (!invoiceId) {
      return NextResponse.json({ success: false, error: "Invoice ID required" }, { status: 400 });
    }

    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { customer: true } });
    if (!invoice) {
      return NextResponse.json({ success: false, error: "Invoice not found" }, { status: 404 });
    }

    const merchantCode = process.env.ESEWA_MERCHANT_CODE;
    if (!merchantCode) {
      return NextResponse.json({
        success: false,
        error: "ESEWA_MERCHANT_CODE is not configured. eSewa live payment initiation requires merchant credentials.",
        sandboxScaffolding: {
          amount: invoice.total,
          tax: invoice.tax,
          totalAmount: invoice.total,
          transactionUuid: `TXN-${invoice.invoiceNumber}-${Date.now()}`,
          productCode: "EPAYTEST",
        }
      }, { status: 400 });
    }

    // eSewa ePay v2 / v3 initiation parameters
    const transactionUuid = `TXN-${invoice.invoiceNumber}-${Date.now()}`;
    const paymentData = {
      amount: invoice.subtotal,
      taxAmount: invoice.tax,
      totalAmount: invoice.total,
      transactionUuid,
      productCode: merchantCode,
      successUrl: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/payments/esewa/verify`,
      failureUrl: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/dashboard?payment=failed`,
    };

    await logAction("esewa.initiate", JSON.stringify({ invoiceId, transactionUuid, total: invoice.total }));
    return NextResponse.json({ success: true, gateway: "esewa", paymentData });
  } catch (err: any) {
    console.error("eSewa initiate error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
