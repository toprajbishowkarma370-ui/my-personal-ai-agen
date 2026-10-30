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

    const khaltiSecret = process.env.KHALTI_SECRET_KEY;
    if (!khaltiSecret) {
      return NextResponse.json({
        success: false,
        error: "KHALTI_SECRET_KEY is not configured. Live Khalti payment requires merchant credentials.",
        sandboxScaffolding: {
          amount: Math.round(invoice.total * 100), // paisa
          purchase_order_id: invoice.id,
          purchase_order_name: invoice.title,
        }
      }, { status: 400 });
    }

    // Khalti ePayment initiation API call
    const payload = {
      return_url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/payments/khalti/verify`,
      website_url: process.env.NEXTAUTH_URL || 'http://localhost:3000',
      amount: Math.round(invoice.total * 100), // convert to paisa
      purchase_order_id: invoice.id,
      purchase_order_name: invoice.title,
      customer_info: {
        name: invoice.customer.name,
        email: invoice.customer.email || "client@agency.local",
        phone: invoice.customer.phone || "9800000000",
      }
    };

    const khaltiRes = await fetch("https://a.khalti.com/api/v2/epayment/initiate/", {
      method: "POST",
      headers: {
        "Authorization": `Key ${khaltiSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const khaltiData = await khaltiRes.json();
    if (!khaltiRes.ok) {
      return NextResponse.json({ success: false, error: khaltiData?.detail || "Khalti initiation failed" }, { status: 400 });
    }

    await logAction("khalti.initiate", JSON.stringify({ invoiceId, pidx: khaltiData.pidx }));
    return NextResponse.json({ success: true, gateway: "khalti", paymentUrl: khaltiData.payment_url, pidx: khaltiData.pidx });
  } catch (err: any) {
    console.error("Khalti initiate error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
