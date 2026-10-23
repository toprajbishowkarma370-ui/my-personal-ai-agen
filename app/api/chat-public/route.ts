export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { executeGeminiPrompt } from "@/lib/gemini";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { message } = await req.json();
    if (!message) {
      return NextResponse.json({ success: false, error: "Message is required" }, { status: 400 });
    }

    const systemPrompt = "You are the public AI Assistant for My Personal AI Business Agent agency serving Chaurjahari Bazaar, Bheri Bridge, and Karnali Province. Be helpful, professional, and concise in English and Nepali context.";
    
    let reply = "";
    try {
      reply = await executeGeminiPrompt(message, systemPrompt);
    } catch (apiErr) {
      // Fallback response when GEMINI_API_KEY is not configured
      reply = `[Transparent Fallback AI Response]: Hello! Thank you for reaching out to My Personal AI Business Agent. We received your inquiry: "${message}". Our team in Chaurjahari & Karnali will review it shortly. (Note: Live Gemini API key is not configured in environment, so this safe fallback reply is returned).`;
    }

    return NextResponse.json({ success: true, reply });
  } catch (err: any) {
    console.error("POST /api/chat-public error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
