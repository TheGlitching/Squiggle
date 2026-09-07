/**
 * What an account is entitled to run (Phase 2d).
 *
 * The product rule, stated once, here:
 *
 *   trial   3 analyses in total, ever. Not per day — it is a taste, not an
 *           allowance, and a per-day trial would just be a free plan.
 *   active  5 analyses per UTC day. UTC and not the reader's timezone, so
 *           there is no timezone surface anywhere and the reset moment is a
 *           documented fact rather than a guess about where someone is.
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
import { utcDayOf } from '../usage/limits';

/** Analyses a trial account may run, in total. */
export const TRIAL_ANALYSES = 3;

/** Analyses an active subscription may run per UTC day. */
export const ACTIVE_ANALYSES_PER_DAY = 5;

export interface Entitlement {
  plan: UserRow['plan'];
  /** Analyses already run in the period the plan is measured over. */
  used: number;
  /** The period's allowance. */
  limit: number;
  /** What is left. Never negative. */
  remaining: number;
  /** For an active plan, the epoch ms at which the daily count resets. */
  resetsAt: number | null;
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
    };
  }

  if (plan === 'active') {
    const day = utcDayOf(now);
    const used = await db.getDailyUsage(user.id, day);
    return {
      plan,
      used,
      limit: ACTIVE_ANALYSES_PER_DAY,
      remaining: Math.max(0, ACTIVE_ANALYSES_PER_DAY - used),
      resetsAt: day + 24 * 60 * 60 * 1000,
    };
  }

  return { plan: 'none', used: 0, limit: 0, remaining: 0, resetsAt: null };
}

/**
 * Null when the account may start an analysis, otherwise the error to return.
 * Each refusal has its own code because the panel shows a different thing for
 * each: a paywall, a resubscribe prompt, or "come back tomorrow".
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
      `Vous avez utilisé vos ${ACTIVE_ANALYSES_PER_DAY} analyses du jour. Le compteur repart à minuit UTC.`,
    );
  }
  return apiError('subscription_required', 'Un abonnement actif est nécessaire pour lancer une analyse.');
}
