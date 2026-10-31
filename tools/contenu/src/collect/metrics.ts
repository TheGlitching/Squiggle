/**
 * The site's own counters, `GET /admin/metrics`, read with the read-only
 * `METRICS_TOKEN` (it cannot run a migration). Visits through a campaign link
 * (`ref_*`) and accounts are two families of counters the server never links,
 * so the report never says a network brought an account.
 */
import { ORIGIN } from '../config';
import { fetchJson, type Ctx } from '../context';

/** The part of `server/src/metrics.ts` `Metrics` the routine reads. */
export interface SiteMetrics {
  windowWeeks: number;
  audience: {
    campaigns: Record<string, number>;
    clicks: Record<string, number>;
    blog: Record<string, number>;
  };
  headline: {
    newAccounts: { count: number };
    subscribers: { paying: number; free: number; cancelled: number };
    activeAccounts: number;
  };
}

export async function collectMetrics(ctx: Ctx, weeks: number): Promise<SiteMetrics> {
  return fetchJson<SiteMetrics>(ctx, 'Squiggle', `${ORIGIN}/admin/metrics?weeks=${weeks}`, {
    headers: { Authorization: `Bearer ${ctx.secrets.metricsToken}` },
  });
}
