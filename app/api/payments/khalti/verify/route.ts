export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";

export const runtime = "nodejs";

// Khalti gateway callback (GET). Khalti redirects the customer's browser here after payment.
// This endpoint MUST NOT require a browser session (NextAuth cookie) because the callback
// originates from Khalti's servers, not an authenticated user session.
// It verifies the pidx with Khalti's official lookup API (when credentials are configured),
// records the payment as PENDING, and requires explicit owner verification via
// POST /api/payments/verify before any invoice is marked PAID. Never auto-mark PAID.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const pidx = url.searchParams.get("pidx");
    const status = url.searchParams.get("status");
    const purchase_order_id = url.searchParams.get("purchase_order_id");

    if (!pidx || status !== "Completed") {
      return NextResponse.redirect(new URL("/dashboard?payment=failed", req.url));
    }

    let verifiedByGateway = false;
    const khaltiSecret = process.env.KHALTI_SECRET_KEY;

    // Official Khalti verification: server-to-server lookup with the secret key.
    // This does not require a browser session.
    if (khaltiSecret) {
      try {
        const lookupRes = await fetch("https://a.khalti.com/api/v2/epayment/lookup/", {
          method: "POST",
          headers: {
            Authorization: `Key ${khaltiSecret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ pidx }),
        });
        const lookupData = await lookupRes.json();
        if (!lookupRes.ok || lookupData.status !== "Completed") {
          return NextResponse.redirect(new URL("/dashboard?payment=verification_failed", req.url));
        }
        verifiedByGateway = true;
      } catch (lookupErr) {
        console.error("Khalti lookup error", lookupErr);
        return NextResponse.redirect(new URL("/dashboard?payment=verification_failed", req.url));
      }
    }

    if (!purchase_order_id) {
      return NextResponse.redirect(new URL("/dashboard?payment=error&reason=missing_order", req.url));
    }

    const invoice = await prisma.invoice.findUnique({ where: { id: purchase_order_id } });
    if (!invoice) {
      return NextResponse.redirect(new URL("/dashboard?payment=error&reason=invoice_not_found", req.url));
    }

    // Idempotency: do not create duplicate payments for the same pidx
    const existing = await prisma.payment.findFirst({ where: { transactionId: pidx } });
    if (existing) {
      return NextResponse.redirect(new URL(`/dashboard?payment=received&id=${existing.id}&status=PENDING`, req.url));
    }

    // Record as PENDING. Owner must explicitly verify via POST /api/payments/verify before PAID.
    const payment = await prisma.payment.create({
      data: {
        invoiceId: purchase_order_id,
        amount: invoice.total,
        currency: "NPR",
        method: "KHALTI",
        status: "PENDING",
        transactionId: pidx,
        evidenceMetadata: JSON.stringify({ gateway: "khalti", status, pidx, purchase_order_id, verifiedByGateway }),
      },
    });

    await logAction("khalti.callback", JSON.stringify({ paymentId: payment.id, invoiceId: purchase_order_id, pidx, verifiedByGateway }));

    return NextResponse.redirect(
      new URL(`/dashboard?payment=received&id=${payment.id}&status=PENDING&msg=Payment+received+pending+owner+verification`, req.url)
    );
  } catch (err: any) {
    console.error("Khalti verify error", err);
    return NextResponse.redirect(new URL("/dashboard?payment=error", req.url));
  }
}
