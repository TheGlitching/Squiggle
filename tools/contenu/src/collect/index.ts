/**
 * Monday's collection. Each source is dated and filed under the week; a source
 * that fails is filed as « non collecté », never replaced by last week's
 * figures, which would make a stalled counter look like a flat week.
 */
import { CAPS, NETWORKS, X_PRICES, type Network } from '../config';
import { addDays, step, weekOf, type Ctx } from '../context';
import { metricTotal, Postiz } from '../postiz';
import { collectBluesky, type BskyData } from './bluesky';
import { collectCloudflare, type CfData } from './cloudflare';
import { collectGsc, type GscData } from './gsc';
import { collectMastodon, type MastoData } from './mastodon';
import { collectMetrics, type SiteMetrics } from './metrics';

export interface PostizStats {
  networks: Partial<Record<Network, { integrationId: string; followers: number | null; impressions: number | null }>>;
  /** `shares` and `saves` were added on 1 November 2026: older snapshots lack them. */
  posts: Array<{ id: string; network: Network; publishDate: string; url?: string; likes: number | null; comments: number | null; impressions: number | null; shares?: number | null; saves?: number | null }>;
}

export interface Week {
  week: string;
  gsc?: GscData;
  cloudflare?: CfData;
  metrics1?: SiteMetrics;
  metrics4?: SiteMetrics;
  postiz?: PostizStats;
  bluesky?: BskyData;
  mastodon?: MastoData;
}

export const SOURCES = ['gsc', 'cloudflare', 'metrics1', 'metrics4', 'postiz', 'bluesky', 'mastodon'] as const;
export type SourceName = (typeof SOURCES)[number];

export function saveSnapshot(ctx: Ctx, source: SourceName, week: string, payload: unknown): void {
  ctx.db.run(
    'INSERT INTO snapshots (run_id, source, week, collected_at, status, payload) VALUES (?, ?, ?, ?, ?, ?)',
    ctx.runId,
    source,
    week,
    new Date().toISOString(),
    payload === undefined ? 'absent' : 'ok',
    payload === undefined ? null : JSON.stringify(payload),
  );
}

/** The last snapshot of a source for a week, or nothing when it was not collected. */
export function snapshot<T>(ctx: Pick<Ctx, 'db'>, source: SourceName, week: string): T | undefined {
  const row = ctx.db.get<{ payload: string | null }>('SELECT payload FROM snapshots WHERE source = ? AND week = ? ORDER BY id DESC LIMIT 1', source, week);
  return row?.payload ? (JSON.parse(row.payload) as T) : undefined;
}

export function loadWeek(ctx: Pick<Ctx, 'db'>, week: string): Week {
  return {
    week,
    gsc: snapshot(ctx, 'gsc', week),
    cloudflare: snapshot(ctx, 'cloudflare', week),
    metrics1: snapshot(ctx, 'metrics1', week),
    metrics4: snapshot(ctx, 'metrics4', week),
    postiz: snapshot(ctx, 'postiz', week),
    bluesky: snapshot(ctx, 'bluesky', week),
    mastodon: snapshot(ctx, 'mastodon', week),
  };
}

/** What a network's posts of the week drew besides visits: the signals the platforms say they reward. */
export interface Engagement {
  posts: number;
  /** Replies or comments. */
  replies: number;
  /** Reposts, quotes, shares. */
  shares: number;
  likes: number;
  /** Instagram's two named signals, saves and shares, read against the reach. */
  saves: number | null;
  reach: number | null;
}

/**
 * A network's engagement on the posts published in the seven days a week's
 * snapshot covers; null when the source was not collected. Counters are read
 * once, on the Monday: a post of Sunday has had a day, one of Monday a week.
 */
export function engagementOf(w: Week, network: Network): Engagement | null {
  const from = Date.parse(`${w.week}T00:00:00Z`) - 7 * 86_400_000;
  const inWeek = (iso: string) => Date.parse(iso) >= from && Date.parse(iso) < from + 7 * 86_400_000;
  const sum = <T>(list: T[], f: (x: T) => number | null | undefined) => list.reduce((s, x) => s + (f(x) ?? 0), 0);
  if (network === 'bluesky' || network === 'mastodon') {
    const data = network === 'bluesky' ? w.bluesky : w.mastodon;
    if (!data) return null;
    const posts = data.posts.filter((p) => inWeek(p.createdAt));
    return { posts: posts.length, replies: sum(posts, (p) => p.replies), shares: sum(posts, (p) => p.reposts + ('quotes' in p ? p.quotes : 0)), likes: sum(posts, (p) => p.likes), saves: null, reach: null };
  }
  if (!w.postiz) return null;
  const posts = w.postiz.posts.filter((p) => p.network === network);
  const known = (f: (p: (typeof posts)[number]) => number | null | undefined) => (posts.some((p) => typeof f(p) === 'number') ? sum(posts, f) : null);
  return { posts: posts.length, replies: sum(posts, (p) => p.comments), shares: sum(posts, (p) => p.shares), likes: sum(posts, (p) => p.likes), saves: known((p) => p.saves), reach: known((p) => p.impressions) };
}

