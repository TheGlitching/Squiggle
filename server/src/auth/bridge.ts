/**
 * The manual extension bridge, for Firefox.
 *
 * Chrome can be navigated straight from the web app into the extension
 * (`chrome-extension://…/squiggle-auth?token=…`), but Firefox refuses that
 * navigation. The fallback is a short code the reader types into the
 * extension.
 *
 * Two halves, and the split is the security property:
 *
 *  - `issueBridgeCode` runs behind the reader's web session and the Origin
 *    check. It validates the install's public key and stores a hash of the
 *    code together with that key. It mints NO token: a leaked database row
 *    is a public key and a hash, nothing usable.
 *
 *  - `redeemBridgeCode` runs from the extension, authenticated by the code
 *    itself (a 40-bit secret, rate limited per IP). Only here, exactly once,
 *    is the extension token minted and returned.
 *
 * A redeem that carries a web session cookie must present the session that
 * issued the code; a mismatched one is refused. The extension presents no
 * cookie, and that is the normal path.
 */
import { sha256Hex } from '@squiggle/shared';

import { claimExtensionToken, normalizeP256Jwk } from './claim';
import type { Clock } from '../lib/clock';
import { apiError, type Outcome } from '../lib/errors';
import { generateHumanCode, normalizeHumanCode } from '../lib/humanCode';
import { logEvent } from '../lib/log';
import type { Db } from '../db/types';
import { HOUR_MS } from '../usage/abuse';

/** How long a typed-in code stays valid. Short: it is entered immediately. */
export const BRIDGE_CODE_TTL_MS = 10 * 60 * 1000;

/** A code is exactly this many characters. */
export const BRIDGE_CODE_LENGTH = 8;

/** Redeem attempts one IP may make per hour, against code guessing. */
export const BRIDGE_REDEEM_PER_IP_PER_HOUR = 30;

export interface BridgeDeps {
  db: Db;
  clock: Clock;
  requestId?: string;
}

/** The browser half: store a code bound to the session and the install's key. */
export async function issueBridgeCode(
  deps: BridgeDeps,
  input: { userId: string; sessionHash: string; publicKeyJwk: unknown },
): Promise<Outcome<{ code: string; expiresAt: number }>> {
  const jwk = normalizeP256Jwk(input.publicKeyJwk);
  if (!jwk) return apiError('invalid_key', 'Expected a P-256 (EC) public key in JWK form.');

  const now = deps.clock.now();
  const code = generateHumanCode(BRIDGE_CODE_LENGTH);
  const row = await deps.db.createBridgeCode({
    codeHash: await sha256Hex(code),
    userId: input.userId,
    sessionHash: input.sessionHash,
    publicKeyJwk: JSON.stringify(jwk),
    now,
    ttlMs: BRIDGE_CODE_TTL_MS,
  });
  return { ok: true, code, expiresAt: row.expiresAt };
}

/** The extension half: exchange a typed code for this install's token, once. */
export async function redeemBridgeCode(
  deps: BridgeDeps,
  input: { code: string; ip?: string | null; sessionHash?: string | null },
): Promise<Outcome<{ token: string; keyId: string; userId: string; publicKeyJwk: string }>> {
  const code = normalizeHumanCode(input.code);
  if (!code) return apiError('invalid_code', 'Entrez le code affiché sur la page.');

  const now = deps.clock.now();
  const ip = input.ip ?? null;
  if (ip) {
    const perIp = await deps.db.recordAndCheckRate({
      scope: 'bridge:redeem:ip',
      key: ip,
      limit: BRIDGE_REDEEM_PER_IP_PER_HOUR,
      windowMs: HOUR_MS,
      now,
    });
    if (!perIp.allowed) {
      logEvent({ event: 'rate_limited', requestId: deps.requestId ?? '', scope: 'bridge:redeem:ip', count: perIp.count });
      return apiError('rate_limited', 'Trop de tentatives. Réessayez plus tard.');
    }
  }

  const row = await deps.db.findBridgeCodeByHash(await sha256Hex(code));
  if (!row) return apiError('invalid_code', 'Ce code n’est pas valide.');
  if (row.usedAt !== null) return apiError('link_already_used', 'Ce code a déjà été utilisé.');
  if (row.expiresAt <= now) return apiError('expired_link', 'Ce code a expiré. Demandez-en un nouveau.');

  // A browser session may be present on some paths; if so it must be the one
  // that asked for the code. The extension sends none, and that is fine.
  if (input.sessionHash && input.sessionHash !== row.sessionHash) {
    return apiError('invalid_session', 'Ce code n’appartient pas à cette session.');
  }

  // Single use, enforced at the database: two racing redeems cannot both win.
  const marked = await deps.db.markBridgeCodeUsed(row.id, now);
  if (!marked) return apiError('link_already_used', 'Ce code a déjà été utilisé.');

  const user = await deps.db.getUserById(row.userId);
  if (!user) return apiError('invalid_code', 'Ce code n’est pas valide.');

  const claim = await claimExtensionToken(deps, user, JSON.parse(row.publicKeyJwk) as unknown);
  if (!claim.ok) return claim;
  return { ...claim, publicKeyJwk: row.publicKeyJwk };
}