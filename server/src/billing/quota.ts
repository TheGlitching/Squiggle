/**
 * What an account is entitled to run (Phase 2d).
 *
 * The product rule, stated once, here:
 *
 *   trial   3 analyses in total, ever. Not per day — it is a taste, not an
 *           allowance, and a per-day trial would just be a free plan.
 *   active  60 analyses per billing period, the month Stripe charged for.
 *           The count starts again when the subscription renews, so the
 *           reset moment is a fact Stripe reported, the same one the reader
 *           sees on their invoice, rather than a calendar boundary that
 *           depends on where they are. Monthly rather than daily so the
 *           worst-case account stays inside what its price pays for.
 *   none    nothing. Either the trial was used up and no subscription
 *           followed, or a subscription lapsed.
 *
 * Two things are deliberately NOT here.
 *
 * A credit is consumed at a successful `finalize` and nowhere else, so a run
 * that dies on a provider timeout costs the reader nothing. That belongs to
 * the finalize stage, which is the only place that knows a run succeeded.
 *
 * And `plan` is only ever written by the Stripe webhook. A client cannot
 * declare itself subscribed, so the entitlement read here is always the state
 * Stripe last told us about — see `billing/webhook.ts`.
 */
import type { Db, UserRow } from '../db/types';
import { apiError, type ApiError } from '../lib/errors';
import { DAY_MS, utcDayOf } from '../usage/limits';

/** Analyses a trial account may run, in total. */
export const TRIAL_ANALYSES = 3;

/** Analyses an active subscription may run per billing period. */
export const ACTIVE_ANALYSES_PER_PERIOD = 60;

/**
 * The window counted for an active row with no period start on record: one
 * written before the start was stored, until its next subscription event.
 */
const FALLBACK_PERIOD_MS = 30 * DAY_MS;

export interface Entitlement {
  plan: UserRow['plan'];
  /** Analyses already run in the period the plan is measured over. */
  used: number;
  /** The period's allowance. */
  limit: number;
  /** What is left. Never negative. */
  remaining: number;
  /** For an active plan, the epoch ms at which the count resets: the period end. */
  resetsAt: number | null;
  /** Epoch ms the count runs from: the period start, or 0 for a trial. Not sent to clients. */
  countedSince: number;
}

/**
 * The plan actually in force. An `active` row whose expiry has passed is not
 * active: the webhook sets the expiry from the subscription's own period end,
 * so a cancellation that we somehow never heard about still lapses on its own
 * rather than granting an unbounded subscription.
 */
export function effectivePlan(user: UserRow, now: number): UserRow['plan'] {
  if (user.plan === 'active' && user.planExpiresAt !== null && user.planExpiresAt <= now) return 'none';
  return user.plan;
}

export async function entitlementOf(db: Db, user: UserRow, now: number): Promise<Entitlement> {
  const plan = effectivePlan(user, now);

  if (plan === 'trial') {
    const used = await db.sumUsage(user.id);
    return {
      plan,
      used,
      limit: TRIAL_ANALYSES,
      remaining: Math.max(0, TRIAL_ANALYSES - used),
      resetsAt: null,
      countedSince: 0,
    };
  }

  if (plan === 'active') {
    // Read from the ledger, which holds each analysis's own timestamp: a
    // period starts at any moment of the day, and a renewal must reset the
    // count at that moment, not at the next midnight.
    const countedSince = user.planPeriodStart ?? now - FALLBACK_PERIOD_MS;
    const used = await db.countAnalysesSince(user.id, countedSince);
    return {
      plan,
      used,
      limit: ACTIVE_ANALYSES_PER_PERIOD,
      remaining: Math.max(0, ACTIVE_ANALYSES_PER_PERIOD - used),
      resetsAt: user.planExpiresAt,
      countedSince,
    };
  }

  return { plan: 'none', used: 0, limit: 0, remaining: 0, resetsAt: null, countedSince: now };
}

/**
 * Null when the account may start an analysis, otherwise the error to return.
 * Each refusal has its own code because the panel shows a different thing for
 * each: a paywall, a resubscribe prompt, or "wait for the renewal".
 */
export function refusalFor(entitlement: Entitlement): ApiError | null {
  if (entitlement.remaining > 0) return null;

  if (entitlement.plan === 'trial') {
    return apiError(
      'trial_exhausted',
      `Vos ${TRIAL_ANALYSES} analyses d'essai sont utilisées. Abonnez-vous pour continuer.`,
    );
  }
  if (entitlement.plan === 'active') {
    return apiError(
      'quota_exhausted',
      `Vous avez utilisé les ${ACTIVE_ANALYSES_PER_PERIOD} analyses de ce mois d’abonnement. Le compteur repart au renouvellement.`,
    );
  }
  return apiError('subscription_required', 'Un abonnement actif est nécessaire pour lancer une analyse.');
}

/**
 * Runs an account may start per credit it is entitled to. A credit is only
 * consumed at a successful finalize, so a run that fails, or that the reader
 * abandons, is free to them and paid by us. Two starts per credit leave room
 * for a retry after every failure, and stop an account from buying research
 * indefinitely by never finishing a run.
 */
export const STARTS_PER_CREDIT = 2;

/**
 * The first UTC day whose run starts count against the plan. Starts are kept
 * per day, so the day a period begins on counts whole: a renewal's first day
 * also carries the starts made earlier that day under the period before.
 */
export function startsCountedFromDay(entitlement: Entitlement): number {
  return utcDayOf(entitlement.countedSince);
}

/**
 * Null when the start just recorded is within the allowance, otherwise the
 * error to return. `started` is counted the way the plan is measured: over the
 * billing period for a subscription, ever for a trial. Called only once
 * `refusalFor` has let the account through, so the plan here is one that has
 * credits left.
 */
export function startsRefusal(entitlement: Entitlement, started: number): ApiError | null {
  if (started <= STARTS_PER_CREDIT * entitlement.limit) return null;

  return apiError(
    'starts_exhausted',
    entitlement.plan === 'trial'
      ? 'Trop d’analyses d’essai ont été lancées sans aller à leur terme. Abonnez-vous pour continuer.'
      : 'Trop d’analyses ont été lancées ce mois-ci sans aller à leur terme. Le compteur repart au renouvellement.',
  );
}
