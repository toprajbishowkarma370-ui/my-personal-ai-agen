import crypto from "node:crypto";
import { prisma } from "./prisma";
import type { OtpRecord, OtpStore, OtpTransaction } from "./otp";

type LoginOtpRow = {
  id: string;
  email: string;
  codeHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  attempts: number;
  createdAt: Date;
};

type TransactionClient = {
  // $executeRaw is used for the lock statement: pg_advisory_xact_lock returns
  // void, which $queryRaw cannot deserialize. The row count is irrelevant.
  $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number>;
  loginOtp: LoginOtpModel;
};

type LoginOtpModel = {
  count(args: unknown): Promise<number>;
  findFirst(args: unknown): Promise<LoginOtpRow | null>;
  findMany(args: unknown): Promise<LoginOtpRow[]>;
  create(args: unknown): Promise<LoginOtpRow>;
  update(args: unknown): Promise<{ attempts: number }>;
  updateMany(args: unknown): Promise<{ count: number }>;
};

function toRecord(row: LoginOtpRow): OtpRecord {
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
 * Deterministic 64-bit advisory lock key. SHA-256 keeps the key stable across
 * processes and unrelated to table contents; PostgreSQL releases it at the end
 * of the transaction (including rollback or connection loss).
 */
function advisoryKey(scope: string, value: string): bigint {
  const digest = crypto.createHash("sha256").update(`${scope}:${value}`).digest();
  return digest.readBigInt64BE(0);
}

function transactionOps(loginOtp: LoginOtpModel): OtpTransaction {
  return {
    async countRequestsSince({ email, ip, since }) {
      const [emailCount, oldestEmail, ipCount, oldestIp] = await Promise.all([
        loginOtp.count({ where: { email, createdAt: { gte: since } } }),
        loginOtp.findFirst({ where: { email, createdAt: { gte: since } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
        ip ? loginOtp.count({ where: { requestIp: ip, createdAt: { gte: since } } }) : Promise.resolve(0),
        ip ? loginOtp.findFirst({ where: { requestIp: ip, createdAt: { gte: since } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }) : Promise.resolve(null),
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
      const result = await loginOtp.updateMany({
        where: { email, consumedAt: null, expiresAt: { gt: now } },
        data: { expiresAt: now },
      });
      return result.count;
    },

    async create(input) {
      const row = await loginOtp.create({ data: input });
      return toRecord(row);
    },
  };
}

const rootOps = transactionOps(prisma.loginOtp as unknown as LoginOtpModel);
const rootModel = prisma.loginOtp as unknown as LoginOtpModel;

/**
 * Prisma-backed OtpStore.
 *
 * Issuance is wrapped in a single interactive transaction that first takes
 * PostgreSQL transaction-level advisory locks for the email and (when known) the
 * IP. The lock covers the rate-limit count, the invalidation of older codes and
 * the insert, so concurrent requests are serialized and cannot exceed limits or
 * leave two valid codes. Locks are taken in sorted key order to avoid deadlocks
 * between an email lock and an IP lock.
 */
export const prismaOtpStore: OtpStore = {
  ...rootOps,

  async withLock(keys, fn) {
    return prisma.$transaction(
      async (tx) => {
        const lockKeys = [advisoryKey("otp:email", keys.email)];
        if (keys.ip) {
          lockKeys.push(advisoryKey("otp:ip", keys.ip));
        }
        lockKeys.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

        const client = tx as unknown as TransactionClient;
        for (const key of lockKeys) {
          await client.$executeRaw`SELECT pg_advisory_xact_lock(${key})`;
        }

        return fn(transactionOps(client.loginOtp));
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
  },

  async findActive(email, now) {
    const rows = await rootModel.findMany({
      where: { email, consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    return rows.map(toRecord);
  },

  async findLatestUnconsumed(email) {
    const row = await rootModel.findFirst({
      where: { email, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return row ? toRecord(row) : null;
  },

  async findConsumedByHash(email, codeHash) {
    const row = await rootModel.findFirst({
      where: { email, codeHash, consumedAt: { not: null } },
      orderBy: { createdAt: "desc" },
    });
    return row ? toRecord(row) : null;
  },

  async incrementAttempts(id) {
    try {
      const row = await rootModel.update({
        where: { id },
        data: { attempts: { increment: 1 } },
        select: { attempts: true },
      });
      return row.attempts;
    } catch {
      return Number.MAX_SAFE_INTEGER;
    }
  },

  // Single conditional UPDATE: exactly one concurrent caller can win.
  async consumeIfActive(id, now) {
    const result = await rootModel.updateMany({
      where: { id, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    return result.count === 1;
  },
};
