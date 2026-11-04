import { prisma } from "./prisma";
import type { OtpRecord, OtpStore } from "./otp";

function toRecord(row: {
  id: string;
  email: string;
  codeHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  attempts: number;
  createdAt: Date;
}): OtpRecord {
  return {
    id: row.id,
    email: row.email,
    codeHash: row.codeHash,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    attempts: row.attempts,
    createdAt: row.createdAt,
  };
}

/**
 * Prisma-backed OtpStore.
 *
 * `consumeIfActive` is a single conditional UPDATE so a code can be consumed
 * exactly once even when two verifications race.
 */
export const prismaOtpStore: OtpStore = {
  async countRequestsSince({ email, ip, since }) {
    const [emailCount, oldestEmail, ipCount, oldestIp] = await Promise.all([
      prisma.loginOtp.count({ where: { email, createdAt: { gte: since } } }),
      prisma.loginOtp.findFirst({ where: { email, createdAt: { gte: since } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
      ip
        ? prisma.loginOtp.count({ where: { requestIp: ip, createdAt: { gte: since } } })
        : Promise.resolve(0),
      ip
        ? prisma.loginOtp.findFirst({ where: { requestIp: ip, createdAt: { gte: since } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } })
        : Promise.resolve(null),
    ]);

    return {
      emailCount,
      ipCount,
      oldestEmailCreatedAt: oldestEmail?.createdAt ?? null,
      oldestIpCreatedAt: oldestIp?.createdAt ?? null,
    };
  },

  // Superseded codes are invalidated by expiring them, so `consumedAt` keeps
  // its precise meaning: "this exact code was verified successfully". That is
  // what replay detection relies on.
  async invalidateActive(email, now) {
    const result = await prisma.loginOtp.updateMany({
      where: { email, consumedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });
    return result.count;
  },

  async create(input) {
    const row = await prisma.loginOtp.create({ data: input });
    return toRecord(row);
  },

  async findActive(email, now) {
    const rows = await prisma.loginOtp.findMany({
      where: { email, consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    return rows.map(toRecord);
  },

  async findLatestUnconsumed(email) {
    const row = await prisma.loginOtp.findFirst({
      where: { email, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return row ? toRecord(row) : null;
  },

  async findConsumedByHash(email, codeHash) {
    const row = await prisma.loginOtp.findFirst({
      where: { email, codeHash, consumedAt: { not: null } },
      orderBy: { createdAt: "desc" },
    });
    return row ? toRecord(row) : null;
  },

  async incrementAttempts(id, _now) {
    try {
      const row = await prisma.loginOtp.update({
        where: { id },
        data: { attempts: { increment: 1 } },
        select: { attempts: true },
      });
      return row.attempts;
    } catch {
      return Number.MAX_SAFE_INTEGER;
    }
  },

  async consumeIfActive(id, now) {
    const result = await prisma.loginOtp.updateMany({
      where: { id, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    return result.count === 1;
  },
};
