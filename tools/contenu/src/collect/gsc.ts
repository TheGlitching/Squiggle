/**
 * Search Console, read with a service account that is a restricted (read-only)
 * user of the `squiggle.fr` property, scope `webmasters.readonly`.
 *
 * Final data lags two to three days, so the last complete day is three days
 * back; the two fresher days are read apart (`dataState: all`) and marked
 * provisional, never mixed into the week.
 */
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { addDays, day, fetchJson, type Ctx } from '../context';

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

export interface GscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscData {
  range: { start: string; end: string };
  fresh: { start: string; end: string };
  totals7: { clicks: number; impressions: number; position: number | null };
  totals28: { clicks: number; impressions: number; position: number | null };
  pages28: GscRow[];
  queries28: GscRow[];
  queryPages28: GscRow[];
  pages7: GscRow[];
  freshTotals: { clicks: number; impressions: number };
}

const b64url = (data: string | Buffer) => Buffer.from(data).toString('base64url');

async function token(ctx: Ctx): Promise<string> {
  const key = JSON.parse(readFileSync(ctx.secrets.gscCredentials, 'utf8')) as { client_email: string; private_key: string; token_uri: string };
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: key.client_email, scope: SCOPE, aud: key.token_uri, iat: now, exp: now + 600 };
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(claims))}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key);
  const answer = await fetchJson<{ access_token: string }>(ctx, 'Google', key.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(signature)}` }),
  });
  return answer.access_token;
}

function totals(rows: GscRow[]) {
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  // Search Console's average position is weighted by impressions.
  const position = impressions > 0 ? Math.round((rows.reduce((s, r) => s + r.position * r.impressions, 0) / impressions) * 10) / 10 : null;
  return { clicks, impressions, position };
}

export async function collectGsc(ctx: Ctx): Promise<GscData> {
  const access = await token(ctx);
  const site = encodeURIComponent(ctx.secrets.gscSite);
  const query = async (start: Date, end: Date, dimensions: string[], dataState: 'final' | 'all' = 'final') =>
    (
      await fetchJson<{ rows?: GscRow[] }>(ctx, 'Search Console', `https://searchconsole.googleapis.com/webmasters/v3/sites/${site}/searchAnalytics/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${access}`, 'content-type': 'application/json' },
        body: JSON.stringify({ startDate: day(start), endDate: day(end), dimensions, rowLimit: 25000, dataState }),
      })
    ).rows ?? [];

  const end = addDays(ctx.now, -3);
  const start7 = addDays(end, -6);
  const start28 = addDays(end, -27);
  const [days7, days28, pages28, queries28, queryPages28, pages7, fresh] = await Promise.all([
    query(start7, end, ['date']),
    query(start28, end, ['date']),
    query(start28, end, ['page']),
    query(start28, end, ['query']),
    query(start28, end, ['query', 'page']),
    query(start7, end, ['page']),
    query(addDays(end, 1), addDays(ctx.now, -1), ['date'], 'all'),
  ]);
  return {
    range: { start: day(start7), end: day(end) },
    fresh: { start: day(addDays(end, 1)), end: day(addDays(ctx.now, -1)) },
    totals7: totals(days7),
    totals28: totals(days28),
    pages28,
    queries28,
    queryPages28,
    pages7,
    freshTotals: { clicks: totals(fresh).clicks, impressions: totals(fresh).impressions },
  };
}

/** A Search Console page address as the site's path: `https://squiggle.fr/glossaire/x` as `/glossaire/x`. */
export function gscPath(page: string): string {
  try {
    return new URL(page).pathname.replace(/\/$/, '') || '/';
  } catch {
    return page;
  }
}
