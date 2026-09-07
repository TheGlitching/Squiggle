/**
 * Data model for the hosted backend.
 *
 * All timestamps are milliseconds since the Unix epoch, supplied explicitly by
 * the caller (the DB layer never reads a clock), which keeps every flow
 * deterministic under test.
 *
 * `Db` is the seam between the auth logic and storage. `MemoryDb` (tests) and
 * `NeonDb` (production) implement it, and the services depend only on this
 * interface, so the entire auth surface is testable in-process with no
 * database running.
 */

export type Plan = 'none' | 'trial' | 'active';

export interface UserRow {
  id: string;
  email: string | null;
  emailVerified: boolean;
  googleSub: string | null;
  plan: Plan;
  planExpiresAt: number | null;
  /** Stripe Customer id (billing, Phase 2d). null until a checkout exists. */
  stripeCustomerId: string | null;
  /** Stripe subscription id. null unless/after a subscription is active. */
  stripeSubId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateUserArgs {
  email?: string | null;
  emailVerified?: boolean;
  googleSub?: string | null;
}

/** An install's per-device P-256 signing key (public half only). */
export interface ExtensionKeyRow {
  id: string;
  userId: string;
  /** The P-256 JWK as a JSON string. */
  publicKeyJwk: string;
  createdAt: number;
}

export interface TokenRow {
  id: string;
  /** SHA-256 hex of the opaque token. The raw token is never stored. */
  tokenHash: string;
  userId: string;
  /** The extension key this token is bound to (one token per install). */
  keyId: string;
  createdAt: number;
  expiresAt: number;
  /** null = valid. */
  revokedAt: number | null;
}

export interface CreateTokenArgs {
  userId: string;
  keyId: string;
  tokenHash: string;
  now: number;
  ttlMs: number;
}

export interface MagicLinkRow {
  id: string;
  email: string;
  /** SHA-256 hex of the code; the raw code exists only inside the email. */
  codeHash: string;
  /** Client IP of the request that triggered the email (rate limiting). */
  ip: string | null;
  createdAt: number;
  expiresAt: number;
  /** null = unused. */
  usedAt: number | null;
}

export interface CreateMagicLinkArgs {
  email: string;
  codeHash: string;
  ip: string | null;
  now: number;
  ttlMs: number;
}

export interface WebSessionRow {
  id: string;
  /** SHA-256 hex of the session token carried in the HttpOnly cookie. */
  sessionHash: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
  /** null = valid. */
  revokedAt: number | null;
}

export interface CreateSessionArgs {
  userId: string;
  sessionHash: string;
  now: number;
  ttlMs: number;
}

export interface NonceRow {
  nonce: string;
  keyId: string;
  expiresAt: number;
}

export interface NonceArgs {
  keyId: string;
  nonce: string;
  now: number;
  ttlMs: number;
}

/** A one-time OAuth handshake in flight (state → PKCE verifier + nonce). */
export interface OAuthPendingRow {
  state: string;
  codeVerifier: string;
  nonce: string;
  redirectUri: string;
  createdAt: number;
  expiresAt: number;
}

export interface CreateOAuthPendingArgs {
  state: string;
  codeVerifier: string;
  nonce: string;
  redirectUri: string;
  now: number;
  ttlMs: number;
}

/** One UTC day, as the epoch milliseconds of its midnight. */
export type Day = number;

/** The daily quota: analyses on a single UTC day. */
export interface UsageDailyRow {
  userId: string;
  day: Day;
  analyses: number;
}

/** A ledger entry: who ran which analysis, and when. Never content. */
export interface UsageLogRow {
  id: string;
  userId: string;
  /** The report this analysis produced (the report may already be purged). */
  reportId: string;
  createdAt: number;
}

export interface CreateUsageLogArgs {
  userId: string;
  reportId: string;
  now: number;
}

/** A shared cached report: the sanitized JSON of one article analysis. */
export interface ReportRow {
  id: string;
  /** SHA-256 hex of the canonical article URL (the extension computed it). */
  urlHash: string;
  /** The model that produced the report (transparency: shown to readers). */
  model: string;
  /** The prompt version that produced it (cache invalidation key). */
  promptVersion: string;
  /** The sanitized report as a JSON string — never raw article text. */
  report: string;
  sizeBytes: number;
  createdAt: number;
  expiresAt: number;
}

export interface CreateReportArgs {
  urlHash: string;
  model: string;
  promptVersion: string;
  report: string;
  sizeBytes: number;
  now: number;
  ttlMs: number;
}

/** What a cache purge removed. */
export interface PurgeReportsResult {
  /** Reports removed because their TTL had lapsed. */
  expired: number;
  /** Reports removed to bring the cache back under the size cap. */
  overCap: number;
}

/**
 * One analysis in flight, spread over the five stage calls (Phase 2c).
 *
 * `state` is the accumulated engine state as a JSON string, and it is only
 * ever written by the server: the client names a run and a finding, never the
 * content of either, which is what keeps a poisoned client out of the shared
 * report cache. The article's text is never part of it (see migration 003).
 */
export interface AnalysisRunRow {
  id: string;
  userId: string;
  /** SHA-256 hex of the canonical article URL — the shared cache key. */
  urlHash: string;
  /** The accumulated stage output, as a JSON string. */
  state: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  /** Set exactly once, by the finalize that consumed the credit. */
  finalizedAt: number | null;
}

export interface CreateAnalysisRunArgs {
  userId: string;
  urlHash: string;
  state: string;
  now: number;
  ttlMs: number;
}

export interface RateCheckArgs {
  /** What is being limited, e.g. `magic_link:email` or `magic_link:ip`. */
  scope: string;
  /** The identity being limited (an email address, an IP, ...). */
  key: string;
  limit: number;
  windowMs: number;
  now: number;
}

export interface RateCheckResult {
  allowed: boolean;
  /** Number of uses inside the current window, including this one. */
  count: number;
  windowStart: number;
}

export interface Db {
  getUserById(id: string): Promise<UserRow | null>;
  getUserByEmail(email: string): Promise<UserRow | null>;
  getUserByGoogleSub(sub: string): Promise<UserRow | null>;
  createUser(args: CreateUserArgs, now: number): Promise<UserRow>;
  markEmailVerified(userId: string, now: number): Promise<void>;
  attachGoogleSub(userId: string, googleSub: string, now: number): Promise<void>;

