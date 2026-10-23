export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const dataEncoded = url.searchParams.get("data"); // eSewa v2 base64 response or query params

    if (!dataEncoded) {
      return NextResponse.redirect(new URL("/dashboard?payment=error&reason=missing_data", req.url));
    }

    let decodedData: any = {};
    try {
      decodedData = JSON.parse(Buffer.from(dataEncoded, "base64").toString("utf-8"));
    } catch (e) {
      decodedData = Object.fromEntries(url.searchParams.entries());
    }

    const { transaction_uuid, total_amount, transaction_code, status } = decodedData;

    if (status === "COMPLETE" || decodedData.status === "SUCCESS") {
      // Find invoice by invoiceNumber or transaction uuid
      await logAction("esewa.verify.success", JSON.stringify({ transaction_uuid, transaction_code, total_amount }));
      return NextResponse.redirect(new URL("/dashboard?payment=success", req.url));
    }

    return NextResponse.redirect(new URL("/dashboard?payment=failed", req.url));
  } catch (err: any) {
    console.error("eSewa verify error", err);
    return NextResponse.redirect(new URL("/dashboard?payment=error", req.url));
  }
}
