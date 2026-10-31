/**
 * The Postiz public API, on the VPS (`POSTIZ_API_URL`, loopback only). Postiz
 * holds the queue: the routine adds to it, reads it back, and only deletes
 * what it scheduled itself (the stop lever).
 *
 * Postiz allows 30 requests an hour on most endpoints, 90 on post creation
 * (docs.postiz.com, read on 31 October 2026, the two pages disagree), so every
 * call is counted in the database and a call over budget waits for the hour to
 * roll rather than fail. Writes refuse to run in a dry run: that refusal is
 * what makes `--a-blanc` safe, not the care of each caller.
 */
import type { Network } from './config';
import { fetchJson, type Ctx } from './context';

const BUDGET = { read: 25, create: 80 } as const;
const HOUR = 3_600_000;

export interface Integration {
  id: string;
  name: string;
  identifier: string;
  disabled: boolean;
}

export interface PostizPost {
  id: string;
  content: string;
  publishDate: string;
  releaseURL?: string;
  state: 'QUEUE' | 'PUBLISHED' | 'ERROR' | 'DRAFT';
  error?: string | null;
  integration: { id: string; providerIdentifier: string; name: string };
}

export interface Notification {
  id: string;
  content: string;
  createdAt: string;
}

export interface Metric {
  label: string;
  data: Array<{ total: string; date: string }>;
}

export interface Media {
  id: string;
  path: string;
  alt: string;
}

/** The settings each network's post needs (docs.postiz.com, providers). */
function settings(network: Network, story: boolean): Record<string, unknown> {
  if (network === 'x') return { __type: 'x', who_can_reply_post: 'everyone' };
  // Instagram and Facebook take `post_type: story` (checked in Postiz v2.25.3's own settings, not only its docs).
  if (network === 'instagram') return { __type: 'instagram', post_type: story ? 'story' : 'post' };
  if (network === 'facebook' && story) return { __type: 'facebook', post_type: 'story' };
  return { __type: network };
}

export class Postiz {
  constructor(private readonly ctx: Ctx) {}

  private async budget(kind: keyof typeof BUDGET): Promise<void> {
    for (;;) {
      const since = new Date(Date.now() - HOUR).toISOString();
      const rows = this.ctx.db.all<{ at: string }>("SELECT at FROM calls WHERE service = 'postiz' AND kind = ? AND at > ? ORDER BY at", kind, since);
      if (rows.length < BUDGET[kind]) break;
      const wait = Date.parse(rows[0].at) + HOUR - Date.now() + 1000;
      this.ctx.log(`  Postiz : quota horaire atteint, attente ${Math.ceil(wait / 60000)} min`);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    this.ctx.db.run("INSERT INTO calls (at, service, kind) VALUES (?, 'postiz', ?)", new Date().toISOString(), kind);
  }

  private async call<T>(kind: keyof typeof BUDGET, path: string, init: RequestInit = {}): Promise<T> {
    const write = (init.method ?? 'GET') !== 'GET';
    if (write && this.ctx.dry) throw new Error(`écriture Postiz refusée à blanc : ${init.method} ${path}`);
    await this.budget(kind);
    return fetchJson<T>(this.ctx, 'Postiz', `${this.ctx.secrets.postizUrl}${path}`, {
      ...init,
      headers: { Authorization: this.ctx.secrets.postizKey, 'content-type': 'application/json' },
    });
  }

  integrations(): Promise<Integration[]> {
    return this.call('read', '/integrations');
  }

  async posts(start: Date, end: Date): Promise<PostizPost[]> {
    const q = new URLSearchParams({ startDate: start.toISOString(), endDate: end.toISOString() });
    return (await this.call<{ posts: PostizPost[] }>('read', `/posts?${q}`)).posts;
  }

  async notifications(): Promise<Notification[]> {
    return (await this.call<{ notifications: Notification[] }>('read', '/notifications?page=0')).notifications;
  }

  postAnalytics(postId: string, days: number): Promise<Metric[]> {
    return this.call('read', `/analytics/post/${encodeURIComponent(postId)}?date=${days}`);
  }

  platformAnalytics(integrationId: string, days: number): Promise<Metric[]> {
    return this.call('read', `/analytics/${encodeURIComponent(integrationId)}?date=${days}`);
  }

  /** An image, uploaded once from the site's public address and reused from then on. */
  async media(url: string, alt: string): Promise<Media> {
    const known = this.ctx.db.get<{ postiz_id: string; postiz_path: string }>('SELECT postiz_id, postiz_path FROM media WHERE url = ?', url);
    if (known) return { id: known.postiz_id, path: known.postiz_path, alt };
    const file = await this.call<{ id: string; path: string }>('read', '/upload-from-url', { method: 'POST', body: JSON.stringify({ url }) });
    this.ctx.db.run('INSERT INTO media (url, postiz_id, postiz_path) VALUES (?, ?, ?)', url, file.id, file.path);
    return { id: file.id, path: file.path, alt };
  }

  /**
   * One post on one network, in a request of its own: Postiz deletes a post
   * with its whole group, so a post the owner removes must be alone in its group.
   */
  async create(post: { integrationId: string; network: Network; at: Date; text: string; images: Media[]; draft: boolean; story?: boolean }): Promise<string> {
    const body = {
      type: post.draft ? 'draft' : 'schedule',
      date: post.at.toISOString(),
      shortLink: false,
      tags: [],
      posts: [
        {
          integration: { id: post.integrationId },
          value: [{ content: post.text, image: post.images.map((m) => ({ id: m.id, path: m.path, alt: m.alt })) }],
          settings: settings(post.network, post.story === true),
        },
      ],
    };
    const created = await this.call<Array<{ postId: string }>>('create', '/posts', { method: 'POST', body: JSON.stringify(body) });
    const id = created[0]?.postId;
    if (!id) throw new Error('Postiz : publication créée sans identifiant');
    return id;
  }

  async delete(postId: string): Promise<void> {
    await this.call('read', `/posts/${encodeURIComponent(postId)}`, { method: 'DELETE' });
  }
}

/** A metric's latest total, or its sum when the series is per day. */
export function metricTotal(metrics: Metric[], label: RegExp, how: 'last' | 'sum'): number | null {
  const series = metrics.find((m) => label.test(m.label));
  if (!series || series.data.length === 0) return null;
  const values = series.data.map((d) => Number(d.total)).filter((n) => Number.isFinite(n));
  if (values.length === 0) return null;
  return how === 'last' ? values[values.length - 1] : values.reduce((a, b) => a + b, 0);
}
