/**
 * The official X API v2, as far as reading a publication goes.
 *
 * Only X's own hosts are ever recognised (`parseXLink`): a press link, or any
 * other address, is never read this way. What leaves for X is a publication
 * identifier or a search on a conversation identifier, with the application's
 * bearer token. Nothing about the reader goes with it.
 *
 * X bills per resource returned (publication 0.005 USD, author 0.010 USD, once
 * per resource per UTC day), so every call reports how many of each it
 * returned and the caller turns that into spend.
 */
import type { FetchLike } from '../lib/brevo';

const API = 'https://api.x.com/2';

const X_HOSTS = new Set(['x.com', 'twitter.com', 'mobile.x.com', 'mobile.twitter.com']);

/** The publication a link names, or null for anything that is not an X publication link. */
export function parseXLink(raw: string): { id: string } | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!X_HOSTS.has(host)) return null;
  // /{user}/status/{id}, /i/status/{id}, /i/web/status/{id}, and /{user}/status/{id}/photo/1.
  const match = /^\/(?:[A-Za-z0-9_]{1,15}|i(?:\/web)?)\/status(?:es)?\/(\d{1,19})(?:\/|$)/.exec(url.pathname);
  return match ? { id: match[1] } : null;
}

/** True when the text is nothing but one link to an X publication. */
export function isXLinkOnly(text: string): boolean {
  return parseXLink(text) !== null && !/\s/.test(text.trim());
}

export interface XPost {
  id: string;
  conversationId: string;
  authorId: string;
  authorUsername: string;
  authorName: string;
  /** Full text: `note_tweet` when the publication is long, `text` otherwise. */
  text: string;
  createdAt: string;
  /** The publication this one answers, when it is a reply. */
  repliedToId: string | null;
  /** The alternative texts the author wrote for the images, in order. */
  altTexts: string[];
}

export interface XReadResult {
  posts: XPost[];
  /** The authors returned beside them: X bills each resource, publication or user, once a day. */
  userIds: string[];
}

export type XFailure = 'not_found' | 'refused' | 'unavailable';

export class XApiError extends Error {
  constructor(
    readonly kind: XFailure,
    readonly status: number,
  ) {
    super(`X API ${kind} (${status})`);
  }
}

/** Fields asked on every read: what the analysis needs and nothing else. */
const QUERY = new URLSearchParams({
  'tweet.fields': 'author_id,conversation_id,created_at,note_tweet,referenced_tweets,attachments',
  expansions: 'author_id,attachments.media_keys',
  'user.fields': 'username,name',
  'media.fields': 'alt_text,type',
});

interface RawPost {
  id: string;
  text?: string;
  author_id?: string;
  conversation_id?: string;
  created_at?: string;
  note_tweet?: { text?: string };
  note_post?: { text?: string };
  referenced_tweets?: Array<{ type: string; id: string }>;
  attachments?: { media_keys?: string[] };
}

interface RawBody {
  data?: RawPost | RawPost[];
  includes?: {
    users?: Array<{ id: string; username?: string; name?: string }>;
    media?: Array<{ media_key: string; alt_text?: string }>;
  };
  errors?: Array<{ type?: string; title?: string }>;
}

export class XApi {
  constructor(
    private readonly bearer: string,
    private readonly fetchImpl: FetchLike,
  ) {}

  /** Publications by identifier (at most 100 per call). */
  async lookup(ids: string[]): Promise<XReadResult> {
    const q = new URLSearchParams(QUERY);
    q.set('ids', ids.join(','));
    return this.read(`${API}/tweets?${q}`, ids.length === 1);
  }

  /**
   * The publications of one conversation written by one author, newest first,
   * within `recent` (7 days) or the full archive. A refusal here is how a
   * plan without search shows itself; the caller falls back to walking up.
   */
  async searchConversation(conversationId: string, authorId: string, archive: boolean, max: number): Promise<XReadResult> {
    const q = new URLSearchParams(QUERY);
    q.set('query', `conversation_id:${conversationId} from:${authorId}`);
    q.set('max_results', String(Math.min(100, Math.max(10, max))));
    return this.read(`${API}/tweets/search/${archive ? 'all' : 'recent'}?${q}`, false);
  }

  private async read(url: string, single: boolean): Promise<XReadResult> {
    let res: Response;
    try {
      res = await this.fetchImpl(url, { headers: { authorization: `Bearer ${this.bearer}`, accept: 'application/json' } });
    } catch {
      throw new XApiError('unavailable', 0);
    }
    // 401/402/403: the token, the credits or the plan; 429: X's own limit. None is the reader's doing.
    if (res.status === 404) throw new XApiError('not_found', 404);
    if (!res.ok) throw new XApiError(res.status === 401 || res.status === 402 || res.status === 403 ? 'refused' : 'unavailable', res.status);
    let body: RawBody;
    try {
      body = (await res.json()) as RawBody;
    } catch {
      throw new XApiError('unavailable', res.status);
    }
    const raw = body.data === undefined ? [] : Array.isArray(body.data) ? body.data : [body.data];
    // A deleted, protected or suspended publication comes back 200 with `errors` and no `data`.
    if (single && raw.length === 0) throw new XApiError('not_found', 200);

    const users = new Map((body.includes?.users ?? []).map((u) => [u.id, u]));
    const media = new Map((body.includes?.media ?? []).map((m) => [m.media_key, m.alt_text ?? '']));
    const posts: XPost[] = raw.map((p) => {
      const author = users.get(p.author_id ?? '');
      return {
        id: p.id,
        conversationId: p.conversation_id ?? p.id,
        authorId: p.author_id ?? '',
        authorUsername: author?.username ?? '',
        authorName: author?.name ?? '',
        text: (p.note_tweet?.text ?? p.note_post?.text ?? p.text ?? '').trim(),
        createdAt: p.created_at ?? '',
        repliedToId: p.referenced_tweets?.find((r) => r.type === 'replied_to')?.id ?? null,
        altTexts: (p.attachments?.media_keys ?? []).map((k) => (media.get(k) ?? '').trim()).filter(Boolean),
      };
    });
    return { posts, userIds: [...users.keys()] };
  }
}
