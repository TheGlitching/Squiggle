/**
 * A report from its link alone (`GET /web/anon/link`).
 *
 * A reader who shares an article or a video from a phone app has a link and
 * no text, so the (url, text) key can never answer them. What is pinned here:
 * the link finds a report the extension built from the page itself, whatever
 * form the link takes (a `youtu.be` share, an AMP or mobile edition, tracking
 * parameters); nothing is fetched and nothing is spent; a text pasted on the
 * site is never served this way, since a pasted text can be invented and filed
 * under a real address; a report under another prompt version, or past its
 * expiry, is not served either; and the article's words in what is served are
 * held to short quotations.
 */
import { describe, expect, it } from 'vitest';

import { generateSigningKeyPair, HostedAnalysisClient, type AnalysisReport } from '@squiggle/shared';

import { canonicalArticleUrl } from '../src/analyze/canonicalUrl';
import { MAX_QUOTE_WORDS, MIN_QUOTE_WORDS, shortQuotes } from '../src/analyze/citations';
import { createWorker } from '../src/index';
import { REPORT_TTL_MS } from '../src/usage/limits';
import { claim, exportJwk, magicLogin, makeTestEnv, type TestEnv } from './helpers';

const VIDEO = 'dQw4w9WgXcQ';
/** The address the extension files a video under, whichever page it was read on. */
const WATCH_URL = `https://www.youtube.com/watch?v=${VIDEO}`;
/** What the YouTube app's Share button gives. */
const SHARED_VIDEO = `https://youtu.be/${VIDEO}?si=AbCdEf123`;
/** The article as the extension read it on the publisher's site. */
const ARTICLE_URL = 'https://www.presse.example/politique/emploi-2026.html';

/** A text long enough that the stub's two short quotes stay a small share of it. */
const TEXT = [
  { id: 'b1', type: 'paragraph' as const, text: 'Le chômage a baissé de 12 % en un an.', charStart: 0 },
  { id: 'b2', type: 'paragraph' as const, text: 'Tout le monde le sait.', charStart: 40 },
  { id: 'b3', type: 'paragraph' as const, text: 'La suite de l’article développe. '.repeat(100), charStart: 64 },
];

/** The extension, signed in, reading the page on its own tab. */
async function extension(env: TestEnv): Promise<HostedAnalysisClient> {
  const keyPair = await generateSigningKeyPair();
  const { sessionCookie } = await magicLogin(env, 'lea@example.org');
  const res = await claim(env, sessionCookie, await exportJwk(keyPair));
  const { token } = (await res.json()) as { token: string };
  return new HostedAnalysisClient({
    baseUrl: env.webAppOrigin,
    token,
    privateKey: keyPair.privateKey,
    fetchImpl: ((url: RequestInfo | URL, init?: RequestInit) =>
      env.handler(new Request(url as string, init))) as typeof fetch,
  });
}

/** The site, from a phone the link was shared to: no cookie, the site's own origin. */
async function lookUp(
  env: TestEnv,
  link: string,
  handler: (req: Request) => Promise<Response> = env.handler,
): Promise<{ status: number; body: { hit?: boolean; report?: AnalysisReport; cachedAt?: number; error?: string } }> {
  const res = await handler(
    new Request(`${env.webAppOrigin}/web/anon/link?url=${encodeURIComponent(link)}`, {
      headers: { origin: env.webAppOrigin, 'cf-connecting-ip': '203.0.113.7' },
    }),
  );
  return { status: res.status, body: await res.json() };
}

async function counters(env: TestEnv): Promise<Record<string, number>> {
  return (await env.db.collectMetrics({ now: env.clock.now(), weeks: 1, trialAnalyses: 3 })).counters;
}

