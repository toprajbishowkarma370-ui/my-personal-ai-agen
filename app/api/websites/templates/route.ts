export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { getAllTemplates } from "@/lib/website-templates";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdminSession();
    const templates = getAllTemplates().map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      description: t.description,
      layout: t.layout,
    }));
    return NextResponse.json({ success: true, templates, count: templates.length });
  } catch (err: any) {
    console.error("GET /api/websites/templates error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
