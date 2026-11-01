/**
 * The site's analysis without an account (`/web/anon/*`).
 *
 * The same five stages as a signed-in paste, with no cookie at all. What is
 * pinned here is what bounds it: one analysis per IP in all, 40 a day for
 * every visitor together, the hourly ceiling accounts meet too, a start given
 * back when the provider served nothing, the web app's own origin only, and a
 * visitor's run and an account's run kept apart. Then what a visitor is
 * served: the first finding, and of the others not a word until they have an
 * account. Also the figures that say whether it leads anywhere: an account
 * opened from a visitor's report.
 */
import { describe, expect, it } from 'vitest';

import { HostedAnalysisClient, sha256Hex } from '@squiggle/shared';

import { CHROME_ORIGIN, magicLogin, makeTestEnv, type TestEnv } from './helpers';
import { ANON_ANALYSES_PER_DAY } from '../src/usage/abuse';
import { DAY_MS, USAGE_LOG_RETENTION_MS, VISITOR_USE_RETENTION_MS } from '../src/usage/limits';

const BLOCKS = [
  { id: 'b1', type: 'paragraph' as const, text: 'Le chômage a baissé de 12 % en un an.', charStart: 0 },
  { id: 'b2', type: 'paragraph' as const, text: 'Tout le monde le sait.', charStart: 40 },
];

/** A different text each time, so the shared cache never answers for it. */
const text = (n: number) => [{ ...BLOCKS[0], text: `${BLOCKS[0].text} (${n})` }, BLOCKS[1]];

/** The web app's client, as a visitor's browser runs it: no cookie, the site's Origin, Cloudflare's IP header. */
function visitor(env: TestEnv, ip: string, origin = env.webAppOrigin): HostedAnalysisClient {
  return new HostedAnalysisClient({
    baseUrl: env.webAppOrigin,
    session: 'none',
    fetchImpl: ((url: RequestInfo | URL, init?: RequestInit) => {
      // Workers' RequestInit has no `credentials`; the browser's does, and the client sets it.
      expect((init as { credentials?: string } | undefined)?.credentials).toBe('omit');
      const headers = new Headers(init?.headers);
      headers.set('origin', origin);
      headers.set('cf-connecting-ip', ip);
      return env.handler(new Request(url as string, { ...init, headers }));
    }) as typeof fetch,
  });
}

async function counters(env: TestEnv): Promise<Record<string, number>> {
  const raw = await env.db.collectMetrics({ now: env.clock.now(), weeks: 1, trialAnalyses: 3 });
  return raw.counters;
}

