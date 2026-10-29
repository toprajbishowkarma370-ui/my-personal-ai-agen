export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Renders a stored website's content/theme as an HTML preview for a given breakpoint width.
// No authentication required: previews are public read-only views of published/demo content.
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  try {
    const { searchParams } = new URL(req.url);
    const width = Number(searchParams.get("width")) || 1024;
    const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;

    const website = await prisma.website.findUnique({ where: { slug } });
    if (!website) {
      return new NextResponse("Website not found", { status: 404 });
    }

    let content: any = {};
    let theme: any = { primary: "#6957f5", accent: "#9f8efc", font: "Plus Jakarta Sans" };
    let settings: any = {};
    try {
      if (website.content) content = JSON.parse(website.content);
    } catch {}
    try {
      if (website.theme) theme = JSON.parse(website.theme);
    } catch {}
    try {
      if (website.settings) settings = JSON.parse(website.settings);
    } catch {}

    const pages = content.pages || [];
    const primary = theme.primary || "#6957f5";
    const accent = theme.accent || "#9f8efc";
    const font = theme.font || "Plus Jakarta Sans";

    const renderSection = (section: any) => {
      switch (section.type) {
        case "hero":
          return `<section style="padding:40px 20px;text-align:center;background:${primary};color:#ffffff;border-radius:16px;margin-bottom:16px;">
            <h1 style="font-family:'${font}',sans-serif;font-size:clamp(24px,6vw,40px);font-weight:800;margin:0 0 12px 0;">${section.title || ""}</h1>
            <p style="font-family:'${font}',sans-serif;font-size:clamp(14px,3vw,18px);margin:0;opacity:0.9;">${section.body || ""}</p>
          </section>`;
        case "text":
          return `<section style="padding:24px 20px;text-align:left;border-bottom:1px solid #334155;">
            <h2 style="font-family:'${font}',sans-serif;font-size:20px;font-weight:700;margin:0 0 8px 0;color:#${primary.replace('#','')}">${section.title || ""}</h2>
            <p style="font-family:'${font}',sans-serif;font-size:15px;margin:0;color:#cbd5e1;">${section.body || ""}</p>
          </section>`;
        case "menu":
          return `<section style="padding:24px 20px;">
            <h2 style="font-family:'${font}',sans-serif;font-size:20px;font-weight:700;margin:0 0 12px 0;color:#${primary.replace('#','')}">${section.title || "Menu"}</h2>
            <ul style="font-family:'${font}',sans-serif;margin:0;padding-left:18px;color:#cbd5e1;">
              ${(section.items || []).map((i: any) => `<li style="margin:4px 0;">• ${i}</li>`).join("")}
            </ul>
          </section>`;
        case "services":
          return `<section style="padding:24px 20px;">
            <h2 style="font-family:'${font}',sans-serif;font-size:20px;font-weight:700;margin:0 0 12px 0;color:#${primary.replace('#','')}">${section.title || "Services"}</h2>
            <ul style="font-family:'${font}',sans-serif;margin:0;padding-left:18px;color:#cbd5e1;">
              ${(section.items || []).map((i: any) => `<li style="margin:4px 0;">• ${i}</li>`).join("")}
            </ul>
          </section>`;
        case "products":
        case "listings":
        case "portfolio":
        case "features":
          return `<section style="padding:24px 20px;">
            <h2 style="font-family:'${font}',sans-serif;font-size:20px;font-weight:700;margin:0 0 12px 0;color:#${primary.replace('#','')}">${section.title || "Items"}</h2>
            <ul style="font-family:'${font}',sans-serif;margin:0;padding-left:18px;color:#cbd5e1;">
              ${(section.items || []).map((i: any) => `<li style="margin:4px 0;">• ${i}</li>`).join("")}
            </ul>
          </section>`;
        case "booking":
        case "form":
          return `<section style="padding:24px 20px;background:#0b0f1f;border:1px solid #334155;border-radius:12px;">
            <h2 style="font-family:'${font}',sans-serif;font-size:20px;font-weight:700;margin:0 0 8px 0;color:#ffffff">${section.title || "Form"}</h2>
            <p style="font-family:'${font}',sans-serif;font-size:15px;margin:0;color:#94a3b8;">${section.body || ""}</p>
            <div style="margin-top:12px;">
              <input type="text" placeholder="Your name" style="width:100%;padding:10px;border-radius:8px;border:1px solid #475569;background:#070a14;color:#ffffff;font-family:'${font}',sans-serif;" />
              <button style="margin-top:10px;width:100%;padding:10px;background:${primary};color:#ffffff;border:none;border-radius:8px;font-family:'${font}',sans-serif;font-weight:700;cursor:pointer;">Submit</button>
            </div>
          </section>`;
        case "cart":
          return `<section style="padding:24px 20px;background:#0b0f1f;border:1px solid #334155;border-radius:12px;text-align:center;">
            <p style="font-family:'${font}',sans-serif;margin:0;color:#cbd5e1;">${section.body || ""}</p>
          </section>`;
        case "pricing":
          return `<section style="padding:24px 20px;">
            <h2 style="font-family:'${font}',sans-serif;font-size:20px;font-weight:700;margin:0 0 12px 0;color:#${primary.replace('#','')}">${section.title || "Pricing"}</h2>
            <ul style="font-family:'${font}',sans-serif;margin:0;padding-left:18px;color:#cbd5e1;">
              ${(section.items || []).map((i: any) => `<li style="margin:4px 0;">• ${i}</li>`).join("")}
            </ul>
          </section>`;
        case "contact":
        default:
          return `<section style="padding:24px 20px;text-align:left;">
            <p style="font-family:'${font}',sans-serif;font-size:15px;color:#cbd5e1;margin:0;">${section.body || ""}</p>
          </section>`;
      }
    };

    const bodyHtml = pages.map((p: any) => {
      const sectionsHtml = (p.sections || []).map(renderSection).join("");
      return `<article style="margin-bottom:24px;">
        <h2 style="font-family:'${font}',sans-serif;font-size:24px;font-weight:800;margin:0 0 12px 0;color:#ffffff;">${p.title || "Page"}</h2>
        ${sectionsHtml}
      </article>`;
    }).join("");

    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${website.name}</title>
<style>
  body{font-family:'${font}',sans-serif;background:#070a14;color:#cbd5e1;margin:0;padding:0;}
  .preview-frame{border:none;background:#070a14;}
</style>
</head>
<body class="preview-frame">
${bodyHtml}
<div style="padding:24px 20px;text-align:center;border-top:1px solid #334155;margin-top:24px;">
  <p style="font-family:'${font}',sans-serif;font-size:12px;color:#64748b;margin:0;">Demo preview — ${TEMPLATE_LABEL(website.template)} template • ${website.status}</p>
</div>
</body></html>`;

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8", "X-Frame-Options": "SAMEORIGIN" },
    });
  } catch (err: any) {
    console.error("preview error", err);
    return new NextResponse("Preview error", { status: 500 });
  }
}

function TEMPLATE_LABEL(id: string) {
  const labels: Record<string, string> = {
    "local-business": "Local Business",
    "hotel-restaurant": "Hotel and Restaurant",
    "school-college": "School and College",
    "clinic-healthcare": "Clinic and Healthcare",
    "agrovet-agriculture": "Agrovet and Agriculture",
    "real-estate": "Real Estate",
    "portfolio-personal": "Portfolio and Personal Brand",
    "agency-services": "Agency and Services",
    "ecommerce-store": "E-commerce Store",
    "startup-saas": "Startup and SaaS",
  };
  return labels[id] || id;
}
