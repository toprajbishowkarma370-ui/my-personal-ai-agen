export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdminSession();
    const { id } = params;
    const body = await req.json();
    const { action } = body;

    const website = await prisma.website.findUnique({ where: { id } });
    if (!website) {
      return NextResponse.json({ success: false, error: "Website not found" }, { status: 404 });
    }

    if (action === "duplicate") {
      const newName = `${website.name} (Copy)`;
      let slug = `${website.slug}-copy`;
      let counter = 1;
      while (await prisma.website.findUnique({ where: { slug } })) {
        slug = `${website.slug}-copy-${counter++}`;
      }
      const duplicated = await prisma.website.create({
        data: {
          name: newName,
          slug,
          template: website.template,
          status: "DRAFT",
          data: website.data,
          content: website.content,
          theme: website.theme,
          settings: website.settings,
          customerId: website.customerId,
          leadId: website.leadId,
        },
      });
      await logAction("website.duplicate", JSON.stringify({ sourceId: id, newId: duplicated.id, name: duplicated.name }));
      return NextResponse.json({ success: true, website: duplicated }, { status: 201 });
    }

    if (action === "archive") {
      const updated = await prisma.website.update({
        where: { id },
        data: { isArchived: true, status: "ARCHIVED" },
      });
      await logAction("website.archive", JSON.stringify({ id: updated.id, name: updated.name }));
      return NextResponse.json({ success: true, website: updated });
    }

    if (action === "reopen") {
      const updated = await prisma.website.update({
        where: { id },
        data: { isArchived: false, status: "DRAFT" },
      });
      await logAction("website.reopen", JSON.stringify({ id: updated.id, name: updated.name }));
      return NextResponse.json({ success: true, website: updated });
    }

    if (action === "request-owner-approval") {
      const updated = await prisma.website.update({
        where: { id },
        data: { status: "PENDING_OWNER_APPROVAL" },
      });
      await logAction("website.request-owner-approval", JSON.stringify({ id: updated.id, name: updated.name }));
      return NextResponse.json({ success: true, website: updated });
    }

    if (action === "approve") {
      const ownerEmail = process.env.OWNER_EMAIL;
      const verifier = (session as any)?.user?.email || ownerEmail || "owner";
      if (ownerEmail && verifier.toLowerCase() !== ownerEmail.toLowerCase()) {
        return NextResponse.json({ success: false, error: "Only the owner can approve a website for publishing" }, { status: 403 });
      }
      const updated = await prisma.website.update({
        where: { id },
        data: { ownerApproved: true, ownerApprovedAt: new Date(), ownerApprovedBy: verifier, status: "APPROVED" },
      });
      await logAction("website.approve", JSON.stringify({ id: updated.id, name: updated.name, approvedBy: verifier }));
      return NextResponse.json({ success: true, website: updated });
    }

    if (action === "publish") {
      const website2 = await prisma.website.findUnique({ where: { id } });
      if (!website2?.ownerApproved) {
        return NextResponse.json({ success: false, error: "Owner approval required before publishing" }, { status: 403 });
      }
      const updated = await prisma.website.update({
        where: { id },
        data: { status: "PUBLISHED", publishUrl: `https://${website2.slug}.example.com` },
      });
      await logAction("website.publish", JSON.stringify({ id: updated.id, name: updated.name, publishUrl: updated.publishUrl }));
      return NextResponse.json({ success: true, website: updated });
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    console.error(`POST /api/websites/[id] error`, err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdminSession();
    const { id } = params;
    const website = await prisma.website.findUnique({ where: { id }, include: { customer: true, lead: true } });
    if (!website) {
      return NextResponse.json({ success: false, error: "Website not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, website });
  } catch (err: any) {
    console.error("GET /api/websites/[id] error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdminSession();
    const { id } = params;
    const body = await req.json();
    const website = await prisma.website.findUnique({ where: { id } });
    if (!website) {
      return NextResponse.json({ success: false, error: "Website not found" }, { status: 404 });
    }
    const updated = await prisma.website.update({ where: { id }, data: body });
    await logAction("website.patch", JSON.stringify({ id: updated.id, name: updated.name }));
    return NextResponse.json({ success: true, website: updated });
  } catch (err: any) {
    console.error("PATCH /api/websites/[id] error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdminSession();
    const { id } = params;
    await prisma.website.delete({ where: { id } });
    await logAction("website.delete", JSON.stringify({ id }));
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("DELETE /api/websites/[id] error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
