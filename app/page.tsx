import fs from "fs";
import path from "path";
import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions, normalizeRole } from "@/lib/auth";
import ClientDashboard from "@/components/ClientDashboard";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await getServerSession(authOptions);
  const role = normalizeRole((session as any)?.user?.role);
  const isAdminSession = !!session && role === "ADMIN";

  if (!isAdminSession) {
    redirect("/login?error=AccessDenied");
  }

  const pathsToTry = [
    path.join(process.cwd(), "index.html"),
    path.join(process.cwd(), "public", "index.html"),
    path.join(__dirname, "index.html"),
    path.join(__dirname, "../index.html"),
    path.join(__dirname, "../../index.html"),
    path.join(__dirname, "../../../index.html"),
  ];

  let bodyContent = "";
  let htmlFound = false;

  for (const filePath of pathsToTry) {
    try {
      if (fs.existsSync(filePath)) {
        const html = fs.readFileSync(filePath, "utf8");
        const match = html.match(/<body[^>]*>(.*)<\/body>/is);
        bodyContent = match && match[1] ? match[1] : html;
        htmlFound = true;
        break;
      }
    } catch {
      // Ignore and continue to the fallback HTML below.
    }
  }

  if (!htmlFound) {
    bodyContent = `
      <div style="background:#070a14;color:#fff;padding:40px;font-family:sans-serif;text-align:center;">
        <h1>My Personal AI Business Agent</h1>
        <p>Autonomous Business OS is online. Dashboard template loading...</p>
      </div>
    `;
  }

  return <ClientDashboard htmlContent={bodyContent} />;
}
