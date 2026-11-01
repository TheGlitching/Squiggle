/**
 * Reading a publication on X, and the thread it belongs to, for the analysis.
 *
 * What a reader sends is a link; what the analysis gets is the text X gives
 * for that publication and, when the author wrote a thread, for the author's
 * publications that answer each other, in order, stopping at anyone else's
 * reply. The server asks X only for what the link names: an identifier, then
 * one search on its conversation. Nothing about the reader goes to X.
 *
 * Spending is bounded before X is called. Each call first reserves its worst
 * case in two daily allowances, the reader's and the site's, then gives back
 * what X did not bill. A publication read in the last day is served from our
 * copy and costs nothing (X bills a resource once a day anyway, and wants
 * its content kept current, so the copy lives a day).
 *
 * If the search is not open to the plan, or fails, the thread is walked up
 * instead: the publication, then the one it answers, one lookup each, as far
 * as the same author goes. That reads the thread up to the link, not the
 * replies after it, and the result says so.
 */
import type { FetchLike } from '../lib/brevo';
import type { Db, MetricName, XPostRow } from '../db/types';
import type { Clock } from '../lib/clock';
import { apiError, type Outcome } from '../lib/errors';
import { logEvent } from '../lib/log';
import { countMetric } from '../metrics';
import { DAY_MS, X_POST_TTL_MS, X_SPEND_RATE_SCOPE_PREFIX } from '../usage/limits';
import { XApi, XApiError, type XPost, type XReadResult } from './client';

/** X's prices, in millionths of a dollar (https://docs.x.com/x-api/getting-started/pricing). */
const POST_MICROS = 5_000;
const USER_MICROS = 10_000;

/** Recent search covers seven days; beyond that only the full archive finds a thread. */
const RECENT_SEARCH_MS = 7 * DAY_MS;

export const X_DEFAULT_THREAD_POSTS = 25;
export const X_DEFAULT_SITE_CAP_USD = 2;
export const X_DEFAULT_ACCOUNT_CAP_USD = 0.25;

export interface XServices {
  api: XApi;
  /** What the site may spend on X in a UTC day, in millionths of a dollar. */
  siteDailyCapMicros: number;
  /** What one account or visitor may spend, likewise. */
  readerDailyCapMicros: number;
  /** Most publications read for one thread. */
  maxThreadPosts: number;
}

export interface XReadServices {
  db: Db;
  clock: Clock;
  x?: XServices;
  requestId: string;
}

export interface XThread {
  /** The linked publication's address, as X writes it. */
  url: string;
  /** « Publication X de @auteur », or « Fil X de @auteur » with how many were read. */
  title: string;
  author: string;
  text: string;
  /** Publications in the text. */
  postsRead: number;
  /** The thread could not be read whole: it stops at the link, or at the length limit. */
  partial: boolean;
}

const NOT_READABLE =
  'Squiggle n’a pas pu lire cette publication X. Elle est peut-être supprimée ou réservée à des abonnés : copiez son texte et collez-le.';

/** Whether a link to X can be read here at all: the secret is set. */
export function xConfigured(s: { x?: XServices }): boolean {
  return s.x !== undefined;
}

