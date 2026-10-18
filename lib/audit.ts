import { prisma } from "./prisma";
import { getAuthSession } from "./auth";

export async function logAction(action: string, details?: string) {
  try {
    const session = await getAuthSession();
    await prisma.auditLog.create({
      data: {
        action,
        details,
        actorEmail: (session as any)?.user?.email || "system@local"
      }
    });
  } catch (e) {
    console.error("Audit log failed", e);
  }
}
