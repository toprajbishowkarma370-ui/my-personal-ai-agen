export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { getAllTemplates, getTemplateById } from "@/lib/website-templates";

export const runtime = "nodejs";

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function GET(req: Request) {
  try {
    await requireAdminSession();
    const { searchParams } = new URL(req.url);
    const archived = searchParams.get("archived") === "true";
    const template = searchParams.get("template");
    const customerId = searchParams.get("customerId");
    const leadId = searchParams.get("leadId");

    const where: any = {};
    if (archived) where.isArchived = true;
    else where.isArchived = false;
    if (template) where.template = template;
    if (customerId) where.customerId = customerId;
    if (leadId) where.leadId = leadId;

    const websites = await prisma.website.findMany({
      where,
      include: { customer: true, lead: true },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ success: true, websites, count: websites.length });
  } catch (err: any) {
    console.error("GET /api/websites error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireAdminSession();
    const body = await req.json();
    const { name, templateId, customerId, leadId } = body;

    if (!name || !templateId) {
      return NextResponse.json({ success: false, error: "Name and templateId are required" }, { status: 400 });
    }

    const template = getTemplateById(templateId);
    if (!template) {
      return NextResponse.json({ success: false, error: "Unknown template" }, { status: 400 });
    }

    let slug = slugify(name);
    // Ensure unique slug
    let counter = 1;
    while (await prisma.website.findUnique({ where: { slug } })) {
      slug = `${slugify(name)}-${counter++}`;
    }

    const created = await prisma.website.create({
      data: {
        name,
        slug,
        template: templateId,
        status: "DRAFT",
        data: JSON.stringify(template.demoContent),
        content: JSON.stringify(template.demoContent),
        theme: JSON.stringify(template.theme),
        settings: JSON.stringify(template.settings),
        customerId: customerId || null,
        leadId: leadId || null,
      },
    });

    await logAction("website.create", JSON.stringify({ id: created.id, name: created.name, template: templateId, slug }));
    return NextResponse.json({ success: true, website: created }, { status: 201 });
  } catch (err: any) {
    console.error("POST /api/websites error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireAdminSession();
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "Website id is required" }, { status: 400 });
    }

    const website = await prisma.website.findUnique({ where: { id } });
    if (!website) {
      return NextResponse.json({ success: false, error: "Website not found" }, { status: 404 });
    }

    const data: any = {};
    if (updates.name !== undefined) {
      data.name = updates.name;
      if (updates.slug === undefined) {
        const base = slugify(updates.name);
        let slug = base;
        let counter = 1;
        while (await prisma.website.findFirst({ where: { slug, NOT: { id } } })) {
          slug = `${base}-${counter++}`;
        }
        data.slug = slug;
      }
    }
    if (updates.slug !== undefined) data.slug = updates.slug;
    if (updates.template !== undefined) data.template = updates.template;
    if (updates.status !== undefined) data.status = updates.status;
    if (updates.isArchived !== undefined) data.isArchived = updates.isArchived;
    if (updates.ownerApproved !== undefined) {
      data.ownerApproved = updates.ownerApproved;
      data.ownerApprovedAt = updates.ownerApproved ? new Date() : null;
      data.ownerApprovedBy = (session as any)?.user?.email || null;
    }
    if (updates.data !== undefined) data.data = typeof updates.data === "string" ? updates.data : JSON.stringify(updates.data);
    if (updates.content !== undefined) data.content = typeof updates.content === "string" ? updates.content : JSON.stringify(updates.content);
    if (updates.theme !== undefined) data.theme = typeof updates.theme === "string" ? updates.theme : JSON.stringify(updates.theme);
    if (updates.settings !== undefined) data.settings = typeof updates.settings === "string" ? updates.settings : JSON.stringify(updates.settings);
    if (updates.customerId !== undefined) data.customerId = updates.customerId;
    if (updates.leadId !== undefined) data.leadId = updates.leadId;

    const updated = await prisma.website.update({ where: { id }, data });
    await logAction("website.update", JSON.stringify({ id: updated.id, name: updated.name, status: updated.status }));
    return NextResponse.json({ success: true, website: updated });
  } catch (err: any) {
    console.error("PATCH /api/websites error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    await requireAdminSession();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "Website id is required" }, { status: 400 });
    }
    await prisma.website.delete({ where: { id } });
    await logAction("website.delete", JSON.stringify({ id }));
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("DELETE /api/websites error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
