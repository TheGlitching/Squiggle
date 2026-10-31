/**
 * Bluesky through its public AppView, without a key: the account's posts with
 * their counters, its followers, and the replies under each post. Postiz has no
 * statistics for Bluesky, and no network's API through Postiz reads comments,
 * so this is where the comment loop starts.
 */
import { fetchJson, type Ctx } from '../context';

const API = 'https://public.api.bsky.app/xrpc';
export const HANDLE = 'squiggle.fr';

export interface BskyPost {
  uri: string;
  cid: string;
  author: { did: string; handle: string };
  record: { text: string; createdAt: string; reply?: { parent: { uri: string } } };
  replyCount?: number;
  repostCount?: number;
  likeCount?: number;
  quoteCount?: number;
  bookmarkCount?: number;
  indexedAt: string;
}

interface ThreadNode {
  post?: BskyPost;
  replies?: ThreadNode[];
}

export interface BskyData {
  followers: number | null;
  posts: Array<{ uri: string; url: string; text: string; createdAt: string; likes: number; reposts: number; replies: number; quotes: number }>;
}

/** The post's address on bsky.app, which is what Postiz returns as `releaseURL`. */
export function bskyUrl(post: Pick<BskyPost, 'uri' | 'author'>): string {
  return `https://bsky.app/profile/${post.author.handle}/post/${post.uri.split('/').pop()}`;
}

export async function collectBluesky(ctx: Ctx, since: Date): Promise<BskyData> {
  const profile = await fetchJson<{ followersCount?: number }>(ctx, 'Bluesky', `${API}/app.bsky.actor.getProfile?actor=${HANDLE}`);
  const feed = await fetchJson<{ feed: Array<{ post: BskyPost }> }>(
    ctx,
    'Bluesky',
    `${API}/app.bsky.feed.getAuthorFeed?actor=${HANDLE}&limit=100&filter=posts_no_replies`,
  );
  const posts = feed.feed
    .map((item) => item.post)
    .filter((p) => p.author.handle === HANDLE && Date.parse(p.record.createdAt) >= since.getTime())
    .map((p) => ({
      uri: p.uri,
      url: bskyUrl(p),
      text: p.record.text,
      createdAt: p.record.createdAt,
      likes: p.likeCount ?? 0,
      reposts: p.repostCount ?? 0,
      replies: p.replyCount ?? 0,
      quotes: p.quoteCount ?? 0,
    }));
  return { followers: profile.followersCount ?? null, posts };
}

/** Every reply under one of our posts, flattened, with our own answers marked by their author. */
export async function repliesUnder(ctx: Ctx, uri: string): Promise<BskyPost[]> {
  const thread = await fetchJson<{ thread: ThreadNode }>(ctx, 'Bluesky', `${API}/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=6&parentHeight=0`);
  const out: BskyPost[] = [];
  const walk = (node: ThreadNode) => {
    for (const child of node.replies ?? []) {
      if (child.post) out.push(child.post);
      walk(child);
    }
  };
  walk(thread.thread);
  return out;
}
