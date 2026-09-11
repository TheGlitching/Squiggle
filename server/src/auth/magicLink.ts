/**
 * Magic-link login: the passwordless path into the web app.
 *
 * `requestMagicLink` validates the address, applies two independent
 * fixed-window rate limits (per email and per client IP) to make bulk
 * code-requesting unprofitable, stores the code only as its SHA-256 hash,
 * and asks the email sender to deliver a short-lived link.
 *
 * `verifyMagicLink` consumes the code exactly once, marks the address
 * verified, finds or creates the account, and opens a web session.
 */
import { randomToken, sha256Hex } from '@squiggle/shared';

import type { Clock } from '../lib/clock';
import { apiError, type Outcome } from '../lib/errors';
import { logEvent } from '../lib/log';
import type { EmailSender } from '../lib/brevo';
import type { Db } from '../db/types';
import { HOUR_MS, MAGIC_LINK_VERIFY_PER_IP_PER_HOUR } from '../usage/abuse';
import { createWebSession } from './session';

export interface MagicLinkRequestDeps {
  db: Db;
  clock: Clock;
  email: EmailSender;
  /** Absolute origin of the web app; the delivered link points here. */
  webAppOrigin: string;
  /** Correlation id of the request, for the rate-limit log line. */
  requestId?: string;
}

export interface MagicLinkVerifyDeps {
  db: Db;
  clock: Clock;
  /** Correlation id of the request, for the rate-limit log line. */
  requestId?: string;
}

/** Codes stop working 10 minutes after they are created. */
export const MAGIC_LINK_TTL_MS = 10 * 60 * 1000;
/** An address may trigger at most this many codes per hour. */
export const MAGIC_LINK_EMAIL_LIMIT_PER_HOUR = 3;
/** A client IP may trigger at most this many codes per hour (any address). */
export const MAGIC_LINK_IP_LIMIT_PER_HOUR = 5;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trim and casefold an address; the canonical form used as a key everywhere. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function requestMagicLink(
  deps: MagicLinkRequestDeps,
  input: { email: string; ip?: string | null },
): Promise<Outcome<{ sent: true }>> {
  const email = normalizeEmail(input.email);
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return apiError('invalid_email', 'Please provide a valid email address.');
  }
  const now = deps.clock.now();

  const perEmail = await deps.db.recordAndCheckRate({
    scope: 'magic_link:email',
    key: email,
    limit: MAGIC_LINK_EMAIL_LIMIT_PER_HOUR,
    windowMs: HOUR_MS,
    now,
  });
  if (!perEmail.allowed) {
    // Logged with its scope and count, never with the address: an operator
    // needs to see that a limit is firing, not who tripped it.
    logEvent({ event: 'rate_limited', requestId: deps.requestId ?? '', scope: 'magic_link:email', count: perEmail.count });
    return apiError('rate_limited', 'Too many magic links requested for this address. Try again later.');
  }

  const ip = input.ip ?? null;
  if (ip) {
    const perIp = await deps.db.recordAndCheckRate({
      scope: 'magic_link:ip',
      key: ip,
      limit: MAGIC_LINK_IP_LIMIT_PER_HOUR,
      windowMs: HOUR_MS,
      now,
    });
    if (!perIp.allowed) {
      // An IP is shared by whole offices and mobile carriers, so this limit is
      // a loose backstop behind the per-address one, and every denial is
      // visible here — a shared network that keeps tripping it should be seen,
      // not silently locked out.
      logEvent({ event: 'rate_limited', requestId: deps.requestId ?? '', scope: 'magic_link:ip', count: perIp.count });
      return apiError('rate_limited', 'Too many magic link requests from this network. Try again later.');
    }
  }

  const code = randomToken(16);
  await deps.db.createMagicLink({
    email,
    codeHash: await sha256Hex(code),
    ip,
    now,
    ttlMs: MAGIC_LINK_TTL_MS,
  });

  const linkUrl = `${deps.webAppOrigin}/magic-link?code=${encodeURIComponent(code)}`;
  try {
    await deps.email.send({
      to: email,
      subject: 'Your Squiggle login link',
      html: magicLinkEmailHtml(linkUrl),
    });
  } catch {
    return apiError('internal', 'We could not send the email right now. Please try again.');
  }

  return { ok: true, sent: true };
}

function magicLinkEmailHtml(linkUrl: string): string {
  return [
    '<p>Use this link to sign in to Squiggle. It expires in 10 minutes:</p>',
    `<p><a href="${linkUrl}">${linkUrl}</a></p>`,
    '<p>If you did not ask for this, you can ignore this email.</p>',
  ].join('\n');
}

export async function verifyMagicLink(
  deps: MagicLinkVerifyDeps,
  code: string,
  ip?: string | null,
): Promise<Outcome<{ userId: string; email: string; sessionToken: string }>> {
  const normalized = code.trim();
  if (!normalized) return apiError('invalid_code', 'The code is missing.');

  const now = deps.clock.now();

  // A code is 128 bits of randomness, so this is not what stops a guess; it
  // stops a client from turning the endpoint into free traffic while it tries.
  if (ip) {
    const perIp = await deps.db.recordAndCheckRate({
      scope: 'magic_link:verify_ip',
      key: ip,
      limit: MAGIC_LINK_VERIFY_PER_IP_PER_HOUR,
      windowMs: HOUR_MS,
      now,
    });
    if (!perIp.allowed) {
      logEvent({ event: 'rate_limited', requestId: deps.requestId ?? '', scope: 'magic_link:verify_ip', count: perIp.count });
      return apiError('rate_limited', 'Too many attempts from this network. Try again later.');
    }
  }
  const link = await deps.db.findMagicLinkByCodeHash(await sha256Hex(normalized));
  if (!link) return apiError('invalid_code', 'This code is not valid.');
  if (link.usedAt !== null) return apiError('link_already_used', 'This code has already been used.');
  if (link.expiresAt <= now) return apiError('expired_link', 'This code has expired. Request a new one.');

  await deps.db.markMagicLinkUsed(link.id, now);

  let user = await deps.db.getUserByEmail(link.email);
  if (!user) {
    user = await deps.db.createUser({ email: link.email, emailVerified: true }, now);
  } else if (!user.emailVerified) {
    await deps.db.markEmailVerified(user.id, now);
  }

  const sessionToken = await createWebSession(deps, user.id);
  return { ok: true, userId: user.id, email: link.email, sessionToken };
}
