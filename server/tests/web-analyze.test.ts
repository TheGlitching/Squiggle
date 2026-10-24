/**
 * The web app's analysis of a pasted text (`/web/analyze/*`).
 *
 * The same five stages as `/v1/analyze/*`, reached with the session cookie
 * instead of an install's signature. What is pinned here is what that change
 * of credential must not cost: the Origin is still required, the trial and the
 * subscription are the extension's own, an address given beside the text is
 * never requested, and a report filed from a text without an address is only
 * served to a reader who pasted the same words.
 *
 * The browser half is the shared `HostedAnalysisClient` in session mode, its
 * `fetch` pointed at the server's handler with the two headers a browser adds
 * on its own (the cookie and the Origin). No network.
 */
import { describe, expect, it } from 'vitest';

import { articleTextHash, generateSigningKeyPair, HostedAnalysisClient } from '@squiggle/shared';

import { claim as claimToken, exportJwk, magicLogin, makeTestEnv, signedRequest, type TestEnv } from './helpers';
import { canonicalArticleUrl, PASTED_TEXT_KEY } from '../src/analyze/canonicalUrl';

const SOURCE_URL = 'https://presse.example/politique/emploi-2026';

const BLOCKS = [
  { id: 'b1', type: 'paragraph' as const, text: 'Le chômage a baissé de 12 % en un an.', charStart: 0 },
  { id: 'b2', type: 'paragraph' as const, text: 'Tout le monde le sait.', charStart: 40 },
];

interface WebCall {
  method?: string;
  cookie?: string | null;
  /** `null` sends no Origin header at all. */
  origin?: string | null;
  secFetchSite?: string;
  body?: unknown;
}

