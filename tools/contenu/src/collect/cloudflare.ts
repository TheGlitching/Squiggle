/**
 * Cloudflare Web Analytics through the GraphQL API: visits per page and per
 * referring host over the last seven days, from the beacon the site already
 * serves. The token is limited to Account Analytics Read.
 *
 * Whether the free plan exposes these datasets was not documented anywhere I
 * could find: if the first call is refused, the source is recorded as not
 * collected and the week goes on with Search Console and the `ref_` counters.
 */
import { addDays, day, fetchJson, type Ctx } from '../context';

export interface CfData {
  range: { start: string; end: string };
  visits: number;
  pageviews: number;
  pages: Array<{ path: string; visits: number; pageviews: number }>;
  referers: Array<{ host: string; visits: number }>;
}

interface Group {
  count: number;
  sum: { visits: number };
  dimensions: { requestPath?: string; refererHost?: string };
}

const QUERY = `query ($account: String!, $start: Date!, $end: Date!) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      pages: rumPageloadEventsAdaptiveGroups(limit: 500, filter: { date_geq: $start, date_leq: $end, requestHost: "squiggle.fr" }, orderBy: [sum_visits_DESC]) {
        count sum { visits } dimensions { requestPath }
      }
      referers: rumPageloadEventsAdaptiveGroups(limit: 200, filter: { date_geq: $start, date_leq: $end, requestHost: "squiggle.fr" }, orderBy: [sum_visits_DESC]) {
        count sum { visits } dimensions { refererHost }
      }
    }
  }
}`;

export async function collectCloudflare(ctx: Ctx): Promise<CfData> {
  const end = addDays(ctx.now, -1);
  const start = addDays(end, -6);
  const answer = await fetchJson<{
    data?: { viewer: { accounts: Array<{ pages: Group[]; referers: Group[] }> } };
    errors?: Array<{ message: string }> | null;
  }>(ctx, 'Cloudflare', 'https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ctx.secrets.cfToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { account: ctx.secrets.cfAccount, start: day(start), end: day(end) } }),
  });
  if (answer.errors?.length) throw new Error(`Cloudflare : ${answer.errors.map((e) => e.message).join(' ; ').slice(0, 300)}`);
  const account = answer.data?.viewer.accounts[0];
  if (!account) throw new Error('Cloudflare : compte introuvable');
  const pages = account.pages.map((g) => ({ path: g.dimensions.requestPath ?? '?', visits: g.sum.visits, pageviews: g.count }));
  return {
    range: { start: day(start), end: day(end) },
    visits: pages.reduce((s, p) => s + p.visits, 0),
    pageviews: pages.reduce((s, p) => s + p.pageviews, 0),
    pages,
    referers: account.referers.map((g) => ({ host: g.dimensions.refererHost || '(direct)', visits: g.sum.visits })),
  };
}
