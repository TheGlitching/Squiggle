/**
 * Links to X (`src/x/*`), against recorded answers of the official API v2.
 *
 * What is pinned: only X's hosts are read this way, and a press link or a
 * lookalike host never reaches X; without the secret nothing is called; a
 * publication comes back whole (the long text, the images' alternative
 * texts); a thread is read from any of its publications, in order, stopping
 * at replies from other accounts and at the length limit; a second link into
 * a thread already read is served from our copy and costs nothing; the daily
 * caps stop the reads before X is called; a plan without search falls back
 * to walking the thread up; and the reads and their cost reach the metrics.
 * No test reaches a network.
 */
import { describe, expect, it } from 'vitest';

import { magicLogin, makeTestEnv, type TestEnv } from './helpers';
import { mailServicesOf } from '../src/index';
import { receiveEmail, type InboundEmail } from '../src/mail/inbound';
import { isXLinkOnly, parseXLink } from '../src/x/client';
import { threadAround, xServicesOf, type XEnv } from '../src/x/thread';
import { DAY_MS } from '../src/usage/limits';

const ALICE = { id: '42', username: 'alice', name: 'Alice Martin' };
const BOB = { id: '77', username: 'bob', name: 'Bob' };

/** One publication as the API returns it. */
function post(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    text: `Publication ${id}`,
    author_id: ALICE.id,
    conversation_id: '1001',
    created_at: '2026-11-01T08:00:00.000Z',
    ...over,
  };
}
const reply = (id: string, to: string, over: Record<string, unknown> = {}) =>
  post(id, { referenced_tweets: [{ type: 'replied_to', id: to }], ...over });

/** Alice's thread: 1001 -> 1002 -> 1003 -> 1004, then an answer of hers to Bob's reply (not part of it). */
const THREAD = [
  post('1001', { text: 'Fil : pourquoi le chômage baisse (1/4)' }),
  reply('1002', '1001', { text: '2/4 Les chiffres de l’INSEE disent le contraire.' }),
  reply('1003', '1002', { text: '3/4 Voici la source.', attachments: { media_keys: ['m1'] } }),
  reply('1004', '1003', { text: '4/4 Conclusion.' }),
  reply('1009', '5555', { text: 'Merci Bob, oui.' }),
];

const body = (data: unknown, users = [ALICE], media: unknown[] = []) =>
  JSON.stringify({ data, includes: { users, media } });

interface FakeX {
  fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  calls: string[];
  authorization: Array<string | null>;
}

/**
 * The API as recorded. `search` decides the search endpoint's answer;
 * `posts` is every publication a lookup can find.
 */
function fakeX(opts: { posts?: Array<Record<string, unknown>>; search?: Response | (() => Response) } = {}): FakeX {
  const posts = opts.posts ?? THREAD;
  const calls: string[] = [];
  const authorization: Array<string | null> = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(`${url.pathname}${url.searchParams.get('ids') ? `?ids=${url.searchParams.get('ids')}` : ''}`);
    authorization.push(new Headers(init?.headers).get('authorization'));
    if (url.pathname.startsWith('/2/tweets/search/')) {
      const q = url.searchParams.get('query') ?? '';
      expect(q).toMatch(/^conversation_id:\d+ from:\d+$/);
      if (opts.search) return typeof opts.search === 'function' ? opts.search() : opts.search.clone();
      const conversation = /conversation_id:(\d+)/.exec(q)![1];
      return new Response(body(posts.filter((p) => p.conversation_id === conversation && p.author_id === ALICE.id)));
    }
    const found = posts.find((p) => p.id === url.searchParams.get('ids'));
    if (!found) return new Response(JSON.stringify({ errors: [{ title: 'Not Found Error' }] }), { status: 200 });
    const author = found.author_id === BOB.id ? BOB : ALICE;
    return new Response(
      body(
        [found],
        [author],
        [{ media_key: 'm1', alt_text: 'Courbe du chômage de 2019 à 2026' }],
      ),
    );
  };
  return { fetchImpl, calls, authorization };
}

