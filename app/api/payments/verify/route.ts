export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await requireAdminSession();
    const body = await req.json();
    const { paymentId, verified } = body; // verified: boolean

    if (!paymentId || verified === undefined) {
      return NextResponse.json({ success: false, error: "Missing paymentId or verification status" }, { status: 400 });
    }

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { invoice: true },
    });

    if (!payment) {
      return NextResponse.json({ success: false, error: "Payment not found" }, { status: 404 });
    }

    const newStatus = verified ? "VERIFIED" : "FAILED";
    const updatedPayment = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: newStatus,
        verifiedBy: (session as any)?.user?.email || "admin",
        verifiedAt: new Date(),
      },
    });

    if (verified) {
      // Reconcile invoice status
      const invoiceId = payment.invoiceId;
      const allPayments = await prisma.payment.findMany({
        where: { invoiceId, status: { in: ["VERIFIED", "COMPLETED"] } },
      });
      const paidSum = allPayments.reduce((acc, p) => acc + p.amount, 0);

      if (paidSum >= payment.invoice.total) {
        await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "PAID" } });
      } else {
        await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "PARTIALLY_PAID" } });
      }
    }

    await logAction("payment.verify", JSON.stringify({ paymentId, verified, verifier: (session as any)?.user?.email }));
    return NextResponse.json({ success: true, payment: updatedPayment });
  } catch (err: any) {
    console.error("POST /api/payments/verify error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
