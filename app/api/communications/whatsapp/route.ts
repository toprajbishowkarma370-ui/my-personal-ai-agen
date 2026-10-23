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
    const { recipientPhone, message, leadId, outreachId } = body;

    if (!recipientPhone || !message) {
      return NextResponse.json({ success: false, error: "Recipient phone and message are required" }, { status: 400 });
    }

    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;

    if (!accessToken || !phoneId) {
      return NextResponse.json({
        success: false,
        error: "WhatsApp Business API credentials (WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_ID) are not configured.",
        sandboxScaffolding: {
          recipientPhone,
          message,
          status: "STAGED_NO_CREDENTIALS"
        }
      }, { status: 400 });
    }

    const waRes = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: recipientPhone,
        type: "text",
        text: { body: message },
      }),
    });

    const waData = await waRes.json();
    if (!waRes.ok) {
      return NextResponse.json({ success: false, error: waData?.error?.message || "WhatsApp API send failed" }, { status: 400 });
    }

    const messageId = waData?.messages?.[0]?.id || null;

    const outreach = await prisma.outreach.create({
      data: {
        channel: "WHATSAPP",
        recipient: recipientPhone,
        contentEn: message,
        status: "SENT",
        leadId: leadId || null,
      }
    });

    if (outreachId) {
      await prisma.outreach.update({
        where: { id: outreachId },
        data: { status: "SENT" }
      }).catch(() => {});
    }

    await logAction("communication.whatsapp.send", JSON.stringify({ recipientPhone, messageId }));
    return NextResponse.json({ success: true, messageId, outreachId: outreach.id });
  } catch (err: any) {
    console.error("POST /api/communications/whatsapp error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