function web(env: TestEnv, path: string, opts: WebCall = {}): Promise<Response> {
  const method = opts.method ?? (opts.body === undefined ? 'GET' : 'POST');
  const headers: Record<string, string> = {};
  if (opts.origin !== null) headers.origin = opts.origin ?? env.webAppOrigin;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.secFetchSite) headers['sec-fetch-site'] = opts.secFetchSite;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return env.handler(
    new Request(`${env.webAppOrigin}${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    }),
  );
}

/** The web app's client, as a signed-in browser runs it. */
function browserClient(env: TestEnv, cookie: string): HostedAnalysisClient {
  return new HostedAnalysisClient({
    baseUrl: env.webAppOrigin,
    session: 'cookie',
    fetchImpl: ((url: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set('cookie', cookie);
      headers.set('origin', env.webAppOrigin);
      return env.handler(new Request(url as string, { ...init, headers }));
    }) as typeof fetch,
  });
}

/** Every page the server asks for, so a test can prove it asked for none. */
function recordingFetch(): { fetchImpl: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    urls.push(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
    return new Response('<html><body><p>Page.</p></body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, urls };
}

describe('a pasted text, analysed with the session cookie', () => {
  it('walks the five stages and spends one credit of the reader’s trial', async () => {
    const env = makeTestEnv();
    const { sessionCookie, user } = await magicLogin(env, 'marie@example.org');

    const report = await browserClient(env, sessionCookie).analyze({ title: 'Emploi', blocks: BLOCKS });

    expect(report.schemaVersion).toBe(1);
    expect(typeof report.score).toBe('number');
    // Research confirmed the figure, so the objection was withdrawn: the
    // engine's semantics, unchanged by the entry point.
    expect(report.research.withdrawn).toHaveLength(1);
    expect(await env.db.countUsageLog(user.id)).toBe(1);

    const account = (await (await web(env, '/web/account', { cookie: sessionCookie })).json()) as {
      usage: { remaining: number };
    };
    expect(account.usage.remaining).toBe(2);
  });

  it('shares one trial with the extension: three analyses in all, whichever entry point', async () => {
    const env = makeTestEnv({ now: Date.now() });
    const { sessionCookie } = await magicLogin(env, 'marie@example.org');

    // One analysis from the extension, signed with the install's key.
    const key = await generateSigningKeyPair();
    const { token } = (await (await claimToken(env, sessionCookie, await exportJwk(key))).json()) as { token: string };
    const install = new HostedAnalysisClient({
      baseUrl: env.webAppOrigin,
      token,
      privateKey: key.privateKey,
      fetchImpl: ((url: RequestInfo | URL, init?: RequestInit) =>
        env.handler(new Request(url as string, init))) as typeof fetch,
    });
    await install.analyze({ url: SOURCE_URL, title: 'T', blocks: BLOCKS });

    // Two more from the site, on texts the cache cannot answer for.
    const browser = browserClient(env, sessionCookie);
    for (const n of [1, 2]) {
      await browser.analyze({ blocks: [{ ...BLOCKS[0], text: `${BLOCKS[0].text} (${n})` }, BLOCKS[1]] });
    }

    await expect(
      browser.analyze({ blocks: [{ ...BLOCKS[0], text: 'Un quatrième texte.' }] }),
    ).rejects.toMatchObject({ code: 'trial_exhausted' });
    await expect(install.analyze({ url: `${SOURCE_URL}/2`, title: 'T', blocks: BLOCKS })).rejects.toMatchObject({
      code: 'trial_exhausted',
    });
  });

  it('files a text without an address by its words alone', async () => {
    const env = makeTestEnv();
    const first = await magicLogin(env, 'marie@example.org');
    await browserClient(env, first.sessionCookie).analyze({ blocks: BLOCKS });

    // A second reader pasting the same words, laid out differently, is served
    // that report: no model call, no credit.
    const second = await magicLogin(env, 'paul@example.org');
    const callsBefore = { ...env.llm.calls };
    const relaid = [{ id: 'p1', type: 'paragraph' as const, text: `${BLOCKS[0].text}\n${BLOCKS[1].text}`, charStart: 0 }];
    const hit = await web(env, `/web/analyze/check?text=${await articleTextHash(relaid)}`, { cookie: second.sessionCookie });
    expect(((await hit.json()) as { hit: boolean }).hit).toBe(true);
    await browserClient(env, second.sessionCookie).analyze({ blocks: relaid });
    expect(env.llm.calls).toEqual(callsBefore);
    expect(await env.db.countUsageLog(second.user.id)).toBe(0);

    // One changed figure is another text, and gets its own analysis.
    const changed = [{ ...BLOCKS[0], text: 'Le chômage a baissé de 21 % en un an.' }, BLOCKS[1]];
    const miss = await web(env, `/web/analyze/check?text=${await articleTextHash(changed)}`, { cookie: second.sessionCookie });
    expect(((await miss.json()) as { hit: boolean }).hit).toBe(false);
  });

  it('never requests the address given beside the text, and files the report under it', async () => {
    const pages = recordingFetch();
    const env = makeTestEnv({ fetchImpl: pages.fetchImpl, now: Date.now() });
    const { sessionCookie } = await magicLogin(env, 'marie@example.org');

    await browserClient(env, sessionCookie).analyze({ url: `${SOURCE_URL}?utm_source=x`, title: 'Emploi', blocks: BLOCKS });
    expect(pages.urls).toEqual([]);

    // The address is a real key: a reader of that page in the extension, whose
    // page yields the same text, is served the report the paste produced.
    const key = await generateSigningKeyPair();
    const other = await magicLogin(env, 'paul@example.org');
    const { token } = (await (await claimToken(env, other.sessionCookie, await exportJwk(key))).json()) as {
      token: string;
    };
    const text = await articleTextHash(BLOCKS);
    const res = await env.handler(
      await signedRequest(env, { key, token, path: `/v1/analyze/check?url=${encodeURIComponent(SOURCE_URL)}&text=${text}` }),
    );
    expect(((await res.json()) as { hit: boolean }).hit).toBe(true);
  });

  it('refuses links in a pasted text, so a run from the site can never make the server read a page', async () => {
    const env = makeTestEnv();
    const { sessionCookie } = await magicLogin(env, 'marie@example.org');
    const res = await web(env, '/web/analyze/audit', {
      cookie: sessionCookie,
      body: {
        blocks: BLOCKS,
        citedSources: [{ href: 'http://169.254.169.254/latest', domain: '169.254.169.254', text: 'x', blockId: 'b1' }],
      },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe('invalid_payload');
    expect(body.message).toContain('citedSources');
    expect(env.llm.calls.complete).toBe(0);
  });

  it('still refuses an address that is not a web page', async () => {
    const env = makeTestEnv();
    const { sessionCookie } = await magicLogin(env, 'marie@example.org');
    const res = await web(env, '/web/analyze/audit', {
      cookie: sessionCookie,
      body: { url: 'javascript:alert(1)', blocks: BLOCKS },
    });
    expect(((await res.json()) as { error: string }).error).toBe('invalid_url');
  });
});

describe('the session gate on /web/analyze', () => {
  const STAGES = [
    ['GET', `/web/analyze/check?text=${'0'.repeat(64)}`],
    ['POST', '/web/analyze/audit'],
    ['POST', '/web/analyze/research'],
    ['POST', '/web/analyze/source-check'],
    ['POST', '/web/analyze/finalize'],
  ] as const;

  it('refuses every stage without an Origin, even with a valid session', async () => {
    const env = makeTestEnv();
    const { sessionCookie } = await magicLogin(env, 'marie@example.org');
    for (const [method, path] of STAGES) {
      const res = await web(env, path, { method, cookie: sessionCookie, origin: null, body: method === 'POST' ? {} : undefined });
      expect({ path, status: res.status }).toEqual({ path, status: 403 });
      expect(((await res.json()) as { error: string }).error).toBe('origin_not_allowed');
    }
  });

  it('refuses a foreign page driving the reader’s cookie, and a cross-site request', async () => {
    const env = makeTestEnv();
    const { sessionCookie } = await magicLogin(env, 'marie@example.org');
    const forged = await web(env, '/web/analyze/audit', {
      cookie: sessionCookie,
      origin: 'https://evil.example',
      body: { blocks: BLOCKS },
    });
    expect(forged.status).toBe(403);
    const crossSite = await web(env, STAGES[0][1], { cookie: sessionCookie, origin: null, secFetchSite: 'cross-site' });
    expect(crossSite.status).toBe(403);
    expect(env.llm.calls.complete).toBe(0);
  });

  it('accepts the same-origin check a browser sends without an Origin', async () => {
    const env = makeTestEnv();
    const { sessionCookie } = await magicLogin(env, 'marie@example.org');
    const res = await web(env, STAGES[0][1], { cookie: sessionCookie, origin: null, secFetchSite: 'same-origin' });
    expect(res.status).toBe(200);
  });

  it('asks a reader without a session to sign in, before any model call', async () => {
    const env = makeTestEnv();
    const res = await web(env, '/web/analyze/audit', { body: { blocks: BLOCKS } });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe('invalid_session');
    expect(env.llm.calls.complete).toBe(0);
  });

  it('does not accept a session on the signed routes, nor open the pasted-text key to them', async () => {
    const env = makeTestEnv();
    const { sessionCookie } = await magicLogin(env, 'marie@example.org');
    const unsigned = await web(env, '/v1/analyze/audit', { cookie: sessionCookie, body: { blocks: BLOCKS } });
    expect(unsigned.status).toBe(401);

    const key = await generateSigningKeyPair();
    const { token } = (await (await claimToken(env, sessionCookie, await exportJwk(key))).json()) as { token: string };
    const noAddress = await env.handler(
      await signedRequest(env, { key, token, path: `/v1/analyze/check?text=${await articleTextHash(BLOCKS)}` }),
    );
    expect(((await noAddress.json()) as { error: string }).error).toBe('invalid_url');
  });
});

describe('the pasted-text key', () => {
  it('can never be the canonical address of an article', () => {
    expect(canonicalArticleUrl(PASTED_TEXT_KEY)).toBeNull();
  });
});
