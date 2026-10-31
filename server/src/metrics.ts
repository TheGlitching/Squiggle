/**
 * Launch metrics, as the server can state them without any client telemetry.
 *
 * Every figure is a count or a ratio of counts over accounts and events the
 * server already holds; nothing here names an article or a reader. `Db`
 * produces the raw counts, this file turns them into the numbers the launch is
 * judged on.
 *
 * Two kinds of figure sit side by side. Account figures (activation, trial) are
 * over every account since the start, because a cohort is only meaningful whole.
 * Event figures (cache, stage failures, subscriptions, analyses) are over the
 * window, `weeks` whole weeks ending now.
 *
 * The counters (`metric_counters`) are totals per UTC day and per fixed name,
 * some bumped by the server, some sent by the web app with nothing attached
 * (`POST /web/count`). `headline` gathers the five figures read every week:
 * ask for `?weeks=1` to read them over the last week.
 */
import type { Db, MetricName } from './db/types';
import { HOSTED_TRANSCRIPTION } from '@squiggle/shared';

import { TRIAL_ANALYSES } from './billing/quota';
import { logEvent } from './lib/log';

/** A ratio rounded to three places, or null when there is nothing to divide by. */
function ratio(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 1000 : null;
}

function stage(calls: number, failed: number) {
  return { calls, failed, failureRate: ratio(failed, calls) };
}

/** The counters whose name starts with `prefix`, keyed by the rest of the name. */
function family(counters: Record<MetricName, number>, prefix: string): Record<string, number> {
  return Object.fromEntries(
    Object.entries(counters)
      .filter(([name]) => name.startsWith(prefix))
      .map(([name, n]) => [name.slice(prefix.length), n]),
  );
}

export interface Metrics {
  windowWeeks: number;
  accounts: { total: number; perWeek: number[] };
  activation: { withFinalize: number; share: number | null };
  trial: { completed: number; completionShare: number | null; convertedToPaid: number; conversion: number | null };
  /** `active` pays; `activeFree` is subscribed through a 100 % promotion code. */
  subscriptions: {
    active: number;
    activeFree: number;
    started: number;
    startedFree: number;
    cancelled: number;
    cancellationRate: number | null;
  };
  cache: { checks: number; hits: number; hitRate: number | null };
  stages: {
    /** `truncated`: audit answers cut short by their output ceiling. */
    audit: ReturnType<typeof stage> & { truncated: number };
    research: ReturnType<typeof stage>;
    sourceCheck: ReturnType<typeof stage>;
  };
  analyses: { finalized: number; costPerAnalysisUsd: number | null };
  /**
   * Recordings transcribed from the site: how many, how many minutes of sound,
   * and what those minutes cost at the catalogue price, beside the daily cap
   * that bounds that cost. Refusals by the cap are in `funnel.refused`.
   */
  transcription: { count: number; failed: number; minutes: number; costUsd: number; dailyCapMinutes: number };
  /** Visits themselves are read in Cloudflare Web Analytics. */
  audience: {
    campaigns: Record<string, number>;
    clicks: Record<string, number>;
    pastes: Record<string, number>;
    /** Calls to analyse followed from a blog article, by article. */
    blog: Record<string, number>;
    /** Findings reported as wrong, by category and, apart, by reason: the two are never linked. */
    flags: { categories: Record<string, number>; reasons: Record<string, number> };
  };
  funnel: {
    signin: Record<string, number>;
    checkout: Record<string, number>;
    runsStarted: Record<string, number>;
    finalized: Record<string, number>;
    refused: Record<string, number>;
    /** Visitors' reports served with findings kept back until they have an account. */
    reportsWithheld: number;
  };
  headline: {
    /** New accounts, beside the campaign links visits came through: the two are never linked. */
    newAccounts: { count: number; campaigns: Record<string, number> };
    /** Of the accounts created a week before the window, the share that finished an analysis in their first week. */
    activationWithinWeek: { cohort: number; activated: number; share: number | null };
    successRate: { started: number; finalized: number; share: number | null };
    /** Revenue itself is read in Stripe, net of discounts. */
    subscribers: { paying: number; free: number; cancelled: number };
    aiCost: { finalized: number; costPerAnalysisUsd: number | null };
    activeAccounts: number;
  };
}

