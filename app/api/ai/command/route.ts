export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { executeGeminiPrompt } from "@/lib/gemini";
import { logAction } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireAdminSession();
    const { prompt, systemContext } = await req.json();
    if (!prompt) {
      return NextResponse.json({ success: false, error: "Prompt is required" }, { status: 400 });
    }

    const resultText = await executeGeminiPrompt(prompt, systemContext || "You are My Personal AI Business Agent for Chaurjahari & Karnali, expert in agency operations, lead generation, and software delivery.");
    await logAction("ai.command", JSON.stringify({ prompt: prompt.substring(0, 50) }));

    return NextResponse.json({ success: true, result: resultText });
  } catch (err: any) {
    console.error("POST /api/ai/command error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