/** A network's followers as a week's snapshot read them. */
export function followersOf(w: Week, network: Network): number | null {
  if (network === 'bluesky') return w.bluesky?.followers ?? null;
  if (network === 'mastodon') return w.mastodon?.followers ?? null;
  return w.postiz?.networks[network]?.followers ?? null;
}

/** What X statistics the routine has read this month, in dollars. */
export function xReadsThisMonth(ctx: Pick<Ctx, 'db' | 'now'>): number {
  const month = ctx.now.toISOString().slice(0, 7);
  return ctx.db.get<{ usd: number | null }>("SELECT SUM(usd) AS usd FROM spend WHERE service = 'x' AND at LIKE ?", `${month}%`)?.usd ?? 0;
}

async function collectPostiz(ctx: Ctx): Promise<PostizStats> {
  const postiz = new Postiz(ctx);
  const integrations = (await postiz.integrations()).filter((i) => !i.disabled);
  const stats: PostizStats = { networks: {}, posts: [] };
  for (const i of integrations) {
    const network = i.identifier as Network;
    if (!NETWORKS.includes(network)) continue;
    // Postiz returns no statistics for Bluesky (its public API is read instead) nor for Mastodon.
    if (network === 'bluesky' || network === 'mastodon') {
      stats.networks[network] = { integrationId: i.id, followers: null, impressions: null };
      continue;
    }
    const metrics = await postiz.platformAnalytics(i.id, 7).catch(() => []);
    stats.networks[network] = {
      integrationId: i.id,
      followers: metricTotal(metrics, /follower|abonn/i, 'last'),
      impressions: metricTotal(metrics, /impression|views|reach/i, 'sum'),
    };
  }
  const published = (await postiz.posts(addDays(ctx.now, -7), ctx.now)).filter((p) => p.state === 'PUBLISHED');
  for (const p of published) {
    const network = p.integration.providerIdentifier as Network;
    let metrics: Awaited<ReturnType<Postiz['postAnalytics']>> = [];
    if (network !== 'bluesky' && network !== 'mastodon') {
      // Each X statistic Postiz reads is billed to the X account.
      const xAllowed = network !== 'x' || xReadsThisMonth(ctx) + X_PRICES.read <= CAPS.xReadsMonthly;
      if (xAllowed) {
        metrics = await postiz.postAnalytics(p.id, 7).catch(() => []);
        if (network === 'x') ctx.db.run("INSERT INTO spend (at, service, usd, run_id) VALUES (?, 'x', ?, ?)", new Date().toISOString(), X_PRICES.read, ctx.runId);
      }
    }
    stats.posts.push({
      id: p.id,
      network,
      publishDate: p.publishDate,
      url: p.releaseURL,
      likes: metricTotal(metrics, /like|j.aime|reaction/i, 'sum'),
      comments: metricTotal(metrics, /comment|repl/i, 'sum'),
      impressions: metricTotal(metrics, /impression|views|reach/i, 'sum'),
      shares: metricTotal(metrics, /share|repost|retweet|quote|partage/i, 'sum'),
      saves: metricTotal(metrics, /save|enregistr|bookmark/i, 'sum'),
    });
  }
  return stats;
}

/** Collects every source for the week that ends with `ctx.now`, each on its own. */
export async function collectAll(ctx: Ctx): Promise<Week> {
  const week = weekOf(ctx.now);
  const gsc = await step(ctx, 'lecture des chiffres de Google', () => collectGsc(ctx), (d) => `${d.totals7.impressions} impressions sur 7 jours`);
  saveSnapshot(ctx, 'gsc', week, gsc);
  const cloudflare = await step(ctx, 'lecture des visites du site', () => collectCloudflare(ctx), (d) => `${d.visits} visites sur 7 jours`);
  saveSnapshot(ctx, 'cloudflare', week, cloudflare);
  const metrics1 = await step(ctx, 'lecture des compteurs du site', () => collectMetrics(ctx, 1));
  saveSnapshot(ctx, 'metrics1', week, metrics1);
  const metrics4 = await step(ctx, 'lecture des compteurs du site sur 4 semaines', () => collectMetrics(ctx, 4));
  saveSnapshot(ctx, 'metrics4', week, metrics4);
  const postiz = await step(ctx, 'lecture des statistiques des réseaux', () => collectPostiz(ctx), (d) => `${d.posts.length} publications de la semaine lues`);
  saveSnapshot(ctx, 'postiz', week, postiz);
  const bluesky = await step(ctx, 'lecture de Bluesky', () => collectBluesky(ctx, addDays(ctx.now, -28)), (d) => `${d.posts.length} publications sur 4 semaines`);
  saveSnapshot(ctx, 'bluesky', week, bluesky);
  const mastodon = await step(ctx, 'lecture de Mastodon', () => collectMastodon(ctx, addDays(ctx.now, -28)), (d) => `${d.posts.length} publications sur 4 semaines`);
  saveSnapshot(ctx, 'mastodon', week, mastodon);
  return { week, gsc, cloudflare, metrics1, metrics4, postiz, bluesky, mastodon };
}