/** `reader` is the account id, or the visitor's address fingerprint. */
export async function readXThread(s: XReadServices, reader: string, postId: string): Promise<Outcome<XThread>> {
  const x = s.x;
  if (!x) return apiError('x_unavailable', NOT_READABLE);
  const now = s.clock.now();
  const since = now - X_POST_TTL_MS;
  const count = (name: MetricName, by = 1) => countMetric(s.db, name, now, s.requestId, by);

  const cached = await cachedThread(s.db, postId, since);
  if (cached) {
    await count('x_cache_hit');
    return { ok: true, ...describe(cached, postId, cached.length >= x.maxThreadPosts) };
  }

  const paid = new Set<string>();
  const reserved: Array<{ scope: string; key: string; amount: number }> = [];
  /** Reserve `micros` in both allowances; false, with nothing held, when either is spent. */
  const reserve = async (micros: number): Promise<boolean> => {
    const mine = { scope: `${X_SPEND_RATE_SCOPE_PREFIX}reader`, key: reader, windowMs: DAY_MS, now, amount: micros };
    const site = { scope: `${X_SPEND_RATE_SCOPE_PREFIX}all`, key: 'all', windowMs: DAY_MS, now, amount: micros };
    if (!(await s.db.recordAndCheckRate({ ...mine, limit: x.readerDailyCapMicros })).allowed) {
      await s.db.releaseRate(mine);
      return false;
    }
    if (!(await s.db.recordAndCheckRate({ ...site, limit: x.siteDailyCapMicros })).allowed) {
      await s.db.releaseRate(mine);
      await s.db.releaseRate(site);
      return false;
    }
    reserved.push({ scope: mine.scope, key: reader, amount: micros }, { scope: site.scope, key: 'all', amount: micros });
    return true;
  };
  const refund = async (micros: number) => {
    if (micros <= 0) return;
    for (const r of reserved.splice(-2)) await s.db.releaseRate({ ...r, windowMs: DAY_MS, now, amount: micros });
  };
  const capReached = async () => {
    await count('refused_x_cap');
    return apiError(
      'x_cap',
      'Squiggle a lu aujourd’hui toutes les publications X qu’il peut en un jour. Reprenez demain, ou copiez le texte de la publication et collez-le.',
    );
  };

  /** One call to X, paid from a reservation of its worst case. */
  const call = async (worst: number, run: () => Promise<XReadResult>): Promise<XReadResult | 'cap'> => {
    if (!(await reserve(worst))) return 'cap';
    let result: XReadResult;
    try {
      result = await run();
    } catch (err) {
      // A refused or failed call is not billed.
      await refund(worst);
      throw err;
    }
    // A resource already read in this request is not billed twice (X bills one a day).
    const newPosts = result.posts.filter((p) => !paid.has(`p${p.id}`));
    const newUsers = result.userIds.filter((u) => !paid.has(`u${u}`));
    newPosts.forEach((p) => paid.add(`p${p.id}`));
    newUsers.forEach((u) => paid.add(`u${u}`));
    const billed = newPosts.length * POST_MICROS + newUsers.length * USER_MICROS;
    await refund(worst - billed);
    await count('x_read');
    await count('x_posts_read', newPosts.length);
    await count('cost_x', billed);
    return result;
  };

  try {
    // The linked publication, from our copy when it is there (a walk-up leaves single posts behind).
    let target: XPost | undefined = rowToPost(await s.db.getXPost(postId, since));
    if (!target) {
      const got = await call(POST_MICROS + USER_MICROS, () => x.api.lookup([postId]));
      if (got === 'cap') return await capReached();
      target = got.posts[0];
      if (!target) throw new XApiError('not_found', 200);
    } else {
      await count('x_cache_hit');
    }

    // The author's publications of this conversation.
    let found: XPost[] = [target];
    let whole = false;
    const worst = x.maxThreadPosts * POST_MICROS + USER_MICROS;
    const archive = now - Date.parse(target.createdAt || '') > RECENT_SEARCH_MS;
    try {
      const searched = await call(worst, () => x.api.searchConversation(target!.conversationId, target!.authorId, archive, x.maxThreadPosts));
      // Out of allowance for the rest: the publication itself is still served, and said to be alone.
      if (searched !== 'cap') {
        found = [target, ...searched.posts.filter((p) => p.id !== target!.id && p.authorId === target!.authorId)];
        whole = true;
      }
    } catch (err) {
      if (!(err instanceof XApiError)) throw err;
      logEvent({ event: 'provider_failed', requestId: s.requestId, scope: 'x_search' });
      found = await walkUp(target, x, call, s.db, since);
    }

    const chain = threadAround(found, target.id, x.maxThreadPosts);
    const truncated = chain.length >= x.maxThreadPosts && found.length > chain.length;
    await s.db.putXPosts(
      found.map((p) => ({ ...postToRow(p, now), threadDone: whole && chain.some((c) => c.id === p.id) })),
    );
    // Only the thread itself is marked whole, so a later link to any of its posts finds all of it.
    return { ok: true, ...describe(chain, postId, !whole || truncated) };
  } catch (err) {
    if (!(err instanceof XApiError)) throw err;
    await count('x_unavailable');
    logEvent({ event: 'provider_failed', requestId: s.requestId, scope: 'x_read' });
    return apiError('x_unavailable', NOT_READABLE);
  }
}

/** The target and, one lookup at a time, the same author's earlier publications it answers. */
async function walkUp(
  target: XPost,
  x: XServices,
  call: (worst: number, run: () => Promise<XReadResult>) => Promise<XReadResult | 'cap'>,
  db: Db,
  since: number,
): Promise<XPost[]> {
  const chain = [target];
  let parentId = target.repliedToId;
  while (parentId && chain.length < x.maxThreadPosts) {
    let parent = rowToPost(await db.getXPost(parentId, since));
    if (!parent) {
      const got = await call(POST_MICROS + USER_MICROS, () => x.api.lookup([parentId!])).catch((err) => {
        // The parent being gone ends the walk; anything else is the caller's to report.
        if (err instanceof XApiError && err.kind === 'not_found') return null;
        throw err;
      });
      // Out of allowance: the thread stops here, and is said not to be whole.
      if (got === 'cap') break;
      parent = got?.posts[0];
    }
    if (!parent || parent.authorId !== target.authorId) break;
    chain.unshift(parent);
    parentId = parent.repliedToId;
  }
  return chain;
}

