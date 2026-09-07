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

import type {
  CreateMagicLinkArgs,
  CreateOAuthPendingArgs,
  CreateSessionArgs,
  CreateTokenArgs,
  CreateUserArgs,
  Db,
  ExtensionKeyRow,
  MagicLinkRow,
  NonceArgs,
  NonceRow,
  OAuthPendingRow,
  RateCheckArgs,
  RateCheckResult,
  TokenRow,
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
      plan: 'none',
      planExpiresAt: null,
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
}
