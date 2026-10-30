export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { executeAiPrompt, aiRequiresConfiguration, getConfiguredProviderLabel } from "@/lib/ai-provider";
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

    if (aiRequiresConfiguration()) {
      return NextResponse.json({ 
        success: false, 
        error: "No AI provider is configured on the server. Set OPENAI_API_KEY (recommended) or GEMINI_API_KEY in Render Environment variables to enable live AI generation.",
        needsApiKey: true
      }, { status: 400 });
    }

    try {
      const provider = getConfiguredProviderLabel();
      const resultText = await executeAiPrompt(
        prompt, 
        systemContext || "You are My Personal AI Business Agent for Chaurjahari & Karnali, expert in agency operations, lead generation, and software delivery."
      );
      await logAction("ai.command", JSON.stringify({ provider, prompt: String(prompt).substring(0, 50) }));

      return NextResponse.json({ success: true, result: resultText, provider });
    } catch (aiErr: any) {
      console.error("[AI] AI execution error:", aiErr?.message);
      const needsKey = aiErr?.message?.includes("NEEDS_AUTHORIZATION");
      return NextResponse.json({ 
        success: false, 
        error: needsKey ? "AI provider is not configured on Render. Add OPENAI_API_KEY or GEMINI_API_KEY to enable live AI generation." : `AI Generation Error: ${aiErr?.message || "Upstream provider error"}`,
        needsApiKey: needsKey
      }, { status: 400 });
    }
  } catch (err: any) {
    console.error("POST /api/ai/command error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
