
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export type Role = "ADMIN" | "AGENT" | "CLIENT";

export async function getAuthSession() {
  return await getServerSession(authOptions as any);
}

export async function requireAdminSession() {
  const session = await getAuthSession();

  if (!session || (session.user as any)?.role !== "ADMIN") {
    throw new Error("UNAUTHORIZED: Owner ADMIN role required");
  }

  return session;
}

export async function requireAgentSession() {
  const session = await getAuthSession();
  const role = (session?.user as any)?.role;

  if (!session || !["ADMIN", "AGENT"].includes(role)) {
    throw new Error("UNAUTHORIZED: AGENT or ADMIN role required");
  }

  return session;
}
