export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";

export const runtime = "nodejs";

// eSewa gateway callback (GET). eSewa redirects the customer's browser here after payment.
// This endpoint MUST NOT require a browser session (NextAuth cookie) because the callback
// originates from eSewa's servers, not an authenticated user session.
// It records the gateway callback as a PENDING payment and requires explicit owner
// verification via POST /api/payments/verify before any invoice is marked PAID.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const dataEncoded = url.searchParams.get("data");

    let decodedData: any = {};
    if (dataEncoded) {
      try {
        decodedData = JSON.parse(Buffer.from(dataEncoded, "base64").toString("utf-8"));
      } catch (e) {
        decodedData = Object.fromEntries(url.searchParams.entries());
      }
    } else {
      decodedData = Object.fromEntries(url.searchParams.entries());
    }

    const { transaction_uuid, total_amount, transaction_code, status } = decodedData;

    // Locate the invoice from the transaction uuid (format: TXN-<invoiceNumber>-<ts>)
    let invoice = null;
    if (transaction_uuid) {
      const invoiceNumber = String(transaction_uuid).split("-")[1];
      if (invoiceNumber) {
        invoice = await prisma.invoice.findFirst({ where: { invoiceNumber } });
      }
    }

    if (!invoice) {
      return NextResponse.redirect(new URL("/dashboard?payment=error&reason=invoice_not_found", req.url));
    }

    // Check whether a payment for this transaction already exists (idempotency)
    const existing = transaction_uuid
      ? await prisma.payment.findFirst({ where: { transactionId: transaction_uuid } })
      : null;

    if (existing) {
      return NextResponse.redirect(new URL(`/dashboard?payment=received&id=${existing.id}&status=PENDING`, req.url));
    }

    const amount = Number(total_amount) || invoice.total;

    // Record the gateway callback as PENDING. Owner must explicitly verify via
    // POST /api/payments/verify before the invoice is marked PAID. Never auto-mark PAID.
    const payment = await prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        amount,
        currency: "NPR",
        method: "ESEWA",
        status: "PENDING",
        transactionId: transaction_uuid || null,
        referenceNumber: transaction_code || null,
        evidenceMetadata: JSON.stringify({ gateway: "esewa", status, total_amount, transaction_code, transaction_uuid }),
      },
    });

    await logAction("esewa.callback", JSON.stringify({ paymentId: payment.id, invoiceId: invoice.id, transaction_uuid, status, amount }));

    return NextResponse.redirect(
      new URL(`/dashboard?payment=received&id=${payment.id}&status=PENDING&msg=Payment+received+pending+owner+verification`, req.url)
    );
  } catch (err: any) {
    console.error("eSewa verify error", err);
    return NextResponse.redirect(new URL("/dashboard?payment=error", req.url));
  }
}
