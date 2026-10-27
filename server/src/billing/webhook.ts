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
 *   checkout.session.completed   they paid, or a 100 % promotion code left
 *                                nothing to pay → active until the period ends
 *   customer.subscription.updated  renewal, plan change, or a cancellation
 *                                scheduled for the period end → the status
 *                                Stripe reports decides, and the period moves
 *                                to the new one, which restarts the allowance
 *                                (see `billing/quota.ts`)
 *   customer.subscription.deleted  the subscription is over → none
 *   invoice.payment_failed       the card failed → none, immediately
 *   invoice.paid                 a renewal went through → no change to the plan;
 *                                only whether it cost anything is noted
 *
 * A teacher subscription (`metadata.offer`, set by the teacher checkout) is
 * also given its end date here, the next 30 June, whenever an event shows it
 * without one: Stripe then cancels it on that day and the reader goes back to
 * `none` through `subscription.deleted`, with no failed invoice on the way.
 * Setting it on every such event, not only the first, is what lets a call
 * that failed once be made again by the next event.
 *
 * `invoice.payment_failed` suspending immediately is a decision, not an
 * oversight: Stripe retries a failed payment for days, and every retry costs
 * us model calls if the account keeps analysing. The reader recovers the
 * moment a retry succeeds, because that emits a `subscription.updated` with an
 * `active` status which reinstates them here.
 *
 * Besides the plan, the webhook notes whether the subscription costs anything
 * (`setSubscriptionFree`): a checkout or an invoice that came to zero is a
 * 100 % promotion code, and the metrics count that account apart from the ones
 * that pay. A later invoice that does cost something moves it back, which is
 * what a code valid for the first month only leads to.
 */
import type { Clock } from '../lib/clock';
import type { Db, UserRow } from '../db/types';
import { apiError, type Outcome } from '../lib/errors';
import { logEvent } from '../lib/log';
import { countMetric } from '../metrics';
import { setSubscriptionEnd, verifyStripeSignature, type StripeConfig } from './stripe';
import { schoolYearEnd } from './teacher';

/**
 * How long a checkout grants access before the subscription event that carries
 * the real period end has to have arrived.
 */
const PROVISIONAL_ACCESS_MS = 7 * 24 * 60 * 60 * 1000;

export interface WebhookDeps {
  db: Db;
  clock: Clock;
  /** The webhook secret, and the API access the teacher end date is set with. */
  stripe: StripeConfig;
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

/**
 * The paid period, as far as the event states it. Since Stripe API 2025-03-31
 * (Basil) it lives on each subscription item, not on the subscription; older
 * endpoint versions still send the subscription-level fields. The item ending
 * first wins, so a multi-item subscription never outlives its shortest-paid
 * item, and its start is taken with it so the two always describe one period.
 */
function periodOf(object: Record<string, unknown>): { start: number | null; end: number | null } {
  const items = (object.items as { data?: unknown } | undefined)?.data;
  const periods = (Array.isArray(items) ? items : [])
    .map((item) => item as Record<string, unknown> | null)
    .map((item) => ({ start: sec(item?.current_period_start), end: sec(item?.current_period_end) }))
    .filter((period): period is { start: number | null; end: number } => period.end !== null);
  if (periods.length === 0) return { start: sec(object.current_period_start), end: sec(object.current_period_end) };
  return periods.reduce((first, period) => (period.end < first.end ? period : first));
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

/**
 * Note whether the subscription costs anything. Metrics only, so it comes after
 * the plan and never fails the event: once recorded, an event is not applied
 * again, and a reader who paid must not lose access over a statistic.
 */
async function noteFree(deps: WebhookDeps, userId: string, free: boolean, now: number): Promise<void> {
  try {
    await deps.db.setSubscriptionFree(userId, free, now);
  } catch {
    logEvent({ event: 'metric_failed', requestId: deps.requestId, scope: 'subscription_free' });
  }
}

export async function handleStripeWebhook(
  deps: WebhookDeps,
  rawBody: string,
  signatureHeader: string | null,
): Promise<Outcome<{ applied: boolean }>> {
  const now = deps.clock.now();

  // The raw bytes, not a re-serialization: re-encoding the parsed JSON would
  // change them and no signature would ever verify.
  if (!(await verifyStripeSignature(deps.stripe.webhookSecret, rawBody, signatureHeader, now))) {
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
      //
      // Stripe does not promise ordered delivery, so the subscription event can
      // arrive before this one. The provisional is therefore only written when
      // the account has no later expiry already on record: an out-of-order
      // checkout must never shorten a real subscription back to a week.
      //
      // The provisional period starts now: the allowance is counted from the
      // payment until the subscription event states the real period.
      const provisionalEnd = now + PROVISIONAL_ACCESS_MS;
      const hasLaterExpiry = user.planExpiresAt !== null && user.planExpiresAt > provisionalEnd;
      if (!hasLaterExpiry) {
        await deps.db.setPlan(user.id, 'active', { start: now, end: provisionalEnd }, now);
      }
      // Cents; an amount the event does not carry counts as paid, as before.
      const free = object.amount_total === 0;
      await noteFree(deps, user.id, free, now);
      await countMetric(deps.db, free ? 'checkout_free' : 'checkout_paid', now, deps.requestId);
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const status = str(object.status);
      const period = periodOf(object);
      await deps.db.setStripeIds(user.id, { customerId: str(object.customer), subId: str(object.id) }, now);
      // `active` and `trialing` are the two statuses that entitle a reader.
      // past_due, unpaid, incomplete, paused and canceled all do not.
      const entitled = status === 'active' || status === 'trialing';
      if (!entitled) {
        await deps.db.setPlan(user.id, 'none', null, now);
      } else if (period.end !== null) {
        // Stripe sends the start beside the end. Should an event ever carry
        // only the end, the start on record is kept when the period is the one
        // already stored, and a new period is counted from now.
        const start = period.start ?? (period.end === user.planExpiresAt ? user.planPeriodStart : null) ?? now;
        await deps.db.setPlan(user.id, 'active', { start, end: period.end }, now);
      } else if (user.planExpiresAt === null) {
        // An entitled event with no period anywhere in it must not clear the
        // expiry (null means "never expires"). Keep what is on record; if
        // nothing is, fall back to the same provisional week as a checkout.
        await deps.db.setPlan(user.id, 'active', { start: now, end: now + PROVISIONAL_ACCESS_MS }, now);
      }
      const subId = str(object.id);
      const metadata = (object.metadata ?? {}) as Record<string, unknown>;
      if (entitled && subId && metadata.offer === 'teacher' && !object.cancel_at) {
        // Not fatal: the plan above is already right, and the coupon's own
        // duration bounds the subscription should every attempt fail.
        const ended = await setSubscriptionEnd(deps.stripe, subId, schoolYearEnd(now));
        if (!ended.ok) {
          logEvent({ event: 'stripe_teacher_end_failed', requestId: deps.requestId, userId: user.id, code: ended.code });
        }
      }
      break;
    }

    case 'customer.subscription.deleted': {
      await deps.db.setStripeIds(user.id, { subId: null }, now);
      await deps.db.setPlan(user.id, 'none', null, now);
      break;
    }

    case 'invoice.paid': {
      await noteFree(deps, user.id, object.amount_paid === 0, now);
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
