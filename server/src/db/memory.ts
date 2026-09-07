/**
 * In-memory implementation of {@link Db}, used by the test suite.
 *
 * It mirrors the semantics of the SQL schema (see
 * `src/migrations/001_auth.ts`) closely enough that the auth flows behave
 * identically in tests and in production: hashes are unique, nonces and
 * rate windows are applied atomically, and expiry is always evaluated
 * against the `now` supplied by the caller.
 */
import { randomToken } from '@squiggle/shared';

import { REPORT_MAX_BYTES, utcDayOf } from '../usage/limits';
import type {
  AnalysisRunRow,
  Plan,
  CreateAnalysisRunArgs,
  CreateMagicLinkArgs,
  CreateOAuthPendingArgs,
  CreateReportArgs,
  CreateSessionArgs,
  CreateTokenArgs,
  CreateUserArgs,
  CreateUsageLogArgs,
  Db,
  ExtensionKeyRow,
  MagicLinkRow,
  NonceArgs,
  NonceRow,
  OAuthPendingRow,
  PurgeReportsResult,
  RateCheckArgs,
  RateCheckResult,
  ReportRow,
  TokenRow,
  UsageDailyRow,
  UsageLogRow,
  UserRow,
  WebSessionRow,
} from './types';

export class MemoryDb implements Db {
  private readonly users = new Map<string, UserRow>();
  private readonly keys = new Map<string, ExtensionKeyRow>();
  private readonly tokens = new Map<string, TokenRow>();
  private readonly magicLinks = new Map<string, MagicLinkRow>();
  private readonly sessions = new Map<string, WebSessionRow>();
  private readonly nonces = new Map<string, NonceRow>();
  private readonly oauth = new Map<string, OAuthPendingRow>();
  private readonly rates = new Map<string, { count: number; windowStart: number }>();
  private readonly usageDaily = new Map<string, UsageDailyRow>();
  private readonly usageLog = new Map<string, UsageLogRow>();
  private readonly reports = new Map<string, ReportRow>();
  private readonly runs = new Map<string, AnalysisRunRow>();
  private readonly stripeEvents = new Set<string>();

  // ---- users ---------------------------------------------------------------


  async getUserById(id: string): Promise<UserRow | null> {
    return this.users.get(id) ?? null;
  }

  async getUserByEmail(email: string): Promise<UserRow | null> {
    for (const user of this.users.values()) {
      if (user.email === email) return user;
    }
    return null;
  }

  async getUserByGoogleSub(sub: string): Promise<UserRow | null> {
    for (const user of this.users.values()) {
      if (user.googleSub === sub) return user;
    }
    return null;
  }

