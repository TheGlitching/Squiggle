/**
 * Production implementation of {@link Db}, backed by Neon Postgres through
 * `@neondatabase/serverless`.
 *
 * The `neon()` entry point of that package is an HTTP driver: each query is
 * one stateless HTTPS request, so it runs on Cloudflare Workers without
 * `nodejs_compat` and without an open connection — the worker can scale to
 * zero and the database can auto-suspend, which is exactly the
 * free-at-zero-volume shape this product needs.
 *
 * Row mapping is explicit and boring on purpose: Postgres returns `BIGINT`
 * as a string and `NULL` as `null`; everything else is a direct cast from
 * the typed schema in `001_auth.ts`.
 */
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
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
  OAuthPendingRow,
  PurgeReportsResult,
  RateCheckArgs,
  RateCheckResult,
  ReportRow,
  TokenRow,
  UsageLogRow,
  UserRow,
  WebSessionRow,
} from './types';

type RawRow = Record<string, unknown>;

/** BIGINT arrives as a string; numeric types arrive as numbers. */
function num(value: unknown): number {
  return typeof value === 'string' ? Number(value) : (value as number);
}

function mapUser(r: RawRow): UserRow {
  return {
    id: r.id as string,
    email: (r.email as string | null) ?? null,
    emailVerified: Boolean(r.email_verified),
    googleSub: (r.google_sub as string | null) ?? null,
    plan: r.plan as UserRow['plan'],
    planExpiresAt: r.plan_expires_at === null ? null : num(r.plan_expires_at),
    stripeCustomerId: (r.stripe_customer_id as string | null) ?? null,
    stripeSubId: (r.stripe_sub_id as string | null) ?? null,
    createdAt: num(r.created_at),
    updatedAt: num(r.updated_at),
  };
}

function mapReport(r: RawRow): ReportRow {
  // JSONB may arrive already parsed (object mode) or as a string, depending
  // on the driver's mode: normalize to the canonical JSON string.
  const reportValue: unknown = r.report;
  return {
    id: r.id as string,
    urlHash: r.url_hash as string,
    model: r.model as string,
    promptVersion: r.prompt_version as string,
    report: typeof reportValue === 'string' ? reportValue : JSON.stringify(reportValue),
    sizeBytes: num(r.size_bytes),
    createdAt: num(r.created_at),
    expiresAt: num(r.expires_at),
  };
}

export class NeonDb implements Db {
  /** Object mode (default): rows are `Record<string, any>`, never raw arrays. */
  private readonly q: NeonQueryFunction<false, false>;

  constructor(connectionString: string) {
    this.q = neon(connectionString);
  }

  // ---- users -------------------------------------------------------------

