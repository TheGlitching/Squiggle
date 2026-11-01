/**
 * Mastodon through mastodon.social's public API, without a key: the account's
 * posts with their counters, its followers, and the replies under each post.
 * Postiz has no statistics for Mastodon, and reads no comment anywhere, so the
 * account is read here, as Bluesky is (`bluesky.ts`).
 */
import { fetchJson, type Ctx } from '../context';

const INSTANCE = 'https://mastodon.social';
/** The account the site's `rel="me"` link verifies (`web/index.html`). */
export const ACCOUNT = 'squigglefr';

export interface MastoStatus {
  id: string;
  url: string | null;
  uri: string;
  created_at: string;
  content: string;
  in_reply_to_id: string | null;
  replies_count: number;
  reblogs_count: number;
  favourites_count: number;
  account: { acct: string };
}

export interface MastoData {
  followers: number | null;
  posts: Array<{ id: string; url: string; text: string; createdAt: string; likes: number; reposts: number; replies: number }>;
}

/** A status's HTML as plain text: paragraphs and line breaks kept, tags and entities gone. */
export function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' })[e]!)
    .trim();
}

export async function collectMastodon(ctx: Ctx, since: Date): Promise<MastoData> {
  const account = await fetchJson<{ id: string; followers_count?: number }>(ctx, 'Mastodon', `${INSTANCE}/api/v1/accounts/lookup?acct=${ACCOUNT}`);
  const statuses = await fetchJson<MastoStatus[]>(ctx, 'Mastodon', `${INSTANCE}/api/v1/accounts/${account.id}/statuses?exclude_replies=true&exclude_reblogs=true&limit=40`);
  const posts = statuses
    .filter((s) => Date.parse(s.created_at) >= since.getTime())
    .map((s) => ({
      id: s.id,
      url: s.url ?? s.uri,
      text: plainText(s.content),
      createdAt: s.created_at,
      likes: s.favourites_count,
      reposts: s.reblogs_count,
      replies: s.replies_count,
    }));
  return { followers: account.followers_count ?? null, posts };
}

/** Every reply under one of our posts, with our own answers marked by their author. */
export async function repliesUnderStatus(ctx: Ctx, id: string): Promise<MastoStatus[]> {
  return (await fetchJson<{ descendants: MastoStatus[] }>(ctx, 'Mastodon', `${INSTANCE}/api/v1/statuses/${encodeURIComponent(id)}/context`)).descendants;
}
