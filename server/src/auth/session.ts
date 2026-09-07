/**
 * Web-app sessions (the logged-in state of the hosted web app).
 *
 * A session is an opaque random token handed out in an `HttpOnly; Secure`
 * cookie; only its SHA-256 hash is stored. Sessions are short-lived by
 * design (30 days) and revocable. The extension never uses sessions — it
 * uses signed tokens, which is what keeps a compromised web session from
 * being able to sign API requests.
 */
import { randomToken, sha256Hex } from '@squiggle/shared';

import type { Clock } from '../lib/clock';
import type { Db, UserRow } from '../db/types';

export const SESSION_COOKIE = 'squiggle_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionDeps {
  db: Db;
  clock: Clock;
}

/** Read a single named cookie from the request, or null. */
export function cookieValue(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

/** The user this request's session belongs to, or null (no / bad / expired session). */
export async function sessionUser(deps: SessionDeps, req: Request): Promise<UserRow | null> {
  const raw = cookieValue(req, SESSION_COOKIE);
  if (!raw) return null;
  const session = await deps.db.findSessionByHash(await sha256Hex(raw));
  if (!session || session.revokedAt !== null) return null;
  if (session.expiresAt <= deps.clock.now()) return null;
  return deps.db.getUserById(session.userId);
}

/** Create a session for a user and return the raw token (to put in the cookie). */
export async function createWebSession(deps: SessionDeps, userId: string): Promise<string> {
  const token = randomToken(32);
  await deps.db.createSession({
    userId,
    sessionHash: await sha256Hex(token),
    now: deps.clock.now(),
    ttlMs: SESSION_TTL_MS,
  });
  return token;
}

/** The `Set-Cookie` value establishing a session. */
export function sessionSetCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`;
}

/** The `Set-Cookie` value ending a session. */
export function sessionClearCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}
