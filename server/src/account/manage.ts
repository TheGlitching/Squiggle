/**
 * What a signed-in reader can do to their own account data: change the
 * address, see and revoke the installs, erase the account. These are the
 * rights `PRIVACY.md` promises (rectification, erasure) and the remedy
 * `SECURITY.md` names for a stolen install key.
 *
 * They are reachable only with a web session (`/web/account/*`), never with an
 * install's signature. An install key can analyse articles; it must not be able
 * to rewrite the account's address or delete it, and a stolen one must not be
 * able to outlive its own revocation by revoking the person who revokes it.
 */
import { sha256Hex } from '@squiggle/shared';

import { MAGIC_LINK_EMAIL_LIMIT_PER_HOUR, MAGIC_LINK_IP_LIMIT_PER_HOUR, MAGIC_LINK_TTL_MS, normalizeEmail } from '../auth/magicLink';
import { cancelSubscription, updateCustomerEmail, type StripeConfig } from '../billing/stripe';
import type { Db, InstallRow, UserRow } from '../db/types';
import type { EmailSender } from '../lib/brevo';
import type { Clock } from '../lib/clock';
import { apiError, type Outcome } from '../lib/errors';
import { generateHumanCode, normalizeHumanCode } from '../lib/humanCode';
import { logEvent } from '../lib/log';
import { HOUR_MS } from '../usage/abuse';
import { EMAIL_CHANGE_RATE_SCOPE } from './rateScopes';

export interface ManageDeps {
  db: Db;
  clock: Clock;
  requestId: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** An account may ask for this many address changes per hour. */
export const EMAIL_CHANGE_LIMIT_PER_HOUR = 3;

export async function listInstalls(deps: ManageDeps, user: UserRow): Promise<Outcome<{ installs: InstallRow[] }>> {
  return { ok: true, installs: await deps.db.listInstalls(user.id, deps.clock.now()) };
}

export async function revokeInstall(
  deps: ManageDeps,
  user: UserRow,
  keyId: unknown,
): Promise<Outcome<object>> {
  if (typeof keyId !== 'string' || keyId.length === 0) {
    return apiError('invalid_payload', 'Requête invalide : id.');
  }
  if (!(await deps.db.revokeInstall(user.id, keyId, deps.clock.now()))) {
    return apiError('not_found', 'Cette installation est introuvable ou déjà révoquée.');
  }
  logEvent({ event: 'install_revoked', requestId: deps.requestId, userId: user.id });
  return { ok: true };
}

export interface EmailChangeDeps extends ManageDeps {
  email: EmailSender;
  webAppOrigin: string;
}

/**
 * Send a confirmation code to the NEW address. Nothing changes until the
 * reader types it back, so a typo cannot lock them out of their own account
 * and an address they do not control cannot be attached to it.
 *
 * The answer is the same whether or not the address is already taken by
 * another account: a signed-in account must not be able to ask "who is
 * registered here?" one address at a time. The reader who really owns the
 * address simply gets no code.
 */
export async function requestEmailChange(
  deps: EmailChangeDeps,
  user: UserRow,
  rawEmail: unknown,
  ip: string | null,
): Promise<Outcome<{ sent: true }>> {
  const email = normalizeEmail(typeof rawEmail === 'string' ? rawEmail : '');
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return apiError('invalid_email', 'Please provide a valid email address.');
  }
  const now = deps.clock.now();

  const perAccount = await deps.db.recordAndCheckRate({
    scope: EMAIL_CHANGE_RATE_SCOPE,
    key: user.id,
    limit: EMAIL_CHANGE_LIMIT_PER_HOUR,
    windowMs: HOUR_MS,
    now,
  });
  // The same per-address and per-network budgets as a login code: this
  // endpoint must not be a second way to send a stranger's mailbox mail.
  const perAddress = await deps.db.recordAndCheckRate({
    scope: 'magic_link:email',
    key: email,
    limit: MAGIC_LINK_EMAIL_LIMIT_PER_HOUR,
    windowMs: HOUR_MS,
    now,
  });
  const perIp = ip
    ? await deps.db.recordAndCheckRate({
        scope: 'magic_link:ip',
        key: ip,
        limit: MAGIC_LINK_IP_LIMIT_PER_HOUR,
        windowMs: HOUR_MS,
        now,
      })
    : null;
  if (!perAccount.allowed || !perAddress.allowed || (perIp && !perIp.allowed)) {
    logEvent({
      event: 'rate_limited',
      requestId: deps.requestId,
      userId: user.id,
      scope: !perAccount.allowed ? EMAIL_CHANGE_RATE_SCOPE : !perAddress.allowed ? 'magic_link:email' : 'magic_link:ip',
    });
    return apiError('rate_limited', 'Trop de demandes. Réessayez dans un moment.');
  }

