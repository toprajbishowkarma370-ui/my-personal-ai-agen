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
      return NextResponse.json({ 
        success: false, 
        error: "Authentication required. Please sign in as Owner (ADMIN) via NextAuth." 
      }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { topic, language = "English" } = body;

    if (!topic) {
      return NextResponse.json({ success: false, error: "Topic is required" }, { status: 400 });
    }

    const systemPrompt = `You are a professional YouTube Content Creator and AI Studio Director for Nepal/Karnali.
Generate a complete YouTube video package for the topic: "${topic}" in language: "${language}".
Return valid JSON with the following exact keys:
{
  "title": "Optimized YouTube Title (Catchy, SEO friendly)",
  "description": "Engaging description with timestamps and call to action",
  "tags": ["tag1", "tag2", "tag3"],
  "script": "Full spoken voiceover script",
  "storyboard": [
    { "scene": 1, "visual": "Visual description for scene 1", "audio": "Voiceover for scene 1" },
    { "scene": 2, "visual": "Visual description for scene 2", "audio": "Voiceover for scene 2" }
  ]
}`;

    if (aiRequiresConfiguration()) {
      return NextResponse.json({ 
        success: false, 
        error: "No AI provider is configured on the server. Set OPENAI_API_KEY (recommended) or GEMINI_API_KEY in Render Environment variables to enable live YouTube content generation.",
        needsApiKey: true
      }, { status: 400 });
    }

    const raw = await executeAiPrompt(`Generate YouTube package for: ${topic}`, systemPrompt);
    let parsed;
    try {
      const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = {
        title: topic,
        description: `Professional YouTube video about ${topic}.`,
        tags: [topic, "Nepal", "AI"],
        script: raw,
        storyboard: [{ scene: 1, visual: "Introduction to " + topic, audio: raw }]
      };
    }

    await logAction("youtube.generate", JSON.stringify({ topic, language, provider: getConfiguredProviderLabel() }));
    return NextResponse.json({ success: true, data: parsed });
  } catch (err: any) {
    console.error("POST /api/youtube/generate error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