  async createUser(args: CreateUserArgs, now: number): Promise<UserRow> {
    const row: UserRow = {
      id: randomToken(16),
      email: args.email ?? null,
      emailVerified: args.emailVerified ?? false,
      googleSub: args.googleSub ?? null,
      // A new account starts on the trial: 3 analyses, ever. Set here so
      // there is one answer to "what does a fresh account get" (see
      // billing/quota.ts for what the plans mean).
      plan: 'trial',
      planExpiresAt: null,
      stripeCustomerId: null,
      stripeSubId: null,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(row.id, row);
    return row;
  }

  async markEmailVerified(userId: string, now: number): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      user.emailVerified = true;
      user.updatedAt = now;
    }
  }

  async attachGoogleSub(userId: string, googleSub: string, now: number): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      user.googleSub = googleSub;
      user.updatedAt = now;
    }
  }

  // ---- extension signing keys ----------------------------------------------

  async getUserByStripeCustomerId(customerId: string): Promise<UserRow | null> {
    for (const user of this.users.values()) {
      if (user.stripeCustomerId === customerId) return user;
    }
    return null;
  }

  async setPlan(userId: string, plan: Plan, planExpiresAt: number | null, now: number): Promise<void> {
    const user = this.users.get(userId);
    if (!user) return;
    user.plan = plan;
    user.planExpiresAt = planExpiresAt;
    user.updatedAt = now;
  }

  async setStripeIds(
    userId: string,
    ids: { customerId?: string | null; subId?: string | null },
    now: number,
  ): Promise<void> {
    const user = this.users.get(userId);
    if (!user) return;
    if (ids.customerId !== undefined) user.stripeCustomerId = ids.customerId;
    if (ids.subId !== undefined) user.stripeSubId = ids.subId;
    user.updatedAt = now;
  }

  async recordStripeEvent(id: string, _type: string, _now: number): Promise<boolean> {
    if (this.stripeEvents.has(id)) return false;
    this.stripeEvents.add(id);
    return true;
  }

  async createExtensionKey(userId: string, publicKeyJwk: string, now: number): Promise<ExtensionKeyRow> {
    const row: ExtensionKeyRow = { id: randomToken(16), userId, publicKeyJwk, createdAt: now };
    this.keys.set(row.id, row);
    return row;
  }

  async getExtensionKey(id: string): Promise<ExtensionKeyRow | null> {
    return this.keys.get(id) ?? null;
  }

  // ---- extension tokens ------------------------------------------------------

  async createToken(args: CreateTokenArgs): Promise<TokenRow> {
    const row: TokenRow = {
      id: randomToken(16),
      tokenHash: args.tokenHash,
      userId: args.userId,
      keyId: args.keyId,
      createdAt: args.now,
      expiresAt: args.now + args.ttlMs,
      revokedAt: null,
    };
    this.tokens.set(row.tokenHash, row);
    return row;
  }

  async findTokenByHash(tokenHash: string): Promise<TokenRow | null> {
    return this.tokens.get(tokenHash) ?? null;
  }

  async revokeToken(tokenHash: string, now: number): Promise<void> {
    const row = this.tokens.get(tokenHash);
    if (row && row.revokedAt === null) row.revokedAt = now;
  }

  // ---- magic links ------------------------------------------------------------

  async createMagicLink(args: CreateMagicLinkArgs): Promise<MagicLinkRow> {
    const row: MagicLinkRow = {
      id: randomToken(16),
      email: args.email,
      codeHash: args.codeHash,
      ip: args.ip,
      createdAt: args.now,
      expiresAt: args.now + args.ttlMs,
      usedAt: null,
    };
    this.magicLinks.set(row.codeHash, row);
    return row;
  }

  async findMagicLinkByCodeHash(codeHash: string): Promise<MagicLinkRow | null> {
    return this.magicLinks.get(codeHash) ?? null;
  }

  async markMagicLinkUsed(id: string, now: number): Promise<void> {
    for (const link of this.magicLinks.values()) {
      if (link.id === id && link.usedAt === null) {
        link.usedAt = now;
        return;
      }
    }
  }

  // ---- web sessions -------------------------------------------------------------

  async createSession(args: CreateSessionArgs): Promise<WebSessionRow> {
    const row: WebSessionRow = {
      id: randomToken(16),
      sessionHash: args.sessionHash,
      userId: args.userId,
      createdAt: args.now,
      expiresAt: args.now + args.ttlMs,
      revokedAt: null,
    };
    this.sessions.set(row.sessionHash, row);
    return row;
  }

  async findSessionByHash(sessionHash: string): Promise<WebSessionRow | null> {
    return this.sessions.get(sessionHash) ?? null;
  }

  async revokeSession(sessionHash: string, now: number): Promise<void> {
    const row = this.sessions.get(sessionHash);
    if (row && row.revokedAt === null) row.revokedAt = now;
  }

  // ---- nonces ---------------------------------------------------------------------

  async addNonce(args: NonceArgs): Promise<boolean> {
    if (this.nonces.has(args.nonce)) return false;
    this.nonces.set(args.nonce, { nonce: args.nonce, keyId: args.keyId, expiresAt: args.now + args.ttlMs });
    return true;
  }

  // ---- oauth pending -----------------------------------------------------------------

  async createOAuthPending(args: CreateOAuthPendingArgs): Promise<void> {
    this.oauth.set(args.state, {
      state: args.state,
      codeVerifier: args.codeVerifier,
      nonce: args.nonce,
      redirectUri: args.redirectUri,
      createdAt: args.now,
      expiresAt: args.now + args.ttlMs,
    });
  }

  async findOAuthPending(state: string): Promise<OAuthPendingRow | null> {
    return this.oauth.get(state) ?? null;
  }

  async deleteOAuthPending(state: string): Promise<void> {
    this.oauth.delete(state);
  }

  // ---- rate limiting --------------------------------------------------------------------

  async recordAndCheckRate(args: RateCheckArgs): Promise<RateCheckResult> {
    const windowStart = Math.floor(args.now / args.windowMs) * args.windowMs;
    const k = `${args.scope}\u0000${args.key}\u0000${windowStart}`;
    let entry = this.rates.get(k);
    if (!entry) {
      entry = { count: 0, windowStart };
      this.rates.set(k, entry);
    }
    entry.count += 1;
    return { allowed: entry.count <= args.limit, count: entry.count, windowStart };
  }

  // ---- usage (ledger + daily counter) -------------------------------------

  async recordAnalysis(args: CreateUsageLogArgs): Promise<UsageLogRow> {
    const day = utcDayOf(args.now);
    const k = `${args.userId}\u0000${day}`;
    let daily = this.usageDaily.get(k);
    if (!daily) {
      daily = { userId: args.userId, day, analyses: 0 };
      this.usageDaily.set(k, daily);
    }
    daily.analyses += 1;
    const row: UsageLogRow = {
      id: randomToken(16),
      userId: args.userId,
      reportId: args.reportId,
      createdAt: args.now,
    };
    this.usageLog.set(row.id, row);
    return row;
  }

  async getDailyUsage(userId: string, day: number): Promise<number> {
    return this.usageDaily.get(`${userId}\u0000${day}`)?.analyses ?? 0;
  }

  async sumUsage(userId: string): Promise<number> {
    let total = 0;
    for (const daily of this.usageDaily.values()) {
      if (daily.userId === userId) total += daily.analyses;
    }
    return total;
  }

  async countUsageLog(userId: string): Promise<number> {
    let count = 0;
    for (const row of this.usageLog.values()) {
      if (row.userId === userId) count += 1;
    }
    return count;
  }

  // ---- shared report cache ---------------------------------------------------

  async findReport(urlHash: string, model: string, promptVersion: string): Promise<ReportRow | null> {
    for (const report of this.reports.values()) {
      if (report.urlHash === urlHash && report.model === model && report.promptVersion === promptVersion) {
        return report;
      }
    }
    return null;
  }

  async createReport(args: CreateReportArgs): Promise<ReportRow> {
    if (args.sizeBytes > REPORT_MAX_BYTES) throw new Error('report exceeds the size cap');
    if (await this.findReport(args.urlHash, args.model, args.promptVersion)) {
      throw new Error('a report is already cached for this key');
    }
    const row: ReportRow = {
      id: randomToken(16),
      urlHash: args.urlHash,
      model: args.model,
      promptVersion: args.promptVersion,
      report: args.report,
      sizeBytes: args.sizeBytes,
      createdAt: args.now,
      expiresAt: args.now + args.ttlMs,
    };
    this.reports.set(row.id, row);
    return row;
  }

  async purgeReports(now: number, maxCount: number): Promise<PurgeReportsResult> {
    let expired = 0;
    for (const [id, report] of this.reports) {
      if (report.expiresAt <= now) {
        this.reports.delete(id);
        expired += 1;
      }
    }
    let overCap = 0;
    if (this.reports.size > maxCount) {
      const oldestFirst = [...this.reports.values()].sort((a, b) => a.createdAt - b.createdAt);
      for (const report of oldestFirst.slice(0, this.reports.size - maxCount)) {
        this.reports.delete(report.id);
        overCap += 1;
      }
    }
    return { expired, overCap };
  }

  // ---- analysis runs -------------------------------------------------------

  async createAnalysisRun(args: CreateAnalysisRunArgs): Promise<AnalysisRunRow> {
    const row: AnalysisRunRow = {
      id: randomToken(16),
      userId: args.userId,
      urlHash: args.urlHash,
      state: args.state,
      createdAt: args.now,
      updatedAt: args.now,
      expiresAt: args.now + args.ttlMs,
      finalizedAt: null,
    };
    this.runs.set(row.id, row);
    return row;
  }

  async getAnalysisRun(id: string): Promise<AnalysisRunRow | null> {
    return this.runs.get(id) ?? null;
  }

  async updateAnalysisRunState(id: string, state: string, now: number): Promise<void> {
    const row = this.runs.get(id);
    if (!row) return;
    row.state = state;
    row.updatedAt = now;
  }

  async countActiveAnalysisRuns(userId: string, since: number): Promise<number> {
    let count = 0;
    for (const row of this.runs.values()) {
      if (row.userId === userId && row.finalizedAt === null && row.updatedAt >= since) count += 1;
    }
    return count;
  }

  async finalizeAnalysisRun(id: string, now: number): Promise<boolean> {
    const row = this.runs.get(id);
    if (!row || row.finalizedAt !== null) return false;
    row.finalizedAt = now;
    row.updatedAt = now;
    return true;
  }

  async purgeExpired(now: number, usageLogRetentionMs: number): Promise<void> {
    for (const [nonce, row] of this.nonces) if (row.expiresAt <= now) this.nonces.delete(nonce);
    for (const [hash, row] of this.sessions) if (row.expiresAt <= now) this.sessions.delete(hash);
    for (const [hash, row] of this.magicLinks) if (row.expiresAt <= now) this.magicLinks.delete(hash);
    for (const [state, row] of this.oauth) if (row.expiresAt <= now) this.oauth.delete(state);
    for (const [id, row] of this.runs) if (row.expiresAt <= now) this.runs.delete(id);
    const cutoff = now - usageLogRetentionMs;
    for (const [id, row] of this.usageLog) if (row.createdAt <= cutoff) this.usageLog.delete(id);
  }
}