describe('a link shared on its own', () => {
  it('finds the report the extension made from a video’s captions, from every form of the link, for nothing', async () => {
    // The extension signs with the real clock; the server's must agree with it.
    const env = makeTestEnv({ now: Date.now() });
    const made = await (await extension(env)).analyze({ url: WATCH_URL, title: 'Emploi', blocks: TEXT });
    const calls = { ...env.llm.calls };

    for (const link of [
      SHARED_VIDEO,
      `https://www.youtube.com/watch?v=${VIDEO}&si=x&t=42s`,
      `https://m.youtube.com/watch?v=${VIDEO}&feature=share`,
      `https://www.youtube.com/shorts/${VIDEO}?si=x`,
    ]) {
      const { status, body } = await lookUp(env, link);
      expect(status).toBe(200);
      expect(body.hit).toBe(true);
      expect(body.report).toEqual(made);
      expect(body.cachedAt).toBe(env.clock.now());
    }

    // No model call, no run, and nothing for the site's daily allowance to count.
    expect(env.llm.calls).toEqual(calls);
    const c = await counters(env);
    expect(c.link_check).toBe(4);
    expect(c.link_hit).toBe(4);
    expect(c.run_started_anon).toBe(0);
  });

  it('finds an article’s report from its AMP, mobile or tracked link', async () => {
    const env = makeTestEnv({ now: Date.now() });
    const made = await (await extension(env)).analyze({ url: ARTICLE_URL, blocks: TEXT, partialAccess: true });

    for (const link of [
      'https://presse.example/politique/emploi-2026.html?utm_source=app&fbclid=x',
      'https://m.presse.example/politique/emploi-2026.html',
      'https://amp.presse.example/politique/emploi-2026.html',
      'https://www.presse.example/amp/politique/emploi-2026.html',
      'https://www.presse.example/politique/emploi-2026.amp.html',
      'https://www-presse-example.cdn.ampproject.org/c/s/www.presse.example/politique/emploi-2026.html',
    ]) {
      const { body } = await lookUp(env, link);
      expect(body.hit).toBe(true);
      expect(body.report).toEqual(made);
    }
    expect((await lookUp(env, 'https://presse.example/politique/une-autre-page.html')).body.hit).toBe(false);
  });

  it('says so for a page nobody has analysed', async () => {
    const env = makeTestEnv();
    const { status, body } = await lookUp(env, SHARED_VIDEO);
    expect(status).toBe(200);
    expect(body.hit).toBe(false);
    expect(body.report).toBeUndefined();
    expect((await counters(env)).link_hit).toBe(0);
  });

  it('never serves a text pasted on the site, which anyone could have written', async () => {
    const env = makeTestEnv();
    const visitor = new HostedAnalysisClient({
      baseUrl: env.webAppOrigin,
      session: 'none',
      fetchImpl: ((url: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        headers.set('origin', env.webAppOrigin);
        headers.set('cf-connecting-ip', '198.51.100.4');
        return env.handler(new Request(url as string, { ...init, headers }));
      }) as typeof fetch,
    });
    await visitor.analyze({ url: SHARED_VIDEO, blocks: TEXT });

    expect((await lookUp(env, SHARED_VIDEO)).body.hit).toBe(false);
    // It is still filed under the text, for a reader who pastes the same words.
    expect(await visitor.cached({ url: WATCH_URL, blocks: TEXT })).not.toBeNull();
  });

  it('serves only a report made under the prompt version in use, and not past its expiry', async () => {
    const env = makeTestEnv({ now: Date.now() });
    await (await extension(env)).analyze({ url: WATCH_URL, blocks: TEXT });

    const nextPrompts = createWorker({ ...env.services, promptVersion: 'prochaine' });
    expect((await lookUp(env, SHARED_VIDEO, (req) => nextPrompts.fetch(req))).body.hit).toBe(false);

    env.clock.advance(REPORT_TTL_MS);
    expect((await lookUp(env, SHARED_VIDEO)).body.hit).toBe(false);
  });

  it('never serves a short message the extension read: a post on the page is not its article', async () => {
    const env = makeTestEnv({ now: Date.now() });
    const client = await extension(env);
    // A reader selected one post on the page: it is analysed as a message, under the page's address.
    await client.analyze({ url: ARTICLE_URL, blocks: TEXT.slice(0, 2) });

    expect((await lookUp(env, ARTICLE_URL)).body.hit).toBe(false);
    // It is still filed under its words, for a reader who sends the same message.
    expect(await client.cached({ url: ARTICLE_URL, blocks: TEXT.slice(0, 2) })).not.toBeNull();
    expect((await counters(env)).run_started_message).toBe(1);
  });

  it('refuses an address that is not a web page, and any origin but the site', async () => {
    const env = makeTestEnv();
    const bad = await lookUp(env, 'chrome://settings');
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('invalid_url');

    const elsewhere = await env.handler(
      new Request(`${env.webAppOrigin}/web/anon/link?url=${encodeURIComponent(SHARED_VIDEO)}`, {
        headers: { origin: 'https://ailleurs.example' },
      }),
    );
    expect(elsewhere.status).toBe(403);
  });
});

