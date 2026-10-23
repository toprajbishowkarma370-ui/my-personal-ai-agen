export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const pidx = url.searchParams.get("pidx");
    const status = url.searchParams.get("status");
    const purchase_order_id = url.searchParams.get("purchase_order_id");

    if (!pidx || status !== "Completed") {
      return NextResponse.redirect(new URL("/dashboard?payment=failed", req.url));
    }

    const khaltiSecret = process.env.KHALTI_SECRET_KEY;
    if (khaltiSecret) {
      // Server-side lookup verification with Khalti
      const lookupRes = await fetch("https://a.khalti.com/api/v2/epayment/lookup/", {
        method: "POST",
        headers: {
          "Authorization": `Key ${khaltiSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pidx }),
      });
      const lookupData = await lookupRes.json();
      if (!lookupRes.ok || lookupData.status !== "Completed") {
        return NextResponse.redirect(new URL("/dashboard?payment=verification_failed", req.url));
      }
    }

    if (purchase_order_id) {
      const invoice = await prisma.invoice.findUnique({ where: { id: purchase_order_id } });
      if (invoice) {
        await prisma.payment.create({
          data: {
            invoiceId: purchase_order_id,
            amount: invoice.total,
            currency: "NPR",
            method: "KHALTI",
            status: "COMPLETED",
            transactionId: pidx,
          },
        });
        await prisma.invoice.update({ where: { id: purchase_order_id }, data: { status: "PAID" } });
      }
    }

    await logAction("khalti.verify.success", JSON.stringify({ pidx, purchase_order_id }));
    return NextResponse.redirect(new URL("/dashboard?payment=success", req.url));
  } catch (err: any) {
    console.error("Khalti verify error", err);
    return NextResponse.redirect(new URL("/dashboard?payment=error", req.url));
  }
}
