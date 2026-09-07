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
}