  async getUserById(id: string): Promise<UserRow | null> {
    const rows = await this.q`SELECT * FROM users WHERE id = ${id}`;
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async getUserByEmail(email: string): Promise<UserRow | null> {
    const rows = await this.q`SELECT * FROM users WHERE email = ${email}`;
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async getUserByGoogleSub(sub: string): Promise<UserRow | null> {
    const rows = await this.q`SELECT * FROM users WHERE google_sub = ${sub}`;
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async createUser(args: CreateUserArgs, now: number): Promise<UserRow> {
    const id = randomToken(16);
    await this.q`
      INSERT INTO users (id, email, email_verified, google_sub, plan, plan_expires_at, created_at, updated_at)
      VALUES (${id}, ${args.email ?? null}, ${args.emailVerified ?? false}, ${args.googleSub ?? null}, 'trial', NULL, ${now}, ${now})
    `;
    return {
      id,
      email: args.email ?? null,
      emailVerified: args.emailVerified ?? false,
      googleSub: args.googleSub ?? null,
      plan: 'trial',
      planExpiresAt: null,
      stripeCustomerId: null,
      stripeSubId: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async markEmailVerified(userId: string, now: number): Promise<void> {
    await this.q`UPDATE users SET email_verified = true, updated_at = ${now} WHERE id = ${userId}`;
  }

  async attachGoogleSub(userId: string, googleSub: string, now: number): Promise<void> {
    await this.q`UPDATE users SET google_sub = ${googleSub}, updated_at = ${now} WHERE id = ${userId}`;
  }

  // ---- extension signing keys ----------------------------------------------

  async getUserByStripeCustomerId(customerId: string): Promise<UserRow | null> {
    const rows = await this.q`SELECT * FROM users WHERE stripe_customer_id = ${customerId}`;
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async setPlan(userId: string, plan: Plan, planExpiresAt: number | null, now: number): Promise<void> {
    await this.q`
      UPDATE users SET plan = ${plan}, plan_expires_at = ${planExpiresAt}, updated_at = ${now}
      WHERE id = ${userId}
    `;
  }

  async setStripeIds(
    userId: string,
    ids: { customerId?: string | null; subId?: string | null },
    now: number,
  ): Promise<void> {
    // COALESCE on the parameter, so `undefined` (sent as NULL) leaves the
    // column alone and an explicit null is expressed by passing the current
    // value — a webhook that carries only a subscription id must not wipe the
    // customer id.
    if (ids.customerId !== undefined) {
      await this.q`UPDATE users SET stripe_customer_id = ${ids.customerId}, updated_at = ${now} WHERE id = ${userId}`;
    }
    if (ids.subId !== undefined) {
      await this.q`UPDATE users SET stripe_sub_id = ${ids.subId}, updated_at = ${now} WHERE id = ${userId}`;
    }
  }

  async recordStripeEvent(id: string, type: string, now: number): Promise<boolean> {
    // The primary key is the deduplication: a redelivery collides here rather
    // than being applied twice.
    const rows = await this.q`
      INSERT INTO stripe_events (id, type, received_at) VALUES (${id}, ${type}, ${now})
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `;
    return rows.length > 0;
  }

  async createExtensionKey(userId: string, publicKeyJwk: string, now: number): Promise<ExtensionKeyRow> {
    const id = randomToken(16);
    await this.q`
      INSERT INTO extension_keys (id, user_id, public_key_jwk, created_at)
      VALUES (${id}, ${userId}, ${publicKeyJwk}, ${now})
    `;
    return { id, userId, publicKeyJwk, createdAt: now };
  }

  async getExtensionKey(id: string): Promise<ExtensionKeyRow | null> {
    const rows = await this.q`SELECT * FROM extension_keys WHERE id = ${id}`;
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id,
      userId: r.user_id as string,
      publicKeyJwk: r.public_key_jwk as string,
      createdAt: num(r.created_at),
    };
  }

  // ---- extension tokens --------------------------------------------------------

  async createToken(args: CreateTokenArgs): Promise<TokenRow> {
    const id = randomToken(16);
    const expiresAt = args.now + args.ttlMs;
    await this.q`
      INSERT INTO tokens (id, token_hash, user_id, key_id, created_at, expires_at, revoked_at)
      VALUES (${id}, ${args.tokenHash}, ${args.userId}, ${args.keyId}, ${args.now}, ${expiresAt}, NULL)
    `;
    return {
      id,
      tokenHash: args.tokenHash,
      userId: args.userId,
      keyId: args.keyId,
      createdAt: args.now,
      expiresAt,
      revokedAt: null,
    };
  }

  async findTokenByHash(tokenHash: string): Promise<TokenRow | null> {
    const rows = await this.q`SELECT * FROM tokens WHERE token_hash = ${tokenHash}`;
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: r.id as string,
      tokenHash,
      userId: r.user_id as string,
      keyId: r.key_id as string,
      createdAt: num(r.created_at),
      expiresAt: num(r.expires_at),
      revokedAt: r.revoked_at === null ? null : num(r.revoked_at),
    };
  }

  async revokeToken(tokenHash: string, now: number): Promise<void> {
    await this.q`UPDATE tokens SET revoked_at = ${now} WHERE token_hash = ${tokenHash} AND revoked_at IS NULL`;
  }

  // ---- magic links -----------------------------------------------------------------

  async createMagicLink(args: CreateMagicLinkArgs): Promise<MagicLinkRow> {
    const id = randomToken(16);
    const expiresAt = args.now + args.ttlMs;
    await this.q`
      INSERT INTO magic_links (id, email, code_hash, ip, created_at, expires_at, used_at)
      VALUES (${id}, ${args.email}, ${args.codeHash}, ${args.ip}, ${args.now}, ${expiresAt}, NULL)
    `;
    return {
      id,
      email: args.email,
      codeHash: args.codeHash,
      ip: args.ip,
      createdAt: args.now,
      expiresAt,
      usedAt: null,
    };
  }

  async findMagicLinkByCodeHash(codeHash: string): Promise<MagicLinkRow | null> {
    const rows = await this.q`SELECT * FROM magic_links WHERE code_hash = ${codeHash}`;
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: r.id as string,
      email: r.email as string,
      codeHash,
      ip: (r.ip as string | null) ?? null,
      createdAt: num(r.created_at),
      expiresAt: num(r.expires_at),
      usedAt: r.used_at === null ? null : num(r.used_at),
    };
  }

  async markMagicLinkUsed(id: string, now: number): Promise<void> {
    await this.q`UPDATE magic_links SET used_at = ${now} WHERE id = ${id} AND used_at IS NULL`;
  }

  // ---- web sessions ---------------------------------------------------------------------

  async createSession(args: CreateSessionArgs): Promise<WebSessionRow> {
    const id = randomToken(16);
    const expiresAt = args.now + args.ttlMs;
    await this.q`
      INSERT INTO web_sessions (id, session_hash, user_id, created_at, expires_at, revoked_at)
      VALUES (${id}, ${args.sessionHash}, ${args.userId}, ${args.now}, ${expiresAt}, NULL)
    `;
    return {
      id,
      sessionHash: args.sessionHash,
      userId: args.userId,
      createdAt: args.now,
      expiresAt,
      revokedAt: null,
    };
  }

  async findSessionByHash(sessionHash: string): Promise<WebSessionRow | null> {
    const rows = await this.q`SELECT * FROM web_sessions WHERE session_hash = ${sessionHash}`;
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: r.id as string,
      sessionHash,
      userId: r.user_id as string,
      createdAt: num(r.created_at),
      expiresAt: num(r.expires_at),
      revokedAt: r.revoked_at === null ? null : num(r.revoked_at),
    };
  }

  async revokeSession(sessionHash: string, now: number): Promise<void> {
    await this.q`UPDATE web_sessions SET revoked_at = ${now} WHERE session_hash = ${sessionHash} AND revoked_at IS NULL`;
  }

  // ---- nonces ------------------------------------------------------------------------------

  async addNonce(args: NonceArgs): Promise<boolean> {
    // Atomic check-and-set: the row is only inserted if the nonce is new, and
    // the RETURNING clause tells us which case happened. A replay therefore
    // loses the race, it can never win it twice.
    const rows = await this.q`
      INSERT INTO nonces (nonce, key_id, expires_at)
      VALUES (${args.nonce}, ${args.keyId}, ${args.now + args.ttlMs})
      ON CONFLICT (nonce) DO NOTHING
      RETURNING nonce
    `;
    return rows.length > 0;
  }

  // ---- oauth pending --------------------------------------------------------------------------

  async createOAuthPending(args: CreateOAuthPendingArgs): Promise<void> {
    await this.q`
      INSERT INTO oauth_pending (state, code_verifier, nonce, redirect_uri, created_at, expires_at)
      VALUES (${args.state}, ${args.codeVerifier}, ${args.nonce}, ${args.redirectUri}, ${args.now}, ${args.now + args.ttlMs})
    `;
  }

  async findOAuthPending(state: string): Promise<OAuthPendingRow | null> {
    const rows = await this.q`SELECT * FROM oauth_pending WHERE state = ${state}`;
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      state,
      codeVerifier: r.code_verifier as string,
      nonce: r.nonce as string,
      redirectUri: r.redirect_uri as string,
      createdAt: num(r.created_at),
      expiresAt: num(r.expires_at),
    };
  }

  async deleteOAuthPending(state: string): Promise<void> {
    await this.q`DELETE FROM oauth_pending WHERE state = ${state}`;
  }

  // ---- rate limiting ------------------------------------------------------------------------------

  async recordAndCheckRate(args: RateCheckArgs): Promise<RateCheckResult> {
    const windowStart = Math.floor(args.now / args.windowMs) * args.windowMs;
    // Atomic increment: concurrent callers each see a distinct count, so the
    // limit can never be exceeded by a race.
    const rows = await this.q`
      INSERT INTO rate_limits (scope, key, window_start, count)
      VALUES (${args.scope}, ${args.key}, ${windowStart}, 1)
      ON CONFLICT (scope, key, window_start) DO UPDATE SET count = rate_limits.count + 1
      RETURNING count
    `;
    const count = num(rows[0].count);
    return { allowed: count <= args.limit, count, windowStart };
  }

  // ---- usage (ledger + daily counter) -------------------------------------

  async recordAnalysis(args: CreateUsageLogArgs): Promise<UsageLogRow> {
    const id = randomToken(16);
    const day = utcDayOf(args.now);
    // One transaction: the ledger row and the day's counter move together,
    // so the quota and the ledger can never diverge on a partial failure.
    await this.q.transaction((t) => [
      t`
        INSERT INTO usage_log (id, user_id, created_at)
        VALUES (${id}, ${args.userId}, ${args.now})
      `,
      t`
        INSERT INTO usage_daily (user_id, day, analyses)
        VALUES (${args.userId}, ${day}, 1)
        ON CONFLICT (user_id, day) DO UPDATE SET analyses = usage_daily.analyses + 1
      `,
    ]);
    return { id, userId: args.userId, createdAt: args.now };
  }

  async getDailyUsage(userId: string, day: number): Promise<number> {
    const rows = await this.q`SELECT analyses FROM usage_daily WHERE user_id = ${userId} AND day = ${day}`;
    return rows[0] ? num(rows[0].analyses) : 0;
  }

  async sumUsage(userId: string): Promise<number> {
    const rows = await this.q`SELECT COALESCE(SUM(analyses), 0) AS total FROM usage_daily WHERE user_id = ${userId}`;
    return num(rows[0].total);
  }

  async countUsageLog(userId: string): Promise<number> {
    const rows = await this.q`SELECT COUNT(*) AS n FROM usage_log WHERE user_id = ${userId}`;
    return num(rows[0].n);
  }

  // ---- shared report cache ---------------------------------------------------

  async findReport(urlHash: string, model: string, promptVersion: string): Promise<ReportRow | null> {
    const rows = await this.q`
      SELECT * FROM reports
      WHERE url_hash = ${urlHash} AND model = ${model} AND prompt_version = ${promptVersion}
    `;
    return rows[0] ? mapReport(rows[0]) : null;
  }

  async createReport(args: CreateReportArgs): Promise<ReportRow> {
    if (args.sizeBytes > REPORT_MAX_BYTES) throw new Error('report exceeds the size cap');
    const id = randomToken(16);
    const expiresAt = args.now + args.ttlMs;
    // The UNIQUE (url_hash, model, prompt_version) key makes a duplicate
    // insert a hard error: callers must findReport first (and a cache hit
    // must never overwrite an existing report).
    await this.q`
      INSERT INTO reports (id, url_hash, model, prompt_version, report, size_bytes, created_at, expires_at)
      VALUES (${id}, ${args.urlHash}, ${args.model}, ${args.promptVersion},
              ${args.report}::jsonb, ${args.sizeBytes}, ${args.now}, ${expiresAt})
    `;
    return {
      id,
      urlHash: args.urlHash,
      model: args.model,
      promptVersion: args.promptVersion,
      report: args.report,
      sizeBytes: args.sizeBytes,
      createdAt: args.now,
      expiresAt,
    };
  }

  async purgeReports(now: number, maxCount: number): Promise<PurgeReportsResult> {
    const expiredRows = await this.q`SELECT id FROM reports WHERE expires_at <= ${now}`;
    const expired = expiredRows.length;
    if (expired > 0) await this.q`DELETE FROM reports WHERE expires_at <= ${now}`;

    const overCapRows = await this.q`SELECT id FROM reports ORDER BY created_at ASC OFFSET ${maxCount}`;
    const overCap = overCapRows.length;
    if (overCap > 0) {
      const ids = overCapRows.map((r) => r.id as string);
      for (let i = 0; i < ids.length; i += 500) {
        await this.q`DELETE FROM reports WHERE id = ANY(${ids.slice(i, i + 500)})`;
      }
    }
    return { expired, overCap };
  }

  // ---- analysis runs -------------------------------------------------------

  async createAnalysisRun(args: CreateAnalysisRunArgs): Promise<AnalysisRunRow> {
    const id = randomToken(16);
    const expiresAt = args.now + args.ttlMs;
    await this.q`
      INSERT INTO analysis_runs (id, user_id, url_hash, state, created_at, updated_at, expires_at)
      VALUES (${id}, ${args.userId}, ${args.urlHash}, ${args.state}::jsonb, ${args.now}, ${args.now}, ${expiresAt})
    `;
    return {
      id,
      userId: args.userId,
      urlHash: args.urlHash,
      state: args.state,
      createdAt: args.now,
      updatedAt: args.now,
      expiresAt,
      finalizedAt: null,
    };
  }

  async getAnalysisRun(id: string): Promise<AnalysisRunRow | null> {
    const rows = await this.q`SELECT * FROM analysis_runs WHERE id = ${id}`;
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: r.id as string,
      userId: r.user_id as string,
      urlHash: r.url_hash as string,
      // JSONB comes back parsed; the rest of the server treats state as text.
      state: typeof r.state === 'string' ? r.state : JSON.stringify(r.state),
      createdAt: num(r.created_at),
      updatedAt: num(r.updated_at),
      expiresAt: num(r.expires_at),
      finalizedAt: r.finalized_at === null ? null : num(r.finalized_at),
    };
  }