const ENV: XEnv = { X_BEARER_TOKEN: 'recorded-token' };

function withX(x: FakeX, env: XEnv = ENV): TestEnv {
  const t = makeTestEnv();
  t.services.x = xServicesOf(env, x.fetchImpl as never);
  return t;
}

async function readLink(env: TestEnv, link: string, ip = '203.0.113.7') {
  const res = await env.handler(
    new Request(`${env.webAppOrigin}/web/anon/x-post?url=${encodeURIComponent(link)}`, {
      headers: { origin: env.webAppOrigin, 'cf-connecting-ip': ip },
    }),
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function counters(env: TestEnv): Promise<Record<string, number>> {
  return (await env.db.collectMetrics({ now: env.clock.now(), weeks: 1, trialAnalyses: 3 })).counters;
}

describe('which links are X', () => {
  it('accepts the publication links of X and twitter, in the forms the apps share', () => {
    for (const link of [
      'https://x.com/alice/status/1003',
      'https://twitter.com/alice/status/1003?s=20&t=abc',
      'https://www.x.com/alice/status/1003/photo/1',
      'https://mobile.twitter.com/alice/status/1003',
      'https://x.com/i/status/1003',
      'https://x.com/i/web/status/1003',
    ]) {
      expect(parseXLink(link)).toEqual({ id: '1003' });
    }
  });

  it('refuses everything else: press, lookalike hosts, profiles, other schemes', () => {
    for (const link of [
      'https://www.lemonde.fr/politique/article/2026/11/01/emploi.html',
      'https://x.com.evil.example/alice/status/1003',
      'https://notx.com/alice/status/1003',
      'https://twitter.com.fr/alice/status/1003',
      'https://x.com/alice',
      'https://x.com/alice/status/abc',
      'https://x.com/alice/likes/1003',
      'javascript:alert(1)',
      'ftp://x.com/alice/status/1003',
      'pas un lien',
    ]) {
      expect(parseXLink(link)).toBeNull();
    }
    expect(isXLinkOnly('https://x.com/alice/status/1003')).toBe(true);
    expect(isXLinkOnly('regarde https://x.com/alice/status/1003')).toBe(false);
  });
});

describe('reading a publication', () => {
  it('returns the text whole, with the images’ alternative texts, as a publication X of the author', async () => {
    const x = fakeX({
      posts: [post('2001', { conversation_id: '2001', text: 'tronqué…', note_tweet: { text: 'Le texte entier, bien au-delà de 280 caractères.' }, attachments: { media_keys: ['m1'] } })],
    });
    const env = withX(x);
    const { status, body: out } = await readLink(env, 'https://x.com/alice/status/2001');

    expect(status).toBe(200);
    expect(out).toMatchObject({
      ok: true,
      title: 'Publication X de @alice',
      author: '@alice',
      url: 'https://x.com/alice/status/2001',
      postsRead: 1,
      partial: false,
    });
    expect(out.text).toBe('Le texte entier, bien au-delà de 280 caractères.\n[Image : Courbe du chômage de 2019 à 2026]');
    // The token goes to X as the application's bearer, and nothing else of ours goes with it.
    expect(new Set(x.authorization)).toEqual(new Set(['Bearer recorded-token']));
  });

  it('does not read a press link, and does not call X for it', async () => {
    const x = fakeX();
    const env = withX(x);
    const { status, body: out } = await readLink(env, 'https://www.presse.example/politique/emploi.html');
    expect(status).toBe(400);
    expect(out.error).toBe('invalid_url');
    expect(x.calls).toEqual([]);
  });

  it('is closed without the secret: nothing is called and the reader is told to paste', async () => {
    const x = fakeX();
    const env = withX(x, {});
    expect(env.services.x).toBeUndefined();
    const { status, body: out } = await readLink(env, 'https://x.com/alice/status/1003');
    expect(status).toBe(404);
    expect(out.error).toBe('x_unavailable');
    expect(String(out.message)).toContain('collez');
    expect(x.calls).toEqual([]);
  });

  it('says so when the publication is deleted or protected (an answer with errors and no data)', async () => {
    const env = withX(fakeX());
    const { body: out } = await readLink(env, 'https://x.com/alice/status/999999');
    expect(out.error).toBe('x_unavailable');
    expect((await counters(env)).x_unavailable).toBe(1);
  });

  it('says so when X refuses or fails, billing nothing', async () => {
    for (const status of [401, 402, 429, 503]) {
      const failing = async () => new Response('{}', { status });
      const env = makeTestEnv();
      env.services.x = xServicesOf(ENV, failing as never);
      const { body: out } = await readLink(env, 'https://x.com/alice/status/1003');
      expect(out.error).toBe('x_unavailable');
      expect((await counters(env)).cost_x).toBe(0);
    }
  });
});

describe('reading a thread', () => {
  it('reads the author’s whole thread from any of its publications, in order, without the other accounts’ replies', async () => {
    const x = fakeX();
    const env = withX(x);
    const { body: out } = await readLink(env, 'https://x.com/alice/status/1003');

    expect(out).toMatchObject({ title: 'Fil X de @alice, 4 publications lues', postsRead: 4, partial: false });
    const text = String(out.text);
    expect(text.indexOf('(1/4)')).toBeLessThan(text.indexOf('2/4'));
    expect(text.indexOf('2/4')).toBeLessThan(text.indexOf('3/4'));
    expect(text.indexOf('3/4')).toBeLessThan(text.indexOf('4/4'));
    expect(text).toContain('[Image : Courbe du chômage de 2019 à 2026]');
    expect(text).not.toContain('Merci Bob');
    // One lookup for the link, one search on its conversation.
    expect(x.calls).toEqual(['/2/tweets?ids=1003', '/2/tweets/search/recent']);
  });

  it('serves a second link into the same thread from our copy: no call, no cost', async () => {
    const x = fakeX();
    const env = withX(x);
    await readLink(env, 'https://x.com/alice/status/1003');
    const spent = (await counters(env)).cost_x;
    const callsBefore = x.calls.length;

    const { body: out } = await readLink(env, 'https://x.com/alice/status/1001', '198.51.100.9');
    expect(out).toMatchObject({ title: 'Fil X de @alice, 4 publications lues', postsRead: 4 });
    expect(x.calls).toHaveLength(callsBefore);
    const c = await counters(env);
    expect(c.cost_x).toBe(spent);
    expect(c.x_cache_hit).toBe(1);

    // Past the day, X is asked again.
    env.clock.advance(DAY_MS + 1);
    await readLink(env, 'https://x.com/alice/status/1001');
    expect(x.calls.length).toBeGreaterThan(callsBefore);
  });

  it('counts the reads and what X bills for them, each resource once', async () => {
    const env = withX(fakeX());
    await readLink(env, 'https://x.com/alice/status/1003');
    const c = await counters(env);
    // The lookup bills 1003 and Alice; the search returns five publications of Alice's, of which 1003 is already paid.
    expect(c.x_read).toBe(2);
    expect(c.x_posts_read).toBe(5);
    expect(c.cost_x).toBe(5 * 5_000 + 10_000);
  });

  it('stops at the length limit and says the thread was not read whole', async () => {
    const long = [post('3001', { conversation_id: '3001' })];
    for (let i = 1; i < 30; i += 1) long.push(reply(String(3001 + i), String(3000 + i), { conversation_id: '3001' }));
    const env = withX(fakeX({ posts: long }), { ...ENV, X_THREAD_MAX_POSTS: '25' });
    const { body: out } = await readLink(env, 'https://x.com/alice/status/3001');
    expect(out.postsRead).toBe(25);
    expect(out.partial).toBe(true);
  });

  it('falls back to walking the thread up when the plan has no search, and says the replies after the link were not read', async () => {
    const x = fakeX({ search: new Response('{"title":"Forbidden"}', { status: 403 }) });
    const env = withX(x);
    const { body: out } = await readLink(env, 'https://x.com/alice/status/1003');

    expect(x.calls).toEqual(['/2/tweets?ids=1003', '/2/tweets/search/recent', '/2/tweets?ids=1002', '/2/tweets?ids=1001']);
    expect(out).toMatchObject({ postsRead: 3, partial: true });
    expect(String(out.text)).not.toContain('4/4');
    expect(String(out.text).indexOf('(1/4)')).toBeLessThan(String(out.text).indexOf('3/4'));
  });

  it('keeps what a walk-up read per publication, so a second link into it asks only for what is missing', async () => {
    const x = fakeX({ search: new Response('{}', { status: 403 }) });
    const env = withX(x);
    await readLink(env, 'https://x.com/alice/status/1003');
    x.calls.length = 0;
    await readLink(env, 'https://x.com/alice/status/1002', '198.51.100.9');
    // 1002 is ours already; its search is retried, and 1001 is ours as well.
    expect(x.calls).not.toContain('/2/tweets?ids=1002');
    expect(x.calls).not.toContain('/2/tweets?ids=1001');
  });

  it('stops walking up at another account’s publication, which is not part of the thread', async () => {
    const posts = [
      post('4001', { conversation_id: '4000', author_id: BOB.id, text: 'Question de Bob' }),
      reply('4002', '4001', { conversation_id: '4000', text: 'Réponse d’Alice' }),
    ];
    const x = fakeX({ posts, search: new Response('{}', { status: 403 }) });
    const env = withX(x);
    const { body: out } = await readLink(env, 'https://x.com/alice/status/4002');
    expect(out).toMatchObject({ title: 'Publication X de @alice', postsRead: 1 });
    expect(String(out.text)).not.toContain('Bob');
  });

  it('goes to the full archive for a thread older than a week', async () => {
    const old = [post('5001', { conversation_id: '5001', created_at: '2023-01-02T08:00:00.000Z' })];
    const x = fakeX({ posts: old });
    const env = withX(x);
    await readLink(env, 'https://x.com/alice/status/5001');
    expect(x.calls).toContain('/2/tweets/search/all');
  });
});

describe('the spending caps', () => {
  it('stops a reader at their daily cap, before X is called, with a clear message', async () => {
    const x = fakeX();
    // A cap under the price of one lookup.
    const env = withX(x, { ...ENV, X_ACCOUNT_DAILY_CAP_USD: '0.01' });
    const { status, body: out } = await readLink(env, 'https://x.com/alice/status/1003');
    expect(status).toBe(429);
    expect(out.error).toBe('x_cap');
    expect(String(out.message)).toContain('collez');
    expect(x.calls).toEqual([]);
    expect((await counters(env)).refused_x_cap).toBe(1);
  });

  it('stops the whole site at its daily cap, whoever asks, and opens again the next day', async () => {
    const x = fakeX();
    // Room for a thread's lookup and search once; the second thread's search no longer fits.
    const env = withX(x, { ...ENV, X_DAILY_CAP_USD: '0.16', X_ACCOUNT_DAILY_CAP_USD: '1' });
    expect((await readLink(env, 'https://x.com/alice/status/1003', '203.0.113.1')).body.ok).toBe(true);
    env.clock.advance(1000);
    // Another thread, so our copy does not answer.
    const other = fakeX({ posts: [post('6001', { conversation_id: '6001' })] });
    env.services.x = xServicesOf({ ...ENV, X_DAILY_CAP_USD: '0.16', X_ACCOUNT_DAILY_CAP_USD: '1' }, other.fetchImpl as never);
    // The lookup still fits; the search no longer does, so the publication is served alone and said to be.
    const alone = await readLink(env, 'https://x.com/alice/status/6001', '203.0.113.2');
    expect(alone.body).toMatchObject({ ok: true, postsRead: 1, partial: true });
    expect(other.calls).toEqual(['/2/tweets?ids=6001']);

    env.clock.advance(DAY_MS);
    expect((await readLink(env, 'https://x.com/alice/status/6001', '203.0.113.2')).body).toMatchObject({ partial: false });
  });

  it('gives back a reservation X did not bill', async () => {
    const x = fakeX();
    const env = withX(x, { ...ENV, X_ACCOUNT_DAILY_CAP_USD: '0.1' });
    // Four failures in a row would exhaust the cap if their reservations were kept.
    const failing = async () => new Response('{}', { status: 503 });
    env.services.x = xServicesOf({ ...ENV, X_ACCOUNT_DAILY_CAP_USD: '0.1' }, failing as never);
    for (let i = 0; i < 6; i += 1) expect((await readLink(env, 'https://x.com/alice/status/1003')).body.error).toBe('x_unavailable');
  });
});

describe('the thread of a link', () => {
  it('is the self-replies connected to it, oldest first, however the posts arrive', () => {
    const shuffled = [THREAD[3], THREAD[4], THREAD[1], THREAD[0], THREAD[2]].map((p) => ({
      id: p.id,
      conversationId: '1001',
      authorId: ALICE.id,
      authorUsername: 'alice',
      authorName: ALICE.name,
      text: p.text,
      createdAt: '',
      repliedToId: (p as { referenced_tweets?: Array<{ id: string }> }).referenced_tweets?.[0].id ?? null,
      altTexts: [],
    }));
    expect(threadAround(shuffled, '1002', 25).map((p) => p.id)).toEqual(['1001', '1002', '1003', '1004']);
    expect(threadAround(shuffled, '1009', 25).map((p) => p.id)).toEqual(['1009']);
  });
});

describe('a forwarded link to X', () => {
  const READER = 'marie.dupont@gmail.com';
  const PASS =
    'mx.cloudflare.net; dkim=pass header.d=gmail.com header.s=s header.b=Xy1; dmarc=pass header.from=gmail.com policy.dir=none; spf=pass smtp.mailfrom=marie.dupont@gmail.com';

  function message(text: string): InboundEmail {
    const raw = [
      `Authentication-Results: ${PASS}`,
      'MIME-Version: 1.0',
      'Message-ID: <x-link-1@mail.gmail.com>',
      'Subject: Fwd: un fil',
      `From: Marie <${READER}>`,
      'To: verifier@squiggle.fr',
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      text,
      '',
    ].join('\r\n');
    return { from: READER, raw, rawSize: raw.length, setReject: () => undefined };
  }

  it('reads the thread through X and analyses it as a short message, not as a link to look up', async () => {
    const x = fakeX();
    const env = withX(x);
    await magicLogin(env, READER);
    env.email.sent = [];
    const jobs: unknown[] = [];
    const s = { ...mailServicesOf(env.services), mailQueue: { send: async (job: unknown) => void jobs.push(job) } as never };

    expect(await receiveEmail(s, message('https://x.com/alice/status/1003'))).toBe('queued');
    expect(jobs).toHaveLength(1);
    expect(x.calls).toEqual(['/2/tweets?ids=1003', '/2/tweets/search/recent']);
    expect((await counters(env)).run_started_message).toBe(1);
  });

  it('answers that the publication could not be read, when X cannot give it', async () => {
    const x = fakeX();
    const env = withX(x);
    await magicLogin(env, READER);
    env.email.sent = [];
    const s = mailServicesOf(env.services);

    expect(await receiveEmail(s, message('https://x.com/alice/status/999999'))).toBe('link_unknown');
    expect(env.email.sent).toHaveLength(1);
    expect(env.email.sent[0].html).toContain('collez');
    expect(env.llm.calls.complete).toBe(0);
  });

  it('is the old answer when the secret is absent', async () => {
    const env = withX(fakeX(), {});
    await magicLogin(env, READER);
    env.email.sent = [];
    expect(await receiveEmail(mailServicesOf(env.services), message('https://x.com/alice/status/1003'))).toBe('link_unknown');
    expect(env.email.sent[0].html).toContain('ne va jamais chercher');
  });
});