  /** The account a Stripe customer belongs to, or null. Webhook routing. */
  getUserByStripeCustomerId(customerId: string): Promise<UserRow | null>;

  /**
   * Set the plan and its expiry. Called ONLY from the webhook handler: the
   * client never declares itself subscribed, so this must never be reachable
   * from a request a client controls.
   */
  setPlan(userId: string, plan: Plan, planExpiresAt: number | null, now: number): Promise<void>;

  /** Attach (or update) the Stripe customer and subscription identifiers. */
  setStripeIds(
    userId: string,
    ids: { customerId?: string | null; subId?: string | null },
    now: number,
  ): Promise<void>;

  /**
   * Record a Stripe event id. Returns false when it was already recorded,
   * i.e. this is a redelivery and must not be applied a second time.
   */
  recordStripeEvent(id: string, type: string, now: number): Promise<boolean>;

  createExtensionKey(userId: string, publicKeyJwk: string, now: number): Promise<ExtensionKeyRow>;
  getExtensionKey(id: string): Promise<ExtensionKeyRow | null>;

  createToken(args: CreateTokenArgs): Promise<TokenRow>;
  findTokenByHash(tokenHash: string): Promise<TokenRow | null>;
  revokeToken(tokenHash: string, now: number): Promise<void>;

  createMagicLink(args: CreateMagicLinkArgs): Promise<MagicLinkRow>;
  findMagicLinkByCodeHash(codeHash: string): Promise<MagicLinkRow | null>;
  markMagicLinkUsed(id: string, now: number): Promise<void>;

