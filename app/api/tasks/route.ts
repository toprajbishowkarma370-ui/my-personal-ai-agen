export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdminSession();
    const tasks = await prisma.task.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json({ success: true, tasks, count: tasks.length });
  } catch (err: any) {
    console.error("GET /api/tasks error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminSession();
    const body = await req.json();
    const created = await prisma.task.create({ data: body });
    await logAction("task.create", JSON.stringify({ id: created.id, title: created.title }));
    return NextResponse.json({ success: true, task: created }, { status: 201 });
  } catch (err: any) {
    console.error("POST /api/tasks error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