  // Already the account's address, or someone else's: nothing to send.
  const holder = await deps.db.getUserByEmail(email);
  if (holder) return { ok: true, sent: true };

  const code = generateHumanCode(8);
  await deps.db.createMagicLink({
    email,
    codeHash: await sha256Hex(code),
    ip,
    changeUserId: user.id,
    now,
    ttlMs: MAGIC_LINK_TTL_MS,
  });
  const linkUrl = `${deps.webAppOrigin}/compte?email-code=${encodeURIComponent(code)}`;
  try {
    await deps.email.send({
      to: email,
      subject: 'Confirmez votre nouvelle adresse Squiggle',
      html: [
        '<p>Voici le code pour utiliser cette adresse sur votre compte Squiggle :</p>',
        `<p style="font-size:24px;letter-spacing:4px"><strong>${code}</strong></p>`,
        '<p>Ou cliquez sur ce lien, valable 10 minutes :</p>',
        `<p><a href="${linkUrl}">Confirmer cette adresse</a></p>`,
        '<p>Si vous n’avez pas demandé ce changement, vous pouvez ignorer cet e-mail.</p>',
      ].join('\n'),
    });
  } catch {
    return apiError('internal', 'We could not send the email right now. Please try again.');
  }
  return { ok: true, sent: true };
}

export interface EmailConfirmDeps extends ManageDeps {
  stripe?: StripeConfig;
}

/** Consume the code and switch the account to the address it was sent to. */
export async function confirmEmailChange(
  deps: EmailConfirmDeps,
  user: UserRow,
  rawCode: unknown,
): Promise<Outcome<{ email: string }>> {
  const code = normalizeHumanCode(typeof rawCode === 'string' ? rawCode : '');
  if (!code) return apiError('invalid_code', 'The code is missing.');

  const now = deps.clock.now();
  const link = await deps.db.findMagicLinkByCodeHash(await sha256Hex(code));
  // A code issued for another account, or a plain login code, is not a
  // pending change of THIS account: it does not exist as far as we say.
  if (!link || link.changeUserId !== user.id) return apiError('invalid_code', 'This code is not valid.');
  if (link.usedAt !== null) return apiError('link_already_used', 'This code has already been used.');
  if (link.expiresAt <= now) return apiError('expired_link', 'This code has expired. Request a new one.');

  await deps.db.markMagicLinkUsed(link.id, now);
  // The address could have been registered by someone else since the code
  // went out. Only the owner of that mailbox can be reading this.
  if (!(await deps.db.setEmail(user.id, link.email, now))) {
    return apiError('email_taken', 'Cette adresse est déjà utilisée par un autre compte.');
  }
  logEvent({ event: 'email_changed', requestId: deps.requestId, userId: user.id });

  // Receipts follow the address. A failure here does not undo the change (the
  // account's own address is ours to keep right); it is logged so it is seen.
  if (deps.stripe && user.stripeCustomerId) {
    const synced = await updateCustomerEmail(deps.stripe, user.stripeCustomerId, link.email);
    if (!synced.ok) {
      logEvent({ event: 'stripe_email_sync_failed', requestId: deps.requestId, userId: user.id, code: synced.code });
    }
  }
  return { ok: true, email: link.email };
}

export interface DeleteDeps extends ManageDeps {
  stripe?: StripeConfig;
}

/**
 * Erase the account. A live subscription is cancelled FIRST and the deletion
 * only goes ahead if Stripe agreed: the other order could leave someone gone
 * from our database and still billed, with nothing left to retry from.
 *
 * `confirm` has to be the literal `true`; the web app sends it only after the
 * reader has read what is erased, and a client that forgets it deletes nothing.
 */
export async function deleteAccount(
  deps: DeleteDeps,
  user: UserRow,
  confirm: unknown,
): Promise<Outcome<object>> {
  if (confirm !== true) return apiError('invalid_payload', 'Requête invalide : confirm.');

  if (user.stripeSubId) {
    if (!deps.stripe) {
      return apiError('billing_unavailable', 'Le service de paiement est indisponible : réessayez plus tard.');
    }
    const cancelled = await cancelSubscription(deps.stripe, user.stripeSubId);
    if (!cancelled.ok) return cancelled;
  }

  await deps.db.deleteUser(user.id);
  logEvent({ event: 'account_deleted', requestId: deps.requestId, userId: user.id });
  return { ok: true };
}
