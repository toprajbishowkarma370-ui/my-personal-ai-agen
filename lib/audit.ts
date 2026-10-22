
import { getServerSession } from "next-auth";
import { authOptions, getAuthSession } from "./auth";
import { prisma } from "./prisma";

export { authOptions, getAuthSession };

export async function logAction(action: string, details?: string) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        details,
      },
    });
  } catch (error) {
    console.error("Failed to log action:", error);
  }
}

