/**
 * The extension's hosted-mode account handling: the two sign-in paths from
 * `web/BRIDGE.md`, the signed reads of `/v1/account`, and sign-out.
 *
 * It talks to `SecureKeyStorage` rather than owning any storage, so the keypair
 * and token stay in the one encrypted place. `web/BRIDGE.md` is the contract;
 * this is the extension half of it and nothing here invents a route.
 */
import {
  buildSigningInput,
  randomToken,
  signRequest,
  SigningHeaders,
  type P256Jwk,
} from '@squiggle/shared';
import { SecureKeyStorage } from '../crypto/storage';
import { HOSTED_ORIGIN, hostedPontUrl } from './config';

export interface HostedAccount {
  id: string;
  email: string | null;
  plan: 'none' | 'trial' | 'active';
  planExpiresAt: number | null;
  usage: { used: number; limit: number; remaining: number; resetsAt: number | null };
}

/** A named failure the panel renders in French; `code` is for tests, never shown. */
export class HostedAuthError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'HostedAuthError';
    this.code = code;
  }
}

/**
 * The error codes `web/BRIDGE.md` §4 requires the extension to handle, in the
 * reader's language. Anything unrecognised gets the honest generic message
 * rather than a raw English server string.
 */
export function redeemErrorMessage(code: string): string {
  switch (code) {
    case 'invalid_code':
      return 'Ce code n’est pas valide. Vérifiez la saisie.';
    case 'invalid_key':
      return 'La clé de cette installation est invalide. Relancez la connexion.';
    case 'link_already_used':
      return 'Ce code a déjà été utilisé. Demandez-en un nouveau.';
    case 'invalid_session':
      return 'La session web a expiré. Reconnectez-vous sur le site.';
    case 'origin_not_allowed':
      return 'Le site a refusé la demande. Réessayez depuis l’extension.';
    case 'expired_link':
      return 'Ce code a expiré. Demandez-en un nouveau.';
    case 'rate_limited':
      return 'Trop de tentatives. Réessayez dans un moment.';
    default:
      return 'La connexion a échoué. Réessayez.';
  }
}

function parseJwk(value: unknown): P256Jwk | null {
  const raw = typeof value === 'string' ? safeJson(value) : value;
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.kty !== 'EC' || o.crv !== 'P-256') return null;
  if (typeof o.x !== 'string' || typeof o.y !== 'string') return null;
  return { kty: 'EC', crv: 'P-256', x: o.x, y: o.y };
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** Does the server's public key equal the one this install generated? */
export function sameP256Jwk(expected: P256Jwk, received: unknown): boolean {
  const other = parseJwk(received);
  if (!other) return false;
  return expected.x === other.x && expected.y === other.y;
}

async function readPayload(res: Response): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await res.json();
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * The Chromium landing page stores what the web app navigated with. `pub` is
 * the exact string the install sent, so it must match the generated key before
 * anything is written.
 */
export async function completeChromiumAuth(
  storage: SecureKeyStorage,
  params: { token: string; pub: string; keyId: string }
): Promise<void> {
  const { publicKeyJwk } = await storage.getOrCreateHostedKeyPair();
  if (!sameP256Jwk(publicKeyJwk, params.pub)) {
    throw new HostedAuthError(
      'key_mismatch',
      'Cette connexion ne correspond pas à cette installation. Relancez-la depuis les réglages.'
    );
  }
  await storage.saveHostedSession({ token: params.token, keyId: params.keyId });
}

/**
 * Firefox's manual path: redeem the typed 8-character code. No cookie is sent,
 * which is exactly what `web/BRIDGE.md` §3 requires of the extension.
 */
export async function redeemHostedCode(
  storage: SecureKeyStorage,
  code: string,
  fetchImpl: typeof fetch = fetch
): Promise<HostedAccount | null> {
  const { publicKeyJwk } = await storage.getOrCreateHostedKeyPair();

  let res: Response;
  try {
    res = await fetchImpl(`${HOSTED_ORIGIN}/auth/bridge/redeem`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });
  } catch {
    throw new HostedAuthError('network', 'Impossible de joindre le serveur. Vérifiez votre connexion.');
  }

  const payload = await readPayload(res);
  if (!res.ok || payload?.ok !== true) {
    const codeName = typeof payload?.error === 'string' ? payload.error : 'internal';
    throw new HostedAuthError(codeName, redeemErrorMessage(codeName));
  }

  if (!sameP256Jwk(publicKeyJwk, payload.publicKeyJwk)) {
    throw new HostedAuthError(
      'key_mismatch',
      'Le serveur a lié ce code à une autre clé. Relancez la connexion.'
    );
  }

  await storage.saveHostedSession({
    token: String(payload.token ?? ''),
    keyId: String(payload.keyId ?? ''),
    userId: typeof payload.userId === 'string' ? payload.userId : undefined,
  });

  return fetchHostedAccount(storage, fetchImpl).catch(() => null);
}

/**
 * Read `/v1/account` with a signed request. On an invalid token the stale
 * session is cleared here so the panel falls back to the sign-in state instead
 * of retrying a dead credential forever.
 */