describe('the cache key of a link', () => {
  it('is one address for every form of a video’s link', () => {
    const key = canonicalArticleUrl(WATCH_URL);
    expect(key).toBe(`https://youtube.com/watch?v=${VIDEO}`);
    for (const link of [
      SHARED_VIDEO,
      `https://www.youtube.com/watch?v=${VIDEO}&si=x`,
      `https://m.youtube.com/watch?v=${VIDEO}&feature=share`,
      `https://www.youtube.com/shorts/${VIDEO}?si=x`,
    ]) {
      expect(canonicalArticleUrl(link)).toBe(key);
    }
  });

  it('is one address for an article and its AMP and mobile editions, and keeps a site that only looks like one', () => {
    const key = 'https://lemonde.fr/politique/article/x.html';
    for (const link of [
      'https://www.lemonde.fr/politique/article/x.html?outputType=amp',
      'https://www.google.com/amp/s/www.lemonde.fr/politique/article/x.html',
      'https://www.lemonde.fr/politique/article/x.html?amp=1&usqp=mq331AQ',
    ]) {
      expect(canonicalArticleUrl(link)).toBe(key);
    }
    expect(canonicalArticleUrl('https://www.lefigaro.fr/politique/x-20261028/amp/')).toBe(
      'https://lefigaro.fr/politique/x-20261028',
    );
    expect(canonicalArticleUrl('https://m.fr/article')).toBe('https://m.fr/article');
  });
});

describe('short quotations', () => {
  const report = (quotes: string[], textLengthChars: number) =>
    ({
      findings: quotes.map((quote, i) => ({ id: `f${i}`, quote })),
      claims: [],
      research: { withdrawn: [] },
      meta: { textLengthChars },
    }) as unknown as AnalysisReport;
  const words = (n: number) => Array.from({ length: n }, (_, i) => `mot${i}`).join(' ');

  it('holds each quote to a sentence or two, however long the article', () => {
    const served = shortQuotes(report([words(60)], 1_000_000));
    expect(served.findings[0].quote.split(' ')).toHaveLength(MAX_QUOTE_WORDS);
    expect(served.findings[0].quote.endsWith('…')).toBe(true);
  });

  it('shrinks every quote as they multiply, so together they stay a small share of the text', () => {
    // 6 000 characters is about 1 000 words: 100 quoted words in all, 10 for each of ten findings.
    const served = shortQuotes(report(Array.from({ length: 10 }, () => words(25)), 6_000));
    for (const finding of served.findings) expect(finding.quote.split(' ')).toHaveLength(10);
    // Never below a few words, or a finding would no longer say which passage it is about.
    const many = shortQuotes(report(Array.from({ length: 100 }, () => words(25)), 6_000));
    expect(many.findings[0].quote.split(' ')).toHaveLength(MIN_QUOTE_WORDS);
  });
});