describe('an analysis without an account', () => {
  it('walks the five stages with no cookie, files the report in the shared cache, and touches no account', async () => {
    const env = makeTestEnv();
    const report = await visitor(env, '203.0.113.7').analyze({ title: 'Emploi', blocks: BLOCKS });

    expect(report.schemaVersion).toBe(1);
    const c = await counters(env);
    expect(c.run_started_anon).toBe(1);
    expect(c.finalize_anon).toBe(1);
    expect(c.run_started_session).toBe(0);

    // A reader who signs in afterwards and pastes the same words is served it
    // whole: no model call, no credit.
    const { sessionCookie, user } = await magicLogin(env, 'marie@example.org');
    const callsBefore = { ...env.llm.calls };
    const full = await new HostedAnalysisClient({
      baseUrl: env.webAppOrigin,
      session: 'cookie',
      fetchImpl: ((url: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        headers.set('cookie', sessionCookie);
        headers.set('origin', env.webAppOrigin);
        return env.handler(new Request(url as string, { ...init, headers }));
      }) as typeof fetch,
    }).analyze({ blocks: BLOCKS });
    expect(env.llm.calls).toEqual(callsBefore);
    expect(await env.db.countUsageLog(user.id)).toBe(0);
    expect(full.withheld).toBeUndefined();
    expect(full.research.withdrawn).toHaveLength(1);
  });

  it('allows one per IP in all, the next one asked of an account before any model call', async () => {
    const env = makeTestEnv();
    await visitor(env, '203.0.113.7').analyze({ blocks: text(1) });
    const calls = env.llm.calls.complete;

    await expect(visitor(env, '203.0.113.7').analyze({ blocks: text(2) })).rejects.toMatchObject({
      code: 'anon_used',
      status: 429,
    });
    expect(env.llm.calls.complete).toBe(calls);
    expect((await counters(env)).refused_anon_used).toBe(1);

    // Another address is another visitor; another day is not another analysis.
    await visitor(env, '198.51.100.4').analyze({ blocks: text(3) });
    env.clock.advance(DAY_MS);
    await expect(visitor(env, '203.0.113.7').analyze({ blocks: text(4) })).rejects.toMatchObject({ code: 'anon_used' });

    // A refused attempt does not extend the retention: the fingerprint goes when it lapses, counted from the analysis.
    env.clock.advance(VISITOR_USE_RETENTION_MS - DAY_MS);
    await env.db.purgeExpired(env.clock.now(), USAGE_LOG_RETENTION_MS);
    await visitor(env, '203.0.113.7').analyze({ blocks: text(5) });
  });

  it('refuses two analyses started together from one address', async () => {
    const env = makeTestEnv();
    const results = await Promise.allSettled([
      visitor(env, '203.0.113.7').analyze({ blocks: text(1) }),
      visitor(env, '203.0.113.7').analyze({ blocks: text(2) }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
  });

  it('allows the site 40 a day in all, and a visitor turned away by that keeps their own', async () => {
    const env = makeTestEnv();
    for (let n = 0; n < ANON_ANALYSES_PER_DAY; n += 1) {
      await visitor(env, `10.0.0.${n}`).analyze({ blocks: text(n) });
    }
    const calls = env.llm.calls.complete;

    const late = visitor(env, '192.0.2.1');
    await expect(late.analyze({ blocks: text(100) })).rejects.toMatchObject({ code: 'anon_closed' });
    // Refused by the site's allowance again, not by their own: it was given back.
    await expect(late.analyze({ blocks: text(101) })).rejects.toMatchObject({ code: 'anon_closed' });
    expect(env.llm.calls.complete).toBe(calls);
    expect((await counters(env)).refused_anon_closed).toBe(2);

    env.clock.advance(DAY_MS);
    await late.analyze({ blocks: text(102) });
  });

  it('gives the analysis back when the provider served nothing', async () => {
    const env = makeTestEnv();
    env.llm.failNextComplete = true;
    await expect(visitor(env, '203.0.113.7').analyze({ blocks: text(1) })).rejects.toMatchObject({
      code: 'provider_unavailable',
    });
    await visitor(env, '203.0.113.7').analyze({ blocks: text(1) });
  });

  it('keeps the SHA-256 of the IP, never the IP, and drops it once its retention has passed', async () => {
    const env = makeTestEnv();
    await visitor(env, '203.0.113.7').analyze({ blocks: text(1) });
    const db = env.db as unknown as { rates: Map<string, unknown>; visitorUses: Map<string, unknown> };
    const keys = () => [...db.rates.keys(), ...db.visitorUses.keys()].join('\n');
    expect(keys()).not.toContain('203.0.113.7');
    expect(keys()).toContain(await sha256Hex('203.0.113.7'));

    // Still there the next day: only the site's daily allowance, which names no one, has gone.
    env.clock.advance(DAY_MS + 60 * 60 * 1000);
    await env.db.purgeExpired(env.clock.now(), USAGE_LOG_RETENTION_MS);
    expect(keys()).toContain(await sha256Hex('203.0.113.7'));
    expect(keys()).not.toContain('anon:all');

    env.clock.advance(VISITOR_USE_RETENTION_MS);
    await env.db.purgeExpired(env.clock.now(), USAGE_LOG_RETENTION_MS);
    expect(keys()).toBe('');
  });
});

describe('the report a visitor is served', () => {
  /** The stub's audit with its first finding made one research does not test: both survive to the report. */
  function twoFindings(): TestEnv {
    const env = makeTestEnv();
    const audit = JSON.parse(env.llm.auditJson) as { findings: Array<Record<string, unknown>> };
    const [first, second] = audit.findings;
    const editorial = { ...first, category: 'surinterpretation', checkableClaim: undefined };
    env.llm.auditJson = JSON.stringify({ ...audit, findings: [second, editorial] });
    return env;
  }

  /** Every response body of one visitor's analysis, as the browser receives them. */
  async function bodies(env: TestEnv, ip: string, blocks = BLOCKS): Promise<string> {
    const seen: string[] = [];
    await new HostedAnalysisClient({
      baseUrl: env.webAppOrigin,
      session: 'none',
      fetchImpl: (async (url: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        headers.set('origin', env.webAppOrigin);
        headers.set('cf-connecting-ip', ip);
        const res = await env.handler(new Request(url as string, { ...init, headers }));
        seen.push(await res.clone().text());
        return res;
      }) as typeof fetch,
    }).analyze({ blocks });
    return seen.join('\n');
  }

  it('shows the note and the first finding in reading order, and of the others only their tone', async () => {
    const env = twoFindings();
    const report = await visitor(env, '203.0.113.7').analyze({ blocks: BLOCKS });

    expect(report.score).toBeGreaterThan(0);
    expect(report.findings.map((f) => f.id)).toEqual(['f1']);
    expect(report.findings[0].explanation).toBe("Aucune source n'est citée pour ce chiffre.");
    expect(report.withheld).toEqual([{ category: 'cadrage', severity: 1 }]);
  });

  it('never sends a word of a withheld finding, at any stage, nor from the cache', async () => {
    const env = twoFindings();
    const withheld = ['Tout le monde', 'Appel au sens commun', 'Le texte substitue', 'chiffre non sourcé'];
    const run = await bodies(env, '203.0.113.7');
    // Served again from the shared cache, to another visitor who pasted the same words.
    const cached = await bodies(env, '198.51.100.4');
    for (const words of withheld) {
      expect(run).not.toContain(words);
      expect(cached).not.toContain(words);
    }
    expect(env.llm.calls.complete).toBe(1);
    expect((await counters(env)).report_withheld).toBe(2);
  });

  it('keeps back the sources the text cites, which quote it as the findings do', async () => {
    const env = twoFindings();
    const audit = JSON.parse(env.llm.auditJson) as Record<string, unknown>;
    env.llm.auditJson = JSON.stringify({
      ...audit,
      sourcing: [{ blockId: 'b2', quote: 'Tout le monde le sait', nature: 'temoignage-anonyme' }],
    });
    const run = await bodies(env, '203.0.113.7');
    expect(run).not.toContain('temoignage-anonyme');
    expect(run).not.toContain('"sourcing"');
  });

  it('keeps nothing back when there is nothing past the first finding', async () => {
    const env = makeTestEnv();
    // The stub's first finding is withdrawn by research: one survives.
    const report = await visitor(env, '203.0.113.7').analyze({ blocks: BLOCKS });
    expect(report.findings).toHaveLength(1);
    expect(report.withheld).toEqual([]);
    expect((await counters(env)).report_withheld).toBe(0);
  });
});

describe('the gate on /web/anon', () => {
  it('is the site’s only: an extension’s origin, a foreign page and a missing Origin are refused', async () => {
    const env = makeTestEnv();
    for (const origin of [CHROME_ORIGIN, 'https://evil.example']) {
      await expect(visitor(env, '203.0.113.7', origin).analyze({ blocks: BLOCKS })).rejects.toMatchObject({
        code: 'origin_not_allowed',
      });
    }
    const bare = await env.handler(
      new Request(`${env.webAppOrigin}/web/anon/audit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7' },
        body: JSON.stringify({ blocks: BLOCKS }),
      }),
    );
    expect(bare.status).toBe(403);
    expect(env.llm.calls.complete).toBe(0);
  });

  it('refuses links in the text, as for a signed-in paste', async () => {
    const env = makeTestEnv();
    const res = await env.handler(
      new Request(`${env.webAppOrigin}/web/anon/audit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: env.webAppOrigin, 'cf-connecting-ip': '203.0.113.7' },
        body: JSON.stringify({
          blocks: BLOCKS,
          citedSources: [{ href: 'http://169.254.169.254/latest', domain: '169.254.169.254', text: 'x', blockId: 'b1' }],
        }),
      }),
    );
    expect(((await res.json()) as { error: string }).error).toBe('invalid_payload');
    expect(env.llm.calls.complete).toBe(0);
  });

  it('keeps a visitor’s run and an account’s run apart', async () => {
    const env = makeTestEnv();
    const { sessionCookie } = await magicLogin(env, 'marie@example.org');
    const post = (path: string, body: unknown, cookie?: string) => {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        origin: env.webAppOrigin,
        'cf-connecting-ip': '203.0.113.7',
      };
      if (cookie) headers.cookie = cookie;
      return env.handler(new Request(`${env.webAppOrigin}${path}`, { method: 'POST', headers, body: JSON.stringify(body) }));
    };

    const anon = (await (await post('/web/anon/audit', { blocks: text(1) })).json()) as { runId: string };
    const own = (await (await post('/web/analyze/audit', { blocks: text(2) }, sessionCookie)).json()) as { runId: string };

    const crossed = [
      await post('/web/analyze/finalize', { runId: anon.runId }, sessionCookie),
      await post('/web/anon/finalize', { runId: own.runId }),
    ];
    for (const res of crossed) expect(((await res.json()) as { error: string }).error).toBe('run_not_found');
  });
});

