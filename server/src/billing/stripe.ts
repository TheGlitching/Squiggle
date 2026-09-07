/**
 * The Stripe surface: creating a Checkout session, creating a customer-portal
 * session, and verifying a webhook signature.
 *
 * No SDK. Stripe's REST API is form-encoded requests and JSON replies, and the
 * three calls we make are small; a dependency here would be a supply-chain
 * surface and a bundle in a Workers runtime for no reduction in code. The one
 * piece with real subtlety — the webhook signature — is implemented against
 * the documented scheme and tested against forged, stale and tampered inputs.
 *
 * `fetchImpl` is injected so the whole of this module is exercised in tests
 * against a fake Stripe, with no account and no network.
 */
import { apiError, type Outcome } from '../lib/errors';

const STRIPE_API = 'https://api.stripe.com/v1';

/** Signed payloads older than this are refused (Stripe's own recommendation). */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

export interface StripeConfig {
  secretKey: string;
  /** The recurring price the subscription is sold at (a `price_…` id). */
  priceId: string;
  webhookSecret: string;
  fetchImpl?: typeof fetch;
}

async function stripePost(
  config: StripeConfig,
  path: string,
  form: Record<string, string>,
): Promise<Outcome<{ data: Record<string, unknown> }>> {
  const fetchImpl = config.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl(`${STRIPE_API}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.secretKey}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(form).toString(),
    });
  } catch {
    return apiError('billing_unavailable', 'Le service de paiement est momentanément indisponible.');
  }
  if (!res.ok) {
    // Stripe's error body can echo the parameters we sent; it is never
    // forwarded to the caller and never logged.
    return apiError('billing_unavailable', 'Le service de paiement a refusé la demande.');
  }
  return { ok: true, data: (await res.json()) as Record<string, unknown> };
}

export interface CheckoutArgs {
  config: StripeConfig;
  /** Our account id, carried through Stripe so the webhook can find it again. */
  userId: string;
  /** Prefills the Checkout page. Optional: a Google account may have no address on file. */
  email: string | null;
  /** Existing Stripe customer, when the account already has one. */
  customerId: string | null;
  successUrl: string;
  cancelUrl: string;
}

export async function createCheckoutSession(args: CheckoutArgs): Promise<Outcome<{ url: string }>> {
  const form: Record<string, string> = {
    mode: 'subscription',
    'line_items[0][price]': args.config.priceId,
    'line_items[0][quantity]': '1',
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    // Our own id travels with the session and comes back on every event, so
    // the webhook never has to guess which account an event belongs to.
    'metadata[user_id]': args.userId,
    'subscription_data[metadata][user_id]': args.userId,
    // VAT is Stripe's to compute from the customer's country; the price is
    // declared tax-inclusive in the dashboard, so nothing about it is decided
    // in this code.
    'automatic_tax[enabled]': 'true',
    customer_update: args.customerId ? 'auto' : '',
  };
  if (args.customerId) form.customer = args.customerId;
  else if (args.email) form.customer_email = args.email;
  if (!args.customerId) delete form.customer_update;

  const res = await stripePost(args.config, '/checkout/sessions', form);
  if (!res.ok) return res;
  const url = res.data.url;
  if (typeof url !== 'string') {
    return apiError('billing_unavailable', 'Le service de paiement a renvoyé une réponse inattendue.');
  }
  return { ok: true, url };
}

export async function createPortalSession(
  config: StripeConfig,
  customerId: string,
  returnUrl: string,
): Promise<Outcome<{ url: string }>> {
  const res = await stripePost(config, '/billing_portal/sessions', {
    customer: customerId,
    return_url: returnUrl,
  });
  if (!res.ok) return res;
  const url = res.data.url;
  if (typeof url !== 'string') {
    return apiError('billing_unavailable', 'Le service de paiement a renvoyé une réponse inattendue.');
  }
  return { ok: true, url };
}

// ---------------------------------------------------------------------------
// Webhook signature
// ---------------------------------------------------------------------------

/**
 * `Stripe-Signature: t=<unix seconds>,v1=<hex hmac>[,v1=<hex hmac>]`
 *
 * The MAC is HMAC-SHA256 over `${t}.${rawBody}` with the endpoint's signing
 * secret. Several `v1` values can be present while a secret is being rotated,
 * and any one matching is enough.
 */
export function parseStripeSignature(header: string): { timestamp: number; signatures: string[] } | null {
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const [key, value] = part.split('=', 2);
    if (key?.trim() === 't') timestamp = Number(value);
    else if (key?.trim() === 'v1' && value) signatures.push(value.trim());
  }
  if (timestamp === null || !Number.isFinite(timestamp) || signatures.length === 0) return null;
  return { timestamp, signatures };
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison, so a wrong MAC cannot be found byte by byte. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * True when the raw body really was signed by Stripe with our secret, recently.
 * The RAW body must be passed: re-serializing the parsed JSON would change the
 * bytes and every signature would fail.
 */
export async function verifyStripeSignature(
  secret: string,
  rawBody: string,
  header: string | null,
  nowMs: number,
): Promise<boolean> {
  if (!header) return false;
  const parsed = parseStripeSignature(header);
  if (!parsed) return false;

  // Replay guard: a captured, validly-signed event cannot be re-sent later.
  if (Math.abs(Math.floor(nowMs / 1000) - parsed.timestamp) > WEBHOOK_TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = hex(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${parsed.timestamp}.${rawBody}`)),
  );
  return parsed.signatures.some((candidate) => timingSafeEqual(candidate, mac));
}
