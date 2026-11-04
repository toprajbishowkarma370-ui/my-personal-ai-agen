// In-memory implementation of the OtpStore contract used by lib/otp.ts.
// Semantics intentionally mirror lib/otp-store.ts:
// - invalidateActive expires superseded rows instead of consuming them
// - consumeIfActive is a single atomic state change (exactly one winner)
class FakeOtpStore {
  constructor() {
    this.rows = [];
    this.sequence = 0;
    this.locks = new Map();
  }

  async #acquire(key) {
    const previous = this.locks.get(key) || Promise.resolve();
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    this.locks.set(key, previous.then(() => held));
    await previous;
    return () => release();
  }

  // Mirrors the Prisma store: work for one email/IP is serialized, so the
  // rate-limit check and the insert cannot interleave.
  async withLock({ email, ip }, fn) {
    const keys = [`email:${email}`, ...(ip ? [`ip:${ip}`] : [])].sort();
    const releases = [];
    try {
      for (const key of keys) {
        releases.push(await this.#acquire(key));
      }
      return await fn(this);
    } finally {
      for (const release of releases.reverse()) release();
    }
  }

  async countRequestsSince({ email, ip, since }) {
    const inWindow = this.rows.filter((row) => row.createdAt.getTime() >= since.getTime());
    const emailRows = inWindow.filter((row) => row.email === email);
    const ipRows = ip ? inWindow.filter((row) => row.requestIp === ip) : [];

    return {
      emailCount: emailRows.length,
      ipCount: ipRows.length,
      oldestEmailCreatedAt: emailRows.length > 0 ? new Date(emailRows[0].createdAt) : null,
      oldestIpCreatedAt: ipRows.length > 0 ? new Date(ipRows[0].createdAt) : null,
    };
  }

  async invalidateActive(email, now) {
    let count = 0;
    for (const row of this.rows) {
      if (row.email === email && row.consumedAt === null && row.expiresAt.getTime() > now.getTime()) {
        row.expiresAt = new Date(now);
        count += 1;
      }
    }
    return count;
  }

  async create(input) {
    this.sequence += 1;
    const row = {
      id: `otp_${this.sequence}`,
      email: input.email,
      codeHash: input.codeHash,
      expiresAt: new Date(input.expiresAt),
      requestIp: input.requestIp,
      createdAt: new Date(input.createdAt),
      consumedAt: null,
      attempts: 0,
    };
    this.rows.push(row);
    return { ...row };
  }

  async findActive(email, now) {
    return this.rows
      .filter((row) => row.email === email && row.consumedAt === null && row.expiresAt.getTime() > now.getTime())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((row) => ({ ...row }));
  }

  async findLatestUnconsumed(email) {
    const rows = this.rows
      .filter((row) => row.email === email && row.consumedAt === null)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return rows.length > 0 ? { ...rows[0] } : null;
  }

  async findConsumedByHash(email, codeHash) {
    const rows = this.rows.filter((row) => row.email === email && row.codeHash === codeHash && row.consumedAt !== null);
    return rows.length > 0 ? { ...rows[0] } : null;
  }

  async incrementAttempts(id) {
    const row = this.rows.find((candidate) => candidate.id === id);
    if (!row) return Number.MAX_SAFE_INTEGER;
    row.attempts += 1;
    return row.attempts;
  }

  async consumeIfActive(id, now) {
    const row = this.rows.find((candidate) => candidate.id === id);
    // Mutation happens before the promise resolves, so concurrent verifications
    // observe a single winner.
    if (!row || row.consumedAt !== null || row.expiresAt.getTime() <= now.getTime()) {
      return false;
    }
    row.consumedAt = new Date(now);
    return true;
  }
}

module.exports = { FakeOtpStore };
