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
  /**
   * The teacher coupon (100 %, see `billing/teacher.ts`). Unset, or still the
   * `PENDING_…` placeholder, means the self-service teacher offer is closed.
   */
  teacherCouponId?: string;
  webhookSecret: string;
  fetchImpl?: typeof fetch;
}

async function stripeRequest(
  config: StripeConfig,
  method: 'POST' | 'DELETE',
  path: string,
  form: Record<string, string>,
  opts: { missingIsFine?: boolean } = {},
): Promise<Outcome<{ data: Record<string, unknown> }>> {
  const fetchImpl = config.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl(`${STRIPE_API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${config.secretKey}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: method === 'POST' ? new URLSearchParams(form).toString() : undefined,
    });
  } catch {
    return apiError('billing_unavailable', 'Le service de paiement est momentanément indisponible.');
  }
  // A resource that is already gone is the state a delete is after.
  if (res.status === 404 && opts.missingIsFine) return { ok: true, data: {} };
  if (!res.ok) {
    // Stripe's error body can echo the parameters we sent; it is never
    // forwarded to the caller and never logged.
    return apiError('billing_unavailable', 'Le service de paiement a refusé la demande.');
  }
  return { ok: true, data: (await res.json()) as Record<string, unknown> };
}

function stripePost(config: StripeConfig, path: string, form: Record<string, string>) {
  return stripeRequest(config, 'POST', path, form);
}

/**
 * End a subscription now. Account deletion calls this before it erases
 * anything, so a failure leaves the account (and the way to retry) intact
 * instead of a reader who is gone from our database and still being billed.
 * A subscription Stripe no longer knows is treated as already ended.
 */
export async function cancelSubscription(
  config: StripeConfig,
  subscriptionId: string,
): Promise<Outcome<object>> {
  const res = await stripeRequest(config, 'DELETE', `/subscriptions/${encodeURIComponent(subscriptionId)}`, {}, {
    missingIsFine: true,
  });
  return res.ok ? { ok: true } : res;
}

/**
 * End a subscription at a fixed date (the teacher offer's 30 June). Stripe
 * then cancels it on its own and the webhook hears `subscription.deleted`.
 */
export async function setSubscriptionEnd(
  config: StripeConfig,
  subscriptionId: string,
  endMs: number,
): Promise<Outcome<object>> {
  const res = await stripePost(config, `/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    cancel_at: String(Math.floor(endMs / 1000)),
    proration_behavior: 'none',
  });
  return res.ok ? { ok: true } : res;
}

/** Keep the address on Stripe's receipts in step with the account's. */
export async function updateCustomerEmail(
  config: StripeConfig,
  customerId: string,
  email: string,
): Promise<Outcome<object>> {
  const res = await stripePost(config, `/customers/${encodeURIComponent(customerId)}`, { email });
  return res.ok ? { ok: true } : res;
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
  /** The teacher offer: this coupon is applied to the session instead of a code being typed. */
  teacherCoupon?: string;
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
    // Offered access (the service's own account, a teacher without an
    // academic address) is a 100 %-forever promotion code made in the
    // dashboard and typed here, so the plan still comes from the webhook like
    // any other subscription. An academic address skips the code: see below.
    // With nothing due, Checkout then asks for no card at all.
    allow_promotion_codes: 'true',
    payment_method_collection: 'if_required',
    customer_update: args.customerId ? 'auto' : '',
  };
  if (args.teacherCoupon) {
    // Stripe takes either a discount or a promotion-code field, never both.
    // The offer marker travels to the subscription, where the webhook reads
    // it to end the subscription with the school year.
    delete form.allow_promotion_codes;
    form['discounts[0][coupon]'] = args.teacherCoupon;
    form['metadata[offer]'] = 'teacher';
    form['subscription_data[metadata][offer]'] = 'teacher';
  }
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
