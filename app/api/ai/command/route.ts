export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { executeGeminiPrompt } from "@/lib/gemini";
import { logAction } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    try {
      await requireAdminSession();
    } catch (authErr: any) {
      console.warn("[Auth] /api/ai/command session check failed:", authErr?.message);
      return NextResponse.json({ 
        success: false, 
        error: "Authentication required. Please sign in as Owner (ADMIN) via NextAuth before building." 
      }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const prompt = body?.prompt;
    const systemContext = body?.systemContext;

    if (!prompt) {
      return NextResponse.json({ success: false, error: "Prompt is required" }, { status: 400 });
    }

    try {
      const resultText = await executeGeminiPrompt(
        prompt, 
        systemContext || "You are My Personal AI Business Agent for Chaurjahari & Karnali, expert in agency operations, lead generation, and software delivery."
      );
      await logAction("ai.command", JSON.stringify({ prompt: String(prompt).substring(0, 50) }));

      return NextResponse.json({ success: true, result: resultText });
    } catch (aiErr: any) {
      console.error("[AI] Gemini execution error:", aiErr?.message);
      const errorMessage = aiErr?.message?.includes("NEEDS_AUTHORIZATION")
        ? "Gemini API Key is not configured on Render. Please add GEMINI_API_KEY in Render Environment variables to enable live AI generation."
        : `AI Generation Error: ${aiErr?.message || "Upstream provider error"}`;
      
      return NextResponse.json({ 
        success: false, 
        error: errorMessage,
        needsApiKey: aiErr?.message?.includes("NEEDS_AUTHORIZATION")
      }, { status: 400 });
    }
  } catch (err: any) {
    console.error("POST /api/ai/command error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
