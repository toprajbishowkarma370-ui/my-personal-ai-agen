export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdminSession();
    const projects = await prisma.project.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json({ success: true, projects, count: projects.length });
  } catch (err: any) {
    console.error("GET /api/projects error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminSession();
    const body = await req.json();
    const created = await prisma.project.create({ data: body });
    await logAction("project.create", JSON.stringify({ id: created.id, name: created.name }));
    return NextResponse.json({ success: true, project: created }, { status: 201 });
  } catch (err: any) {
    console.error("POST /api/projects error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