  createSession(args: CreateSessionArgs): Promise<WebSessionRow>;
  findSessionByHash(sessionHash: string): Promise<WebSessionRow | null>;
  revokeSession(sessionHash: string, now: number): Promise<void>;

  /**
   * Record a nonce. Returns false when it was already recorded, i.e. the
   * signed request is a replay. The check-and-set is atomic: two identical
   * requests racing can never both succeed, which a separate "check then
   * store" pair would allow.
   */
  addNonce(args: NonceArgs): Promise<boolean>;

  createOAuthPending(args: CreateOAuthPendingArgs): Promise<void>;
  findOAuthPending(state: string): Promise<OAuthPendingRow | null>;
  deleteOAuthPending(state: string): Promise<void>;

  /**
   * Fixed-window rate limiting, applied atomically (one upsert per call):
   * the returned `count` already includes this use, so no two concurrent
   * callers can both believe they are inside the limit.
   */
  recordAndCheckRate(args: RateCheckArgs): Promise<RateCheckResult>;

  /**
   * Record one finished analysis: appends a ledger row and bumps that UTC
   * day's counter. The two moves must land together (a transaction in
   * Neon), so the daily quota and the ledger can never diverge.
   */
  recordAnalysis(args: CreateUsageLogArgs): Promise<UsageLogRow>;

  /** Analyses on one UTC day (0 if none). */
  getDailyUsage(userId: string, day: Day): Promise<number>;

  /** Total analyses ever recorded for the user (the trial budget is cumulative). */
  sumUsage(userId: string): Promise<number>;

  /** Ledger rows still on file for the user (the ledger is pruned by retention, the daily counter is not). */
  countUsageLog(userId: string): Promise<number>;

  /** The cached report for this exact (url, model, prompt version), if any. */
  findReport(urlHash: string, model: string, promptVersion: string): Promise<ReportRow | null>;

  /**
   * Store a report in the shared cache. Rejects payloads over the size cap
   * and a second report for the same (url, model, prompt version): the
   * caller is expected to `findReport` first.
   */
  createReport(args: CreateReportArgs): Promise<ReportRow>;

  /**
   * Purge the cache: first the reports whose TTL has lapsed, then (only if
   * still over the cap) the oldest beyond `maxCount`. Returns what was
   * removed, so a periodic job can log it.
   */
  purgeReports(now: number, maxCount: number): Promise<PurgeReportsResult>;

  /** Open a new analysis run. */
  createAnalysisRun(args: CreateAnalysisRunArgs): Promise<AnalysisRunRow>;

  /** The run, or null when it is unknown. Expiry is the caller's to judge. */
  getAnalysisRun(id: string): Promise<AnalysisRunRow | null>;

  /** Replace a run's accumulated state (a stage just produced more of it). */
  updateAnalysisRunState(id: string, state: string, now: number): Promise<void>;

  /**
   * Runs of this account that are still open and were touched since `since`.
   * "Touched recently" rather than "not finalized" is what lets a reader who
   * abandoned an analysis start another one without waiting out its TTL.
   */
  countActiveAnalysisRuns(userId: string, since: number): Promise<number>;

  /**
   * Mark the run finalized, atomically and only once. Returns false when the
   * run was already finalized, which is what stops a replayed finalize from
   * writing a second report or consuming a second credit.
   */
  finalizeAnalysisRun(id: string, now: number): Promise<boolean>;

  /**
   * Remove short-lived rows whose TTL has lapsed (nonces, web sessions,
   * magic links, OAuth handshakes, analysis runs) plus ledger rows older than
   * `usageLogRetentionMs`. Called by a periodic job, not per request.
   */
  purgeExpired(now: number, usageLogRetentionMs: number): Promise<void>;
}
