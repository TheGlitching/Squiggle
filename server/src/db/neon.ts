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

import { EMAIL_CHANGE_RATE_SCOPE } from '../account/rateScopes';
import { ANON_RATE_SCOPE_PREFIX, DAY_MS, RATE_WINDOW_MS, REPORT_MAX_BYTES, WEEK_MS, utcDayOf } from '../usage/limits';
import { METRIC_NAMES } from './types';
import type {
  AnalysisRunRow,
  Plan,
  PlanPeriod,
  BridgeCodeRow,
  CreateAnalysisRunArgs,
  CreateBridgeCodeArgs,
  CreateMagicLinkArgs,
  CreateOAuthPendingArgs,
  CreateReportArgs,
  CreateSessionArgs,
  CreateTokenArgs,
  CreateUserArgs,
  CreateUsageLogArgs,
  Db,
  ExtensionKeyRow,
  InstallRow,
  MagicLinkRow,
  NonceArgs,
  OAuthPendingRow,
  PurgeReportsResult,
  CollectMetricsArgs,
  MetricName,
  MetricsRaw,
  RateCheckArgs,
  RateCheckResult,
  ReportRow,
  TokenRow,
  UsageLogRow,
  UserRow,
  WebSessionRow,
} from './types';

type RawRow = Record<string, unknown>;

/**
 * BIGINT arrives as a string; numeric types arrive as numbers. A missing
 * value (a `GROUP BY` with no row for that key, a `SUM` over nothing) is 0,
 * so a count is always a number on the wire, never an omitted field.
 */
