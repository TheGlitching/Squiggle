/**
 * The web app's client for the hosted API.
 *
 * Every call assumes the `squiggle_session` HttpOnly cookie, so every one is
 * sent with `credentials: 'include'`. The web app never holds a token or a
 * key: the server does. `VITE_API_BASE_URL` is empty in production, where the
 * app and the API are the same origin.
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export type Plan = 'none' | 'trial' | 'active';

export interface Account {
  id: string;
  email: string | null;
  plan: Plan;
  planExpiresAt: number | null;
  usage: { used: number; limit: number; remaining: number; resetsAt: number | null };
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('content-type', 'application/json');
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'include' });

  interface Payload {
    ok?: boolean;
    error?: string;
    message?: string;
  }
  let payload: Payload | null = null;
  try {
    payload = (await res.json()) as Payload;
  } catch {
    payload = null;
  }
  if (!res.ok || !payload || payload.ok !== true) {
    throw new ApiError(payload?.error ?? 'internal', payload?.message ?? 'Le serveur a refusé la demande.', res.status);
  }
  return payload as T;
}

/** The signed-in account, or null when there is no valid session. */
export async function getAccount(): Promise<Account | null> {
  try {
    return await call<Account & { ok: true }>('/web/account');
  } catch (err) {
    if (err instanceof ApiError && err.code === 'invalid_session') return null;
    throw err;
  }
}

export function requestMagicLink(email: string): Promise<{ sent: true }> {
  return call('/auth/magic-link', { method: 'POST', body: JSON.stringify({ email }) });
}

export function verifyMagicLink(code: string): Promise<{ userId: string; email: string }> {
  return call('/auth/magic-link/verify', { method: 'POST', body: JSON.stringify({ code }) });
}

export function logout(): Promise<{ ok: true }> {
  return call('/auth/logout', { method: 'POST' });
}

export async function startCheckout(): Promise<string> {
  const { url } = await call<{ url: string }>('/web/account/checkout', { method: 'POST', body: '{}' });
  return url;
}

export async function openPortal(): Promise<string> {
  const { url } = await call<{ url: string }>('/web/account/portal', { method: 'POST', body: '{}' });
  return url;
}

/** Exchange the web session for an extension token bound to `publicKeyJwk`. */
export function claimExtension(
  publicKeyJwk: unknown,
): Promise<{ token: string; keyId: string; userId: string }> {
  return call('/auth/claim', { method: 'POST', body: JSON.stringify({ publicKeyJwk }) });
}

/** Issue a short manual code for a reader to type into the extension. */
export function issueBridgeCode(publicKeyJwk: unknown): Promise<{ code: string; expiresAt: number }> {
  return call('/web/bridge/code', { method: 'POST', body: JSON.stringify({ publicKeyJwk }) });
}

export function googleSignInUrl(): string {
  return `${API_BASE}/auth/google`;
}

/**
 * A reader-facing French message for an API error. The server's own messages
 * are the fallback but several are internal English; the codes a reader can
 * actually hit are named here.
 */
const FRENCH_ERRORS: Record<string, string> = {
  invalid_email: 'Cette adresse e-mail n’est pas valide.',
  invalid_code: 'Ce code n’est pas valide.',
  link_already_used: 'Ce code a déjà été utilisé.',
  expired_link: 'Ce code a expiré. Demandez-en un nouveau.',
  rate_limited: 'Trop de tentatives. Réessayez dans un moment.',
  invalid_session: 'Votre session a expiré. Reconnectez-vous.',
  invalid_key: 'La clé de l’extension est invalide.',
  billing_unavailable: 'Le paiement est momentanément indisponible.',
  not_found: 'Aucun abonnement à gérer pour ce compte.',
  origin_not_allowed: 'Origine non autorisée.',
  internal: 'Une erreur est survenue. Réessayez.',
};

export function messageForError(err: unknown): string {
  if (err instanceof ApiError) return FRENCH_ERRORS[err.code] ?? err.message;
  return 'Une erreur est survenue. Réessayez.';
}
