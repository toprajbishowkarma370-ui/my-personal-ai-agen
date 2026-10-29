export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    let session: any;
    try {
      session = await requireAdminSession();
    } catch (authErr: any) {
      return NextResponse.json({ 
        success: false, 
        error: "Authentication required. Please sign in as Owner (ADMIN) via NextAuth." 
      }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { title, description, tags, privacyStatus = "private", ownerApproved } = body;

    if (!ownerApproved) {
      return NextResponse.json({
        success: false,
        error: "Publishing blocked: Explicit owner approval is required before publishing to YouTube."
      }, { status: 400 });
    }

    if (!title) {
      return NextResponse.json({ success: false, error: "Video title is required" }, { status: 400 });
    }

    const accessToken = session?.accessToken || process.env.YOUTUBE_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json({
        success: false,
        error: "YouTube API Error: Google OAuth Access Token with YouTube upload scope is missing. Please sign in with Google (Owner account) ensuring YouTube upload permission is granted, or configure YOUTUBE_ACCESS_TOKEN."
      }, { status: 400 });
    }

    const metadata = {
      snippet: {
        title,
        description: description || "",
        tags: Array.isArray(tags) ? tags : ["AI", "Nepal"]
      },
      status: {
        privacyStatus: privacyStatus === "public" ? "public" : (privacyStatus === "unlisted" ? "unlisted" : "private")
      }
    };

    const response = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=metadata&part=snippet,status", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(metadata)
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errMsg = result?.error?.message || `YouTube API returned status ${response.status}`;
      return NextResponse.json({
        success: false,
        error: `YouTube Upload Failed: ${errMsg}. Please ensure YouTube Data API v3 is enabled in Google Cloud Console and proper scopes are authorized.`
      }, { status: 400 });
    }

    const videoId = result.id;
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

    await logAction("youtube.upload", JSON.stringify({ videoId, title, privacyStatus }));

    return NextResponse.json({
      success: true,
      videoId,
      youtubeUrl,
      status: "uploaded",
      privacyStatus: metadata.status.privacyStatus,
      message: "Video successfully uploaded and registered on YouTube!"
    });
  } catch (err: any) {
    console.error("POST /api/youtube/upload error", err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