/**
 * The thread the link belongs to: the publications connected to it by
 * self-replies, oldest first, cut to `max`. A publication answering another
 * account heads its thread, and replies from other accounts were never asked for.
 */
export function threadAround(posts: XPost[], targetId: string, max: number): XPost[] {
  const byId = new Map(posts.map((p) => [p.id, p]));
  const members = new Set([targetId]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const p of posts) {
      if (members.has(p.id)) continue;
      if ((p.repliedToId && members.has(p.repliedToId)) || [...members].some((m) => byId.get(m)?.repliedToId === p.id)) {
        members.add(p.id);
        grew = true;
      }
    }
  }
  // Identifiers grow with time, so a longer or greater number is a later publication.
  return [...members]
    .map((id) => byId.get(id)!)
    .sort((a, b) => a.id.length - b.id.length || (a.id < b.id ? -1 : 1))
    .slice(0, max);
}

function describe(chain: XPost[], linkedId: string, partial: boolean): XThread {
  const first = chain[0];
  const handle = first.authorUsername ? `@${first.authorUsername}` : 'un compte X';
  const alt = (p: XPost) => p.altTexts.map((a) => `[Image : ${a}]`);
  return {
    url: `https://x.com/${first.authorUsername || 'i'}/status/${chain.some((p) => p.id === linkedId) ? linkedId : first.id}`,
    title: chain.length > 1 ? `Fil X de ${handle}, ${chain.length} publications lues` : `Publication X de ${handle}`,
    author: handle,
    text: chain.map((p) => [p.text, ...alt(p)].filter(Boolean).join('\n')).join('\n\n'),
    postsRead: chain.length,
    partial,
  };
}

/** The thread of the linked publication from our copy, when it was read whole in the last day. */
async function cachedThread(db: Db, postId: string, since: number): Promise<XPost[] | null> {
  const row = await db.getXPost(postId, since);
  if (!row?.threadDone) return null;
  const rows = await db.getXThread(row.conversationId, row.authorId, since);
  const posts = rows.map((r) => rowToPost(r)!);
  return posts.length > 0 && posts.some((p) => p.id === postId) ? posts : null;
}

function rowToPost(r: XPostRow | null): XPost | undefined {
  return r
    ? {
        id: r.id,
        conversationId: r.conversationId,
        authorId: r.authorId,
        authorUsername: r.authorUsername,
        authorName: r.authorName,
        text: r.text,
        createdAt: r.createdAt,
        repliedToId: r.repliedToId,
        altTexts: JSON.parse(r.altTexts) as string[],
      }
    : undefined;
}

function postToRow(p: XPost, now: number): XPostRow {
  return { ...p, altTexts: JSON.stringify(p.altTexts), threadDone: false, fetchedAt: now };
}

/** The deployment settings the X client reads; the bearer token is a secret, the caps are plain variables. */
export interface XEnv {
  X_BEARER_TOKEN?: string;
  X_DAILY_CAP_USD?: string;
  X_ACCOUNT_DAILY_CAP_USD?: string;
  X_THREAD_MAX_POSTS?: string;
}

/** Without the token there is no X reading at all: the services are absent, and links to X behave as any other link. */
export function xServicesOf(env: XEnv, fetchImpl: FetchLike): XServices | undefined {
  const token = env.X_BEARER_TOKEN?.trim();
  if (!token) return undefined;
  // An unset or unreadable cap falls back to the cautious default; an explicit 0 closes it.
  const usd = (raw: string | undefined, fallback: number) => {
    const n = raw === undefined || raw.trim() === '' ? NaN : Number(raw);
    return Math.round((Number.isFinite(n) && n >= 0 ? n : fallback) * 1e6);
  };
  const posts = Number(env.X_THREAD_MAX_POSTS);
  return {
    api: new XApi(token, fetchImpl),
    siteDailyCapMicros: usd(env.X_DAILY_CAP_USD, X_DEFAULT_SITE_CAP_USD),
    readerDailyCapMicros: usd(env.X_ACCOUNT_DAILY_CAP_USD, X_DEFAULT_ACCOUNT_CAP_USD),
    maxThreadPosts: Number.isInteger(posts) && posts >= 1 && posts <= 100 ? posts : X_DEFAULT_THREAD_POSTS,
  };
}