  async updateAnalysisRunState(id: string, state: string, now: number): Promise<void> {
    await this.q`
      UPDATE analysis_runs SET state = ${state}::jsonb, updated_at = ${now} WHERE id = ${id}
    `;
  }

  async countActiveAnalysisRuns(userId: string, since: number): Promise<number> {
    const rows = await this.q`
      SELECT COUNT(*) AS n FROM analysis_runs
      WHERE user_id = ${userId} AND finalized_at IS NULL AND updated_at >= ${since}
    `;
    return num(rows[0].n);
  }

  async finalizeAnalysisRun(id: string, now: number): Promise<boolean> {
    // Conditional on finalized_at still being NULL, so a replayed finalize
    // updates zero rows instead of consuming a second credit.
    const rows = await this.q`
      UPDATE analysis_runs SET finalized_at = ${now}, updated_at = ${now}
      WHERE id = ${id} AND finalized_at IS NULL
      RETURNING id
    `;
    return rows.length > 0;
  }

  async purgeExpired(now: number, usageLogRetentionMs: number): Promise<void> {
    await this.q`DELETE FROM nonces WHERE expires_at <= ${now}`;
    await this.q`DELETE FROM web_sessions WHERE expires_at <= ${now}`;
    await this.q`DELETE FROM magic_links WHERE expires_at <= ${now}`;
    await this.q`DELETE FROM oauth_pending WHERE expires_at <= ${now}`;
    await this.q`DELETE FROM analysis_runs WHERE expires_at <= ${now}`;
    await this.q`DELETE FROM usage_log WHERE created_at <= ${now - usageLogRetentionMs}`;
  }
}