describe('an account opened from a visitor’s report', () => {
  async function signIn(env: TestEnv, email: string, next: string): Promise<void> {
    const headers = { 'content-type': 'application/json', origin: env.webAppOrigin };
    await env.handler(
      new Request(`${env.webAppOrigin}/auth/magic-link`, { method: 'POST', headers, body: JSON.stringify({ email, next }) }),
    );
    const res = await env.handler(
      new Request(`${env.webAppOrigin}/auth/magic-link/verify`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ code: env.email.lastCode() }),
      }),
    );
    expect(((await res.json()) as { next: string }).next).toBe(next);
  }

  it('is counted when the sign-in that began under the report creates the account, and only then', async () => {
    const env = makeTestEnv();
    await signIn(env, 'marie@example.org', '/analyser?apres=essai');
    expect((await counters(env)).signin_after_anon).toBe(1);

    // The same address signing in again is not a new account; a plain sign-in is not one from a report.
    await signIn(env, 'marie@example.org', '/analyser?apres=essai');
    await signIn(env, 'paul@example.org', '/analyser');
    const c = await counters(env);
    expect(c.signin_after_anon).toBe(1);
    expect(c.signin_after_withheld).toBe(0);
    expect(c.signin_completed).toBe(3);
  });

  it('is counted apart when the report had findings kept back', async () => {
    const env = makeTestEnv();
    await signIn(env, 'marie@example.org', '/analyser?apres=flou');
    const c = await counters(env);
    expect(c.signin_after_anon).toBe(1);
    expect(c.signin_after_withheld).toBe(1);
  });
});