export async function fetchHostedAccount(
  storage: SecureKeyStorage,
  fetchImpl: typeof fetch = fetch
): Promise<HostedAccount> {
  const session = await storage.getHostedSession();
  if (!session) throw new HostedAuthError('not_signed_in', 'Connectez-vous pour utiliser le mode hébergé.');

  const path = '/v1/account';
  const nonce = randomToken(16);
  const timestamp = Math.floor(Date.now() / 1000);
  const input = await buildSigningInput({ method: 'GET', path, nonce, timestamp, body: null });
  const signature = await signRequest(session.privateKey, input);

  let res: Response;
  try {
    res = await fetchImpl(`${HOSTED_ORIGIN}${path}`, {
      headers: {
        [SigningHeaders.authorization]: `Bearer ${session.token}`,
        [SigningHeaders.signature]: signature,
        [SigningHeaders.nonce]: nonce,
        [SigningHeaders.timestamp]: String(timestamp),
      },
    });
  } catch {
    throw new HostedAuthError('network', 'Impossible de joindre le serveur. Vérifiez votre connexion.');
  }

  const payload = await readPayload(res);
  if (!res.ok || payload?.ok !== true) {
    const codeName = typeof payload?.error === 'string' ? payload.error : 'internal';
    if (codeName === 'invalid_token') {
      await storage.clearHostedSession();
      throw new HostedAuthError('expired', 'Votre connexion a expiré. Reconnectez-vous.');
    }
    throw new HostedAuthError(codeName, 'Impossible de lire l’état de votre compte.');
  }

  return payload as unknown as HostedAccount;
}

/** `chrome.runtime.id`, or the Firefox polyfill's, or empty outside a browser. */
export function extensionId(): string {
  const api = (globalThis as { chrome?: typeof chrome; browser?: typeof chrome }).chrome ??
    (globalThis as { browser?: typeof chrome }).browser;
  return api?.runtime?.id ?? '';
}

/**
 * Begin the Chromium/Firefox sign-in: create the install keypair if needed and
 * open the web app's bridge page. Firefox cannot use the automatic navigation
 * that follows, so its caller also shows the code input.
 */
export async function beginHostedSignIn(storage: SecureKeyStorage): Promise<string> {
  const { publicKeyJwk } = await storage.getOrCreateHostedKeyPair();
  const url = hostedPontUrl(extensionId(), JSON.stringify(publicKeyJwk));
  openTab(url);
  return url;
}

function openTab(url: string): void {
  const api = (globalThis as { chrome?: typeof chrome; browser?: typeof chrome }).chrome ??
    (globalThis as { browser?: typeof chrome }).browser;
  const create = api?.tabs?.create;
  if (typeof create === 'function') {
    void create({ url });
    return;
  }
  if (typeof window !== 'undefined') window.open(url, '_blank');
}

/** Forget the local token. A server-side revoke endpoint does not exist yet. */
export async function signOutHosted(storage: SecureKeyStorage): Promise<void> {
  await storage.clearHostedSession();
}

// ---------------------------------------------------------------------------
// Account presentation
// ---------------------------------------------------------------------------

export type HostedAccountState =
  | 'trial'
  | 'trial_exhausted'
  | 'active'
  | 'quota_exhausted'
  | 'lapsed';

export interface HostedAccountView {
  state: HostedAccountState;
  title: string;
  detail: string;
  canAnalyse: boolean;
  needsSubscription: boolean;
}

/**
 * The four states the product defines, as text. Mirrors `web/src/usage.ts` so
 * the extension and the web app tell the reader the same thing; kept as its own
 * function because the two packages cannot import each other.
 */
export function describeHostedAccount(account: HostedAccount): HostedAccountView {
  const { plan, usage } = account;

  if (plan === 'trial') {
    if (usage.remaining > 0) {
      return {
        state: 'trial',
        title: 'Analyse d’essai',
        detail:
          usage.remaining === 1
            ? 'Il vous reste 1 analyse offerte.'
            : `Il vous reste ${usage.remaining} analyses offertes.`,
        canAnalyse: true,
        needsSubscription: false,
      };
    }
    return {
      state: 'trial_exhausted',
      title: 'Essai épuisé',
      detail: 'Vos analyses offertes sont utilisées. Un abonnement les débloque à nouveau.',
      canAnalyse: false,
      needsSubscription: true,
    };
  }

  if (plan === 'active') {
    if (usage.remaining > 0) {
      return {
        state: 'active',
        title: 'Abonnement actif',
        detail: `Il vous reste ${usage.remaining} analyse${usage.remaining > 1 ? 's' : ''} aujourd’hui.`,
        canAnalyse: true,
        needsSubscription: false,
      };
    }
    return {
      state: 'quota_exhausted',
      title: 'Quota du jour atteint',
      detail: 'Vos analyses du jour sont utilisées. Le compteur repart à minuit UTC.',
      canAnalyse: false,
      needsSubscription: false,
    };
  }

  return {
    state: 'lapsed',
    title: 'Abonnement expiré',
    detail: 'Renouvelez votre abonnement ou repassez en clé personnelle.',
    canAnalyse: false,
    needsSubscription: true,
  };
}