function num(value: unknown): number {
  if (value == null) return 0;
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
    planPeriodStart: r.plan_period_start == null ? null : num(r.plan_period_start),
    stripeCustomerId: (r.stripe_customer_id as string | null) ?? null,
    stripeSubId: (r.stripe_sub_id as string | null) ?? null,
    subscriptionFree: Boolean(r.subscription_free),
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
    textHash: r.text_hash as string,
    model: r.model as string,
    promptVersion: r.prompt_version as string,
    report: typeof reportValue === 'string' ? reportValue : JSON.stringify(reportValue),
    sizeBytes: num(r.size_bytes),
    createdAt: num(r.created_at),
    expiresAt: num(r.expires_at),
    readByExtension: r.read_by_extension === true,
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
      planPeriodStart: null,
      stripeCustomerId: null,
      stripeSubId: null,
      subscriptionFree: false,
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

  async setEmail(userId: string, email: string, now: number): Promise<boolean> {
    try {
      const rows = await this.q`
        UPDATE users SET email = ${email}, email_verified = true, updated_at = ${now}
        WHERE id = ${userId}
        RETURNING id
      `;
      return rows.length > 0;
    } catch (err) {
      // 23505 is Postgres' unique_violation: the address belongs to another account.
      if ((err as { code?: unknown }).code === '23505') return false;
      throw err;
    }
  }

  async deleteUser(userId: string): Promise<void> {
    // One transaction. Everything with a foreign key to `users` cascades from
    // the last statement (migrations 001-007 all say ON DELETE CASCADE, and
    // migrations.test.ts keeps it that way); the three before it are the rows
    // that name the account by address or by key instead of by id, and they
    // have to be read while the user row and its keys still exist.
    await this.q.transaction((t) => [
      t`DELETE FROM nonces WHERE key_id IN (SELECT id FROM extension_keys WHERE user_id = ${userId})`,
      t`DELETE FROM magic_links WHERE email = (SELECT email FROM users WHERE id = ${userId})`,
      t`
        DELETE FROM rate_limits
        WHERE (scope = 'magic_link:email' AND key = (SELECT email FROM users WHERE id = ${userId}))
           OR (scope = ${EMAIL_CHANGE_RATE_SCOPE} AND key = ${userId})
      `,
      t`DELETE FROM users WHERE id = ${userId}`,
    ]);
  }

  // ---- extension signing keys ----------------------------------------------

  async getUserByStripeCustomerId(customerId: string): Promise<UserRow | null> {
    const rows = await this.q`SELECT * FROM users WHERE stripe_customer_id = ${customerId}`;
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async setPlan(userId: string, plan: Plan, period: PlanPeriod | null, now: number): Promise<void> {
    await this.q`
      UPDATE users
      SET plan = ${plan}, plan_expires_at = ${period?.end ?? null}, plan_period_start = ${period?.start ?? null},
          updated_at = ${now}
      WHERE id = ${userId}
    `;
  }

  async setSubscriptionFree(userId: string, free: boolean, now: number): Promise<void> {
    await this.q`UPDATE users SET subscription_free = ${free}, updated_at = ${now} WHERE id = ${userId}`;
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

  async listInstalls(userId: string, now: number): Promise<InstallRow[]> {
    const rows = await this.q`
      SELECT k.id AS id, k.created_at AS created_at, MAX(t.expires_at) AS expires_at
      FROM extension_keys k
      JOIN tokens t ON t.key_id = k.id
      WHERE k.user_id = ${userId} AND t.revoked_at IS NULL AND t.expires_at > ${now}
      GROUP BY k.id, k.created_at
      ORDER BY k.created_at DESC
    `;
    return rows.map((r) => ({
      id: r.id as string,
      createdAt: num(r.created_at),
      expiresAt: num(r.expires_at),
    }));
  }

  async revokeInstall(userId: string, keyId: string, now: number): Promise<boolean> {
    const rows = await this.q`
      UPDATE tokens SET revoked_at = ${now}
      WHERE user_id = ${userId} AND key_id = ${keyId} AND revoked_at IS NULL
      RETURNING id
    `;
    return rows.length > 0;
  }

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
      INSERT INTO magic_links (id, email, code_hash, ip, change_user_id, created_at, expires_at, used_at, next_path)
      VALUES (${id}, ${args.email}, ${args.codeHash}, ${args.ip}, ${args.changeUserId ?? null}, ${args.now}, ${expiresAt}, NULL, ${args.next})
    `;
    return {
      id,
      email: args.email,
      codeHash: args.codeHash,
      ip: args.ip,
      changeUserId: args.changeUserId ?? null,
      createdAt: args.now,
      expiresAt,
      usedAt: null,
      next: args.next,
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
      changeUserId: (r.change_user_id as string | null) ?? null,
      createdAt: num(r.created_at),
      expiresAt: num(r.expires_at),
      usedAt: r.used_at === null ? null : num(r.used_at),
      next: (r.next_path as string | null) ?? null,
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

  // ---- manual bridge codes ----------------------------------------------------------

  async createBridgeCode(args: CreateBridgeCodeArgs): Promise<BridgeCodeRow> {
    const id = randomToken(16);
    const expiresAt = args.now + args.ttlMs;
    await this.q`
      INSERT INTO bridge_codes (id, code_hash, user_id, session_hash, public_key_jwk, created_at, expires_at, used_at)
      VALUES (${id}, ${args.codeHash}, ${args.userId}, ${args.sessionHash}, ${args.publicKeyJwk}, ${args.now}, ${expiresAt}, NULL)
    `;
    return {
      id,
      codeHash: args.codeHash,
      userId: args.userId,
      sessionHash: args.sessionHash,
      publicKeyJwk: args.publicKeyJwk,
      createdAt: args.now,
      expiresAt,
      usedAt: null,
    };
  }

  async findBridgeCodeByHash(codeHash: string): Promise<BridgeCodeRow | null> {
    const rows = await this.q`SELECT * FROM bridge_codes WHERE code_hash = ${codeHash}`;
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: r.id as string,
      codeHash,
      userId: r.user_id as string,
      sessionHash: r.session_hash as string,
      publicKeyJwk: r.public_key_jwk as string,
      createdAt: num(r.created_at),
      expiresAt: num(r.expires_at),
      usedAt: r.used_at === null ? null : num(r.used_at),
    };
  }

  async markBridgeCodeUsed(id: string, now: number): Promise<boolean> {
    const rows = await this.q`
      UPDATE bridge_codes SET used_at = ${now} WHERE id = ${id} AND used_at IS NULL RETURNING id
    `;
    return rows.length > 0;
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
      INSERT INTO oauth_pending (state, code_verifier, nonce, redirect_uri, created_at, expires_at, next_path)
      VALUES (${args.state}, ${args.codeVerifier}, ${args.nonce}, ${args.redirectUri}, ${args.now}, ${args.now + args.ttlMs}, ${args.next})
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
      next: (r.next_path as string | null) ?? null,
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

  async releaseRate(args: Omit<RateCheckArgs, 'limit'>): Promise<void> {
    const windowStart = Math.floor(args.now / args.windowMs) * args.windowMs;
    await this.q`
      UPDATE rate_limits SET count = count - 1
      WHERE scope = ${args.scope} AND key = ${args.key} AND window_start = ${windowStart} AND count > 0
    `;
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

  async recordRunStart(userId: string, now: number, sinceDay: number): Promise<number> {
    const day = utcDayOf(now);
    // The increment is atomic, so two starts racing each see a distinct count
    // for today. The earlier days are read beside it: the statement cannot see
    // its own insert, so today's row comes from RETURNING and is left out of the sum.
    const rows = await this.q`
      WITH bumped AS (
        INSERT INTO usage_daily (user_id, day, analyses, started)
        VALUES (${userId}, ${day}, 0, 1)
        ON CONFLICT (user_id, day) DO UPDATE SET started = usage_daily.started + 1
        RETURNING started
      )
      SELECT (SELECT started FROM bumped) + COALESCE((
        SELECT SUM(started) FROM usage_daily WHERE user_id = ${userId} AND day >= ${sinceDay} AND day <> ${day}
      ), 0) AS started
    `;
    return num(rows[0].started);
  }

  async releaseRunStart(userId: string, now: number): Promise<void> {
    await this.q`
      UPDATE usage_daily SET started = started - 1
      WHERE user_id = ${userId} AND day = ${utcDayOf(now)} AND started > 0
    `;
  }

  async countAnalysesSince(userId: string, since: number): Promise<number> {
    const rows = await this.q`SELECT COUNT(*) AS n FROM usage_log WHERE user_id = ${userId} AND created_at >= ${since}`;
    return num(rows[0].n);
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

  async findReport(
    urlHash: string,
    textHash: string,
    model: string,
    promptVersion: string,
  ): Promise<ReportRow | null> {
    const rows = await this.q`
      SELECT * FROM reports
      WHERE url_hash = ${urlHash} AND text_hash = ${textHash}
        AND model = ${model} AND prompt_version = ${promptVersion}
    `;
    return rows[0] ? mapReport(rows[0]) : null;
  }

  async findLinkReport(urlHash: string, model: string, promptVersion: string, now: number): Promise<ReportRow | null> {
    const rows = await this.q`
      SELECT * FROM reports
      WHERE url_hash = ${urlHash} AND read_by_extension
        AND model = ${model} AND prompt_version = ${promptVersion}
        AND expires_at > ${now}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return rows[0] ? mapReport(rows[0]) : null;
  }

  async createReport(args: CreateReportArgs): Promise<ReportRow> {
    if (args.sizeBytes > REPORT_MAX_BYTES) throw new Error('report exceeds the size cap');
    const id = randomToken(16);
    const expiresAt = args.now + args.ttlMs;
    // The UNIQUE (url_hash, text_hash, model, prompt_version) key makes a duplicate
    // insert a hard error: callers must findReport first (and a cache hit
    // must never overwrite an existing report).
    await this.q`
      INSERT INTO reports (id, url_hash, text_hash, model, prompt_version, report, size_bytes, created_at, expires_at,
                           read_by_extension)
      VALUES (${id}, ${args.urlHash}, ${args.textHash}, ${args.model}, ${args.promptVersion},
              ${args.report}::jsonb, ${args.sizeBytes}, ${args.now}, ${expiresAt}, ${args.readByExtension ?? false})
    `;
    return {
      id,
      urlHash: args.urlHash,
      textHash: args.textHash,
      model: args.model,
      promptVersion: args.promptVersion,
      report: args.report,
      sizeBytes: args.sizeBytes,
      createdAt: args.now,
      expiresAt,
      readByExtension: args.readByExtension ?? false,
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
    return rows[0] ? runRow(rows[0]) : null;
  }

  async updateAnalysisRunState(id: string, state: string, now: number): Promise<void> {
    await this.q`
      UPDATE analysis_runs SET state = ${state}::jsonb, updated_at = ${now} WHERE id = ${id}
    `;
  }

  async activeAnalysisRun(userId: string, since: number): Promise<AnalysisRunRow | null> {
    const rows = await this.q`
      SELECT * FROM analysis_runs
      WHERE user_id = ${userId} AND finalized_at IS NULL AND updated_at >= ${since}
      ORDER BY updated_at DESC
      LIMIT 1
    `;
    return rows[0] ? runRow(rows[0]) : null;
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

  async bumpMetric(name: MetricName, now: number): Promise<void> {
    await this.q`
      INSERT INTO metric_counters (day, name, count) VALUES (${utcDayOf(now)}, ${name}, 1)
      ON CONFLICT (day, name) DO UPDATE SET count = metric_counters.count + 1
    `;
  }

  async collectMetrics({ now, weeks, trialAnalyses }: CollectMetricsArgs): Promise<MetricsRaw> {
    const since = now - weeks * WEEK_MS;
    const sinceDay = utcDayOf(since);
    const [accounts, weekly, perAccount, events, usage, cohort, counted] = await Promise.all([
      this.q`
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE plan = 'active' AND plan_expires_at > ${now} AND NOT subscription_free) AS active,
               COUNT(*) FILTER (WHERE plan = 'active' AND plan_expires_at > ${now} AND subscription_free) AS active_free
        FROM users
      `,
      this.q`
        SELECT LEAST((created_at - ${since}::bigint) / ${WEEK_MS}::bigint, ${weeks - 1}::bigint) AS week, COUNT(*) AS n
        FROM users WHERE created_at >= ${since} GROUP BY week
      `,
      this.q`
        SELECT COUNT(*) FILTER (WHERE total > 0) AS finalized,
               COUNT(*) FILTER (WHERE total >= ${trialAnalyses}) AS trial_done,
               COUNT(*) FILTER (WHERE total >= ${trialAnalyses} AND paid) AS trial_paid
        FROM (
          SELECT COALESCE(SUM(d.analyses), 0) AS total,
                 u.stripe_customer_id IS NOT NULL AND NOT u.subscription_free AS paid
          FROM users u LEFT JOIN usage_daily d ON d.user_id = u.id
          GROUP BY u.id
        ) per_account
      `,
      this.q`
        SELECT type, COUNT(*) AS n FROM stripe_events
        WHERE received_at >= ${since}
          AND type IN ('checkout.session.completed', 'customer.subscription.deleted')
        GROUP BY type
      `,
      this.q`
        SELECT COALESCE(SUM(analyses), 0) AS finalized, COALESCE(SUM(started), 0) AS started,
               COUNT(DISTINCT user_id) FILTER (WHERE analyses > 0 OR started > 0) AS active
        FROM usage_daily WHERE day >= ${sinceDay}
      `,
      this.q`
        SELECT COUNT(*) AS cohort,
               COUNT(*) FILTER (WHERE EXISTS (
                 SELECT 1 FROM usage_daily d
                 WHERE d.user_id = u.id AND d.analyses > 0 AND d.day <= u.created_at + ${WEEK_MS}::bigint
               )) AS activated
        FROM users u WHERE u.created_at >= ${since - WEEK_MS} AND u.created_at < ${now - WEEK_MS}
      `,
      this.q`SELECT name, SUM(count) AS n FROM metric_counters WHERE day >= ${sinceDay} GROUP BY name`,
    ]);
    const accountsPerWeek = new Array<number>(weeks).fill(0);
    for (const row of weekly) accountsPerWeek[num(row.week)] = num(row.n);
    const eventCount = (type: string) => num(events.find((row) => row.type === type)?.n);
    const counters = Object.fromEntries(
      METRIC_NAMES.map((name) => [name, num(counted.find((row) => row.name === name)?.n)]),
    ) as Record<MetricName, number>;
    return {
      accountsTotal: num(accounts[0].total),
      accountsPerWeek,
      accountsFinalized: num(perAccount[0].finalized),
      trialCompleted: num(perAccount[0].trial_done),
      trialCompletedPaid: num(perAccount[0].trial_paid),
      activeSubscribers: num(accounts[0].active),
      activeFreeSubscribers: num(accounts[0].active_free),
      subscriptionsStarted: eventCount('checkout.session.completed'),
      subscriptionsCancelled: eventCount('customer.subscription.deleted'),
      finalizes: num(usage[0].finalized),
      starts: num(usage[0].started),
      activeAccounts: num(usage[0].active),
      activationCohort: num(cohort[0].cohort),
      activatedWithinWeek: num(cohort[0].activated),
      counters,
    };
  }

  async purgeExpired(now: number, usageLogRetentionMs: number): Promise<number> {
    const swept = await Promise.all([
      this.q`DELETE FROM nonces WHERE expires_at <= ${now} RETURNING 1`,
      this.q`DELETE FROM web_sessions WHERE expires_at <= ${now} RETURNING 1`,
      this.q`DELETE FROM magic_links WHERE expires_at <= ${now} RETURNING 1`,
      this.q`DELETE FROM bridge_codes WHERE expires_at <= ${now} RETURNING 1`,
      this.q`DELETE FROM oauth_pending WHERE expires_at <= ${now} RETURNING 1`,
      this.q`DELETE FROM analysis_runs WHERE expires_at <= ${now} RETURNING 1`,
      this.q`DELETE FROM usage_log WHERE created_at <= ${now - usageLogRetentionMs} RETURNING 1`,
      this.q`
        DELETE FROM rate_limits
        WHERE window_start <= CASE WHEN scope LIKE ${`${ANON_RATE_SCOPE_PREFIX}%`} THEN ${now - DAY_MS}::bigint ELSE ${now - RATE_WINDOW_MS}::bigint END
        RETURNING 1
      `,
    ]);
    return swept.reduce((n, rows) => n + rows.length, 0);
  }
}

function runRow(r: Record<string, unknown>): AnalysisRunRow {
  return {
    id: r.id as string,
    userId: (r.user_id as string | null) ?? null,
    urlHash: r.url_hash as string,
    // JSONB comes back parsed; the rest of the server treats state as text.
    state: typeof r.state === 'string' ? r.state : JSON.stringify(r.state),
    createdAt: num(r.created_at),
    updatedAt: num(r.updated_at),
    expiresAt: num(r.expires_at),
    finalizedAt: r.finalized_at === null ? null : num(r.finalized_at),
  };
}
