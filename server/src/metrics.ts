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
 */
import type { Db, MetricName } from './db/types';
import { TRIAL_ANALYSES } from './billing/quota';
import { logEvent } from './lib/log';

/** A ratio rounded to three places, or null when there is nothing to divide by. */
function ratio(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 1000 : null;
}

function stage(calls: number, failed: number) {
  return { calls, failed, failureRate: ratio(failed, calls) };
}

export interface Metrics {
  windowWeeks: number;
  accounts: { total: number; perWeek: number[] };
  activation: { withFinalize: number; share: number | null };
  trial: { completed: number; completionShare: number | null; convertedToPaid: number; conversion: number | null };
  subscriptions: { active: number; started: number; cancelled: number; cancellationRate: number | null };
  cache: { checks: number; hits: number; hitRate: number | null };
  stages: {
    audit: ReturnType<typeof stage>;
    research: ReturnType<typeof stage>;
    sourceCheck: ReturnType<typeof stage>;
  };
  analyses: { finalized: number; costPerAnalysisUsd: number | null };
}

/**
 * @param providerCostUsd what the provider invoiced over the same window, if the
 *   caller has it. The server cannot know it, so the cost per analysis is only
 *   computed when it is supplied.
 */
export async function collectLaunchMetrics(
  db: Db,
  now: number,
  weeks: number,
  providerCostUsd?: number,
): Promise<Metrics> {
  const raw = await db.collectMetrics({ now, weeks, trialAnalyses: TRIAL_ANALYSES });
  const c = raw.counters;
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
      started: raw.subscriptionsStarted,
      cancelled: raw.subscriptionsCancelled,
      // Cancellations over the subscribers there were at the start: those still
      // active plus those who left, ignoring new arrivals, which is close enough
      // at the volumes a launch sees.
      cancellationRate: ratio(raw.subscriptionsCancelled, raw.activeSubscribers + raw.subscriptionsCancelled),
    },
    cache: { checks: c.check, hits: c.cache_hit, hitRate: ratio(c.cache_hit, c.check) },
    stages: {
      audit: stage(c.audit, c.audit_failed),
      research: stage(c.research, c.research_failed),
      sourceCheck: stage(c.source_check, c.source_check_failed),
    },
    analyses: {
      finalized: raw.finalizes,
      costPerAnalysisUsd:
        providerCostUsd !== undefined && raw.finalizes > 0
          ? Math.round((providerCostUsd / raw.finalizes) * 10000) / 10000
          : null,
    },
  };
}

/**
 * Count one occurrence for the metrics. Never allowed to fail the request that
 * triggered it: a metric is not worth a reader's analysis, so a failed write is
 * logged by name and swallowed.
 */
export async function countMetric(db: Db, name: MetricName, now: number, requestId: string): Promise<void> {
  try {
    await db.bumpMetric(name, now);
  } catch {
    logEvent({ event: 'metric_failed', requestId, scope: name });
  }
}
