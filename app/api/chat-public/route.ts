export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { executeAiPrompt, aiRequiresConfiguration } from "@/lib/ai-provider";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { message } = await req.json();
    if (!message) {
      return NextResponse.json({ success: false, error: "Message is required" }, { status: 400 });
    }

    const systemPrompt = "You are the public AI Assistant for My Personal AI Business Agent agency serving Chaurjahari Bazaar, Bheri Bridge, and Karnali Province. Be helpful, professional, and concise in English and Nepali context.";

    if (aiRequiresConfiguration()) {
      // Honest fallback when no AI provider is configured; never fakes a live generation.
      const reply = `[Transparent Fallback AI Response]: Hello! Thank you for reaching out to My Personal AI Business Agent. We received your inquiry: "${message}". Our team in Chaurjahari & Karnali will review it shortly. (Note: No live AI provider API key is configured in environment, so this safe fallback reply is returned).`;
      return NextResponse.json({ success: true, reply, provider: "none", fallback: true });
    }

    let reply = "";
    try {
      reply = await executeAiPrompt(message, systemPrompt);
    } catch (apiErr) {
      // If the provider errors (e.g. invalid key/rate limit), return an honest error rather than faking success.
      return NextResponse.json({ 
        success: false, 
        error: `AI Generation Error: ${apiErr?.message || "Upstream provider error"}`,
        provider: "none"
      }, { status: 400 });
    }

    return NextResponse.json({ success: true, reply, provider: "openai" });
  } catch (err: any) {
    console.error("POST /api/chat-public error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
