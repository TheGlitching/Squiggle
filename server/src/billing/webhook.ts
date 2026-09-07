/**
 * The only place a plan is ever written.
 *
 * A client that could tell us it is subscribed would be a client that could
 * grant itself the product, so it cannot: `POST /v1/account/checkout` sends a
 * reader to Stripe and returns a URL, and nothing else in the codebase calls
 * `db.setPlan`. Whether an account is active is a fact Stripe reports here,
 * over a signed request, and never a claim anybody makes.
 *
 * Handled events, and what each one means for a reader:
 *
 *   checkout.session.completed   they paid → active until the period ends
 *   customer.subscription.updated  renewal, plan change, or a cancellation
 *                                scheduled for the period end → the status
 *                                Stripe reports decides, and the expiry moves
 *                                to the new period end
 *   customer.subscription.deleted  the subscription is over → none
 *   invoice.payment_failed       the card failed → none, immediately
 *
 * `invoice.payment_failed` suspending immediately is a decision, not an
 * oversight: Stripe retries a failed payment for days, and every retry costs
 * us Gemini calls if the account keeps analysing. The reader recovers the
 * moment a retry succeeds, because that emits a `subscription.updated` with an
 * `active` status which reinstates them here.
 */
import type { Clock } from '../lib/clock';
import type { Db, UserRow } from '../db/types';
import { apiError, type Outcome } from '../lib/errors';
import { logEvent } from '../lib/log';
import { verifyStripeSignature } from './stripe';

/**
 * How long a checkout grants access before the subscription event that carries
 * the real period end has to have arrived.
 */
const PROVISIONAL_ACCESS_MS = 7 * 24 * 60 * 60 * 1000;

export interface WebhookDeps {
  db: Db;
  clock: Clock;
  webhookSecret: string;
  requestId: string;
}

/** The subset of a Stripe event this server reads. */
interface StripeEvent {
  id?: unknown;
  type?: unknown;
  data?: { object?: Record<string, unknown> };
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function sec(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) * 1000 : null;
}

/**
 * Find the account an event is about. `metadata.user_id` is set on both the
 * Checkout session and the subscription when we create them, so it is present
 * on nearly every event; the customer id is the fallback for events Stripe
 * raises on its own.
 */
async function accountFor(db: Db, object: Record<string, unknown>): Promise<UserRow | null> {
  const metadata = (object.metadata ?? {}) as Record<string, unknown>;
  const userId = str(metadata.user_id);
  if (userId) {
    const user = await db.getUserById(userId);
    if (user) return user;
  }
  const customerId = str(object.customer);
  return customerId ? db.getUserByStripeCustomerId(customerId) : null;
}

export async function handleStripeWebhook(
  deps: WebhookDeps,
  rawBody: string,
  signatureHeader: string | null,
): Promise<Outcome<{ applied: boolean }>> {
  const now = deps.clock.now();

  // The raw bytes, not a re-serialization: re-encoding the parsed JSON would
  // change them and no signature would ever verify.
  if (!(await verifyStripeSignature(deps.webhookSecret, rawBody, signatureHeader, now))) {
    logEvent({ event: 'auth_failed', requestId: deps.requestId, path: '/webhooks/stripe' });
    return apiError('bad_signature', 'Invalid webhook signature.');
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return apiError('invalid_payload', 'Malformed webhook payload.');
  }

  const id = str(event.id);
  const type = str(event.type);
  if (!id || !type) return apiError('invalid_payload', 'Webhook payload is missing id or type.');

  // Stripe retries until it gets a 2xx and does not promise exactly-once
  // delivery. A redelivery is answered 200 and applied zero times.
  if (!(await deps.db.recordStripeEvent(id, type, now))) {
    return { ok: true, applied: false };
  }

  const object = event.data?.object ?? {};
  const user = await accountFor(deps.db, object);
  // An event for an account we do not know is not an error on our side —
  // acknowledging it stops Stripe retrying it forever.
  if (!user) return { ok: true, applied: false };

  switch (type) {
    case 'checkout.session.completed': {
      await deps.db.setStripeIds(
        user.id,
        { customerId: str(object.customer), subId: str(object.subscription) },
        now,
      );
      // The session says the payment succeeded but not how long it bought.
      // The `customer.subscription.created` that follows carries the period
      // end and overwrites this. Recording no expiry at all would mean that if
      // that event never arrived — an endpoint subscribed to the wrong types,
      // say — the account stayed subscribed for ever and nobody would notice.
      // A provisional week fails loudly instead: the reader sees it, we hear
      // about it, and a correctly delivered subscription event replaces it
      // long before it matters.
      await deps.db.setPlan(user.id, 'active', now + PROVISIONAL_ACCESS_MS, now);
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const status = str(object.status);
      const periodEnd = sec(object.current_period_end);
      await deps.db.setStripeIds(user.id, { customerId: str(object.customer), subId: str(object.id) }, now);
      // `active` and `trialing` are the two statuses that entitle a reader.
      // past_due, unpaid, incomplete, paused and canceled all do not.
      const entitled = status === 'active' || status === 'trialing';
      await deps.db.setPlan(user.id, entitled ? 'active' : 'none', entitled ? periodEnd : null, now);
      break;
    }

    case 'customer.subscription.deleted': {
      await deps.db.setStripeIds(user.id, { subId: null }, now);
      await deps.db.setPlan(user.id, 'none', null, now);
      break;
    }

    case 'invoice.payment_failed': {
      await deps.db.setPlan(user.id, 'none', null, now);
      break;
    }

    default:
      // Everything else is acknowledged and ignored on purpose: a webhook
      // endpoint that 500s on an event type it does not know turns a Stripe
      // dashboard setting into an outage.
      return { ok: true, applied: false };
  }

  return { ok: true, applied: true };
}