/**
 * @param providerCostUsd what the provider invoiced over the same window, if the
 *   caller has it. The server cannot know it, so the cost per analysis is only
 *   computed when it is supplied.
 * @param transcriptionDailyMinutes the deployment's transcription cap, shown beside what it bounds.
 */
export async function collectLaunchMetrics(
  db: Db,
  now: number,
  weeks: number,
  providerCostUsd?: number,
  transcriptionDailyMinutes = 0,
): Promise<Metrics> {
  const raw = await db.collectMetrics({ now, weeks, trialAnalyses: TRIAL_ANALYSES });
  const c = raw.counters;
  const analyses = {
    finalized: raw.finalizes,
    costPerAnalysisUsd:
      providerCostUsd !== undefined && raw.finalizes > 0
        ? Math.round((providerCostUsd / raw.finalizes) * 10000) / 10000
        : null,
  };
  const campaigns = family(c, 'ref_');
  return {
    windowWeeks: weeks,
    accounts: { total: raw.accountsTotal, perWeek: raw.accountsPerWeek },
    activation: { withFinalize: raw.accountsFinalized, share: ratio(raw.accountsFinalized, raw.accountsTotal) },
    trial: {
      completed: raw.trialCompleted,
      completionShare: ratio(raw.trialCompleted, raw.accountsTotal),
      convertedToPaid: raw.trialCompletedPaid,
      conversion: ratio(raw.trialCompletedPaid, raw.trialCompleted),
    },
    subscriptions: {
      active: raw.activeSubscribers,
      activeFree: raw.activeFreeSubscribers,
      started: raw.subscriptionsStarted,
      startedFree: c.checkout_free,
      cancelled: raw.subscriptionsCancelled,
      // Cancellations over the subscribers there were at the start: those still
      // active plus those who left, ignoring new arrivals, which is close enough
      // at the volumes a launch sees.
      cancellationRate: ratio(
        raw.subscriptionsCancelled,
        raw.activeSubscribers + raw.activeFreeSubscribers + raw.subscriptionsCancelled,
      ),
    },
    cache: { checks: c.check, hits: c.cache_hit, hitRate: ratio(c.cache_hit, c.check) },
    stages: {
      audit: { ...stage(c.audit, c.audit_failed), truncated: c.audit_truncated },
      research: stage(c.research, c.research_failed),
      sourceCheck: stage(c.source_check, c.source_check_failed),
    },
    analyses,
    transcription: {
      count: c.transcription,
      failed: c.transcription_failed,
      minutes: Math.round((c.transcription_seconds / 60) * 10) / 10,
      costUsd: Math.round((c.transcription_seconds / 60) * HOSTED_TRANSCRIPTION.usdPerMinute * 10000) / 10000,
      dailyCapMinutes: transcriptionDailyMinutes,
    },
    audience: {
      campaigns,
      clicks: family(c, 'click_'),
      pastes: family(c, 'paste_'),
      blog: family(c, 'blog_'),
      flags: { categories: family(c, 'flag_finding_'), reasons: family(c, 'flag_reason_') },
    },
    funnel: {
      signin: family(c, 'signin_'),
      checkout: family(c, 'checkout_'),
      runsStarted: family(c, 'run_started_'),
      finalized: family(c, 'finalize_'),
      refused: family(c, 'refused_'),
      reportsWithheld: c.report_withheld,
    },
    headline: {
      newAccounts: { count: raw.accountsPerWeek.reduce((a, b) => a + b, 0), campaigns },
      activationWithinWeek: {
        cohort: raw.activationCohort,
        activated: raw.activatedWithinWeek,
        share: ratio(raw.activatedWithinWeek, raw.activationCohort),
      },
      successRate: { started: raw.starts, finalized: raw.finalizes, share: ratio(raw.finalizes, raw.starts) },
      subscribers: {
        paying: raw.activeSubscribers,
        free: raw.activeFreeSubscribers,
        cancelled: raw.subscriptionsCancelled,
      },
      aiCost: analyses,
      activeAccounts: raw.activeAccounts,
    },
  };
}

/**
 * Count one occurrence for the metrics. Never allowed to fail the request that
 * triggered it: a metric is not worth a reader's analysis, so a failed write is
 * logged by name and swallowed.
 */
export async function countMetric(db: Db, name: MetricName, now: number, requestId: string, by = 1): Promise<void> {
  try {
    await db.bumpMetric(name, now, by);
  } catch {
    logEvent({ event: 'metric_failed', requestId, scope: name });
  }
}
