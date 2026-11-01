/**
 * The launch metrics: aggregate, counts only, behind the admin or the read-only metrics token.
 *
 * Driven through the worker like every other suite, so the counters are fed by
 * the real stage handlers and the answer is read the way the owner reads it.
 */
import { describe, expect, it } from 'vitest';

import { articleTextHash, generateSigningKeyPair } from '@squiggle/shared';

import { ownerEmailsOf } from '../src/index';
import { TRIAL_ANALYSES } from '../src/billing/quota';
import { WEEK_MS } from '../src/usage/limits';
import {
  claim,
  exportJwk,
  CHROME_ORIGIN,
  FIREFOX_ORIGIN,
  magicLogin,
  makeTestEnv,
  postStripeEvent,
  signedRequest,
  T0,
  WEB_APP_ORIGIN,
  type TestEnv,
} from './helpers';

const URL_ = 'https://presse.example/politique/emploi-2026';
const BLOCKS = [{ id: 'b1', type: 'paragraph' as const, text: 'Le chômage a baissé de 12 % en un an.', charStart: 0 }];
const ADMIN = { authorization: 'Bearer admin-secret' };
const DAY = 24 * 60 * 60 * 1000;

async function signedIn(env: TestEnv, email: string) {
  const key = await generateSigningKeyPair();
  const { sessionCookie } = await magicLogin(env, email);
  const res = await claim(env, sessionCookie, await exportJwk(key));
  return { key, token: ((await res.json()) as { token: string }).token };
}

async function call(env: TestEnv, who: { key: CryptoKeyPair; token: string }, path: string, body?: unknown) {
  const req = await signedRequest(env, {
    key: who.key,
    token: who.token,
    path,
    method: body === undefined ? 'GET' : 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await env.handler(req);
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

const check = async (env: TestEnv, who: { key: CryptoKeyPair; token: string }) =>
  call(env, who, `/v1/analyze/check?url=${encodeURIComponent(URL_)}&text=${await articleTextHash(BLOCKS)}`);

const audit = (env: TestEnv, who: { key: CryptoKeyPair; token: string }) =>
  call(env, who, '/v1/analyze/audit', { url: URL_, title: 'T', blocks: BLOCKS, citedSources: [] });

/** What the web app sends: no cookie, only the counter's name. */
function countRequest(env: TestEnv, name: unknown, headers: Record<string, string> = { origin: WEB_APP_ORIGIN }) {
  return env.handler(
    new Request(`${env.webAppOrigin}/web/count`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ name }),
    }),
  );
}

async function metrics(env: TestEnv, query = '') {
  const res = await env.handler(new Request(`${env.webAppOrigin}/admin/metrics${query}`, { headers: ADMIN }));
  return { status: res.status, body: (await res.json()) as { metrics: Record<string, any> } };
}

describe('GET /admin/metrics', () => {
  it('is refused without the admin token', async () => {
    const env = makeTestEnv({ adminToken: 'admin-secret' });
    for (const headers of [{} as Record<string, string>, { authorization: 'Bearer wrong' }, { authorization: 'Bearer admin-secre' }]) {
      const res = await env.handler(new Request(`${env.webAppOrigin}/admin/metrics`, { headers }));
      expect(res.status).toBe(401);
    }
    // No admin token configured at all: nothing is ever accepted.
    const open = makeTestEnv();
    const res = await open.handler(new Request(`${open.webAppOrigin}/admin/metrics`, { headers: ADMIN }));
    expect(res.status).toBe(401);
  });

  it('accepts the read-only metrics token, which opens nothing else', async () => {
    const env = makeTestEnv({ adminToken: 'admin-secret', metricsToken: 'metrics-secret' });
    let migrations = 0;
    env.services.runMigrations = async () => {
      migrations++;
      return [];
    };
    const reader = { authorization: 'Bearer metrics-secret' };

    const read = await env.handler(new Request(`${env.webAppOrigin}/admin/metrics`, { headers: reader }));
    expect(read.status).toBe(200);
    // The admin token still reads the figures beside it.
    expect((await metrics(env)).status).toBe(200);

    for (const headers of [{ authorization: 'Bearer metrics-secre' }, { authorization: 'Bearer metrics-secretx' }]) {
      const res = await env.handler(new Request(`${env.webAppOrigin}/admin/metrics`, { headers }));
      expect(res.status).toBe(401);
    }

    const migrate = await env.handler(
      new Request(`${env.webAppOrigin}/admin/migrate`, { method: 'POST', headers: reader }),
    );
    expect(migrate.status).toBe(401);
    expect(migrations).toBe(0);
    // The owner's page answers to a session, never to a bearer token.
    const tableau = await env.handler(new Request(`${env.webAppOrigin}/web/tableau`, { headers: reader }));
    expect(tableau.status).toBe(404);

    // No metrics token configured: an empty bearer is refused, never matched.
    const unset = makeTestEnv({ adminToken: 'admin-secret' });
    for (const headers of [{ authorization: 'Bearer ' }, { authorization: 'Bearer' }, reader]) {
      const res = await unset.handler(new Request(`${unset.webAppOrigin}/admin/metrics`, { headers }));
      expect(res.status).toBe(401);
    }
  });

  it('refuses a malformed window or cost', async () => {
    const env = makeTestEnv({ adminToken: 'admin-secret' });
    for (const query of ['?weeks=0', '?weeks=53', '?weeks=1.5', '?weeks=abc', '?costUsd=-1', '?costUsd=abc']) {
      expect((await metrics(env, query)).status).toBe(400);
    }
  });

  it('is all zeros and null ratios on an empty server', async () => {
    const env = makeTestEnv({ adminToken: 'admin-secret' });
    const { status, body } = await metrics(env, '?weeks=2');
    expect(status).toBe(200);
    expect(body.metrics.accounts).toEqual({ total: 0, perWeek: [0, 0] });
    expect(body.metrics.cache).toEqual({ checks: 0, hits: 0, hitRate: null });
    expect(body.metrics.analyses).toEqual({ finalized: 0, costPerAnalysisUsd: null });
  });

  it('counts accounts, activation, cache hits, stage failures and cost from real traffic', async () => {
    const env = makeTestEnv({ adminToken: 'admin-secret' });
    const marie = await signedIn(env, 'marie@example.org');
    await signedIn(env, 'paul@example.org');

    expect((await check(env, marie)).json.hit).toBe(false);
    const { json } = await audit(env, marie);
    expect((await call(env, marie, '/v1/analyze/finalize', { runId: json.runId })).status).toBe(200);
    // Paul's page yields the same text: the cache answers.
    const paul = await signedIn(env, 'jean@example.org');
    expect((await check(env, paul)).json.hit).toBe(true);

    // A provider failure on the next audit, from a third reader.
    env.llm.failNextComplete = true;
    expect((await audit(env, paul)).status).toBeGreaterThanOrEqual(400);

    const { body } = await metrics(env, '?weeks=1&costUsd=0.5');
    const m = body.metrics;
    expect(m.accounts).toEqual({ total: 3, perWeek: [3] });
    expect(m.activation).toEqual({ withFinalize: 1, share: 0.333 });
    expect(m.cache).toEqual({ checks: 2, hits: 1, hitRate: 0.5 });
    expect(m.stages.audit).toEqual({ calls: 2, failed: 1, failureRate: 0.5, truncated: 0 });
    expect(m.stages.research).toEqual({ calls: 0, failed: 0, failureRate: null });
    expect(m.analyses).toEqual({ finalized: 1, costPerAnalysisUsd: 0.5 });
  });

  it('answers with counts only: no account, address or article', async () => {
    const env = makeTestEnv({ adminToken: 'admin-secret' });
    const marie = await signedIn(env, 'marie@example.org');
    await check(env, marie);
    const res = await env.handler(new Request(`${env.webAppOrigin}/admin/metrics`, { headers: ADMIN }));
    const raw = await res.text();
    const user = await env.db.getUserByEmail('marie@example.org');
    for (const secret of ['marie', 'example.org', 'presse.example', user!.id]) expect(raw).not.toContain(secret);
  });

  it('follows trial completion through to payment and counts Stripe subscription events', async () => {
    const env = makeTestEnv({ adminToken: 'admin-secret' });
    const finish = async (email: string, analyses: number) => {
      const user = await env.db.createUser({ email }, env.clock.now());
      for (let i = 0; i < analyses; i++) await env.db.recordAnalysis({ userId: user.id, now: env.clock.now() });
      return user;
    };
    await finish('a@example.org', 0);
    await finish('b@example.org', TRIAL_ANALYSES - 1);
    await finish('c@example.org', TRIAL_ANALYSES);
    const payer = await finish('d@example.org', TRIAL_ANALYSES);
    await env.db.setStripeIds(payer.id, { customerId: 'cus_d', subId: 'sub_d' }, env.clock.now());
    await env.db.setPlan(payer.id, 'active', { start: env.clock.now(), end: env.clock.now() + WEEK_MS }, env.clock.now());

    const event = (id: string, type: string) => ({
      id,
      type,
      data: { object: { id: 'sub_d', customer: 'cus_d', metadata: { user_id: payer.id }, status: 'active' } },
    });
    await postStripeEvent(env, event('evt_1', 'checkout.session.completed'));
    await postStripeEvent(env, event('evt_2', 'customer.subscription.deleted'));
    // A redelivery is not a second cancellation.
    await postStripeEvent(env, event('evt_2', 'customer.subscription.deleted'));

    const { body } = await metrics(env);
    const m = body.metrics;
    expect(m.accounts.total).toBe(4);
    expect(m.activation.withFinalize).toBe(3);
    expect(m.trial).toEqual({ completed: 2, completionShare: 0.5, convertedToPaid: 1, conversion: 0.5 });
    expect(m.subscriptions.started).toBe(1);
    expect(m.subscriptions.cancelled).toBe(1);
    // The webhook has downgraded the payer, so nobody is active: 1 of 1 left.
    expect(m.subscriptions.active).toBe(0);
    expect(m.subscriptions.cancellationRate).toBe(1);
  });

  it('buckets accounts by week and forgets events older than the window', async () => {
    const env = makeTestEnv({ adminToken: 'admin-secret' });
    await env.db.createUser({ email: 'old@example.org' }, T0 - 5 * WEEK_MS);
    await env.db.createUser({ email: 'last-week@example.org' }, T0 - 1.5 * WEEK_MS);
    await env.db.createUser({ email: 'now@example.org' }, T0);
    await env.db.bumpMetric('check', T0 - 10 * WEEK_MS);
    await env.db.bumpMetric('check', T0);

    const { body } = await metrics(env, '?weeks=3');
    expect(body.metrics.accounts).toEqual({ total: 3, perWeek: [0, 1, 1] });
    expect(body.metrics.cache.checks).toBe(1);
  });
});

/** What the owner's page sends: same origin, with the session cookie if there is one. */
async function tableau(env: TestEnv, cookie?: string, path = '/web/tableau', method = 'GET') {
  const headers: Record<string, string> = { 'sec-fetch-site': 'same-origin' };
  if (cookie) headers.cookie = cookie;
  const res = await env.handler(new Request(`${env.webAppOrigin}${path}`, { method, headers }));
  return { status: res.status, text: await res.text() };
}

describe('GET /web/tableau', () => {
  const OWNERS = ownerEmailsOf(' Moi@Example.org , associe@example.org,');

  it('reads the owner list without case or blanks, and an unset or empty one admits no one', () => {
    expect(OWNERS).toEqual(['moi@example.org', 'associe@example.org']);
    expect(ownerEmailsOf(undefined)).toEqual([]);
    expect(ownerEmailsOf(' , ')).toEqual([]);
  });

  it('answers anyone but the owner exactly as it answers an address that does not exist', async () => {
    const env = makeTestEnv({ ownerEmails: OWNERS });
    const unknown = await tableau(env, undefined, '/web/inconnu');
    expect(unknown.status).toBe(404);

    const { sessionCookie: other } = await magicLogin(env, 'paul@example.org');
    expect(await tableau(env)).toEqual(unknown);
    expect(await tableau(env, other)).toEqual(unknown);
    expect(await tableau(env, 'squiggle_session=forged')).toEqual(unknown);

    // No owner configured: the owner's own session is refused the same way.
    for (const ownerEmails of [[], undefined]) {
      const closed = makeTestEnv({ ownerEmails });
      const { sessionCookie } = await magicLogin(closed, 'moi@example.org');
      expect(await tableau(closed, sessionCookie)).toEqual(unknown);
    }
  });

  it('gives the owner the same metrics the admin token reads', async () => {
    const env = makeTestEnv({ adminToken: 'admin-secret', ownerEmails: OWNERS });
    const { sessionCookie } = await magicLogin(env, 'moi@example.org');

    const res = await tableau(env, sessionCookie, '/web/tableau?weeks=1&costUsd=2');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.text)).toEqual((await metrics(env, '?weeks=1&costUsd=2')).body);
    expect((await tableau(env, sessionCookie, '/web/tableau?weeks=53')).status).toBe(400);
    // Only the read exists.
    expect((await tableau(env, sessionCookie, '/web/tableau', 'POST')).status).toBe(404);
  });
});

describe('POST /web/count', () => {
  it('counts a name from the audience list and nothing else', async () => {
    const env = makeTestEnv({ adminToken: 'admin-secret' });
    expect((await countRequest(env, 'ref_clemi')).status).toBe(204);
    expect((await countRequest(env, 'ref_clemi')).status).toBe(204);
    expect((await countRequest(env, 'ref_bluesky')).status).toBe(204);
    expect((await countRequest(env, 'ref_lel')).status).toBe(204);
    expect((await countRequest(env, 'ref_createur12')).status).toBe(204);
    expect((await countRequest(env, 'click_install_firefox')).status).toBe(204);
    expect((await countRequest(env, 'paste_transcript')).status).toBe(204);

    // A name the server keeps for itself cannot be sent: a browser could
    // otherwise declare checkouts, sign-ins or analyses that never happened.
    // Nor a page view or a referrer kind: visits are read in Cloudflare Web Analytics.
    for (const name of ['checkout_paid', 'signin_completed', 'finalize_session', 'check', 'view_accueil', 'entry_search', 42, null]) {
      expect((await countRequest(env, name)).status).toBe(400);
    }
    // Only our own pages send one.
    expect((await countRequest(env, 'click_example', { origin: 'https://ailleurs.example' })).status).toBe(403);
    expect((await countRequest(env, 'click_example', {})).status).toBe(403);

    const m = (await metrics(env, '?weeks=1')).body.metrics;
    expect(Object.keys(m.audience)).toEqual(['campaigns', 'clicks', 'pastes', 'blog', 'flags']);
    expect(m.audience.campaigns).toMatchObject({ clemi: 2, linuxfr: 0, bluesky: 1, linkedin: 0, lel: 1, presse: 0, createur12: 1 });
    expect(m.audience.clicks).toMatchObject({ install_firefox: 1, install_chrome: 0 });
    expect(m.audience.pastes).toEqual({ transcript: 1 });
    expect(m.funnel.checkout).toEqual({ started: 0, paid: 0, free: 0 });
    expect(m.headline.newAccounts).toEqual({ count: 0, campaigns: m.audience.campaigns });
  });

  it('counts a reported finding by category and by reason, from the site and from either extension', async () => {
    const env = makeTestEnv({ adminToken: 'admin-secret' });
    for (const origin of [WEB_APP_ORIGIN, CHROME_ORIGIN, FIREFOX_ORIGIN]) {
      expect((await countRequest(env, 'flag_finding_sophisme', { origin })).status).toBe(204);
    }
    expect((await countRequest(env, 'flag_reason_misread')).status).toBe(204);
    // A category or a reason off the list is refused like any other name.
    for (const name of ['flag_finding_autre', 'flag_reason_texte libre', 'flag_finding_']) {
      expect((await countRequest(env, name)).status).toBe(400);
    }
    // The Firefox shape reaches the counter, never a cookie-carrying endpoint.
    expect((await countRequest(env, 'flag_reason_other', { origin: 'moz-extension://evil.example' })).status).toBe(403);

    const { flags } = (await metrics(env, '?weeks=1')).body.metrics.audience;
    expect(flags.categories).toMatchObject({ sophisme: 3, affirmation_non_etayee: 0, point_fort: 0 });
    expect(flags.reasons).toMatchObject({ misread: 1, sourced: 0, other: 0 });
  });

  it('counts a source reported as wrongly classed by the nature shown, and refuses any other name', async () => {
    const env = makeTestEnv({ adminToken: 'admin-secret' });
    expect((await countRequest(env, 'flag_source_media')).status).toBe(204);
    for (const name of ['flag_source_note', 'flag_source_le_monde', 'flag_source_']) {
      expect((await countRequest(env, name)).status).toBe(400);
    }
    const { flags } = (await metrics(env, '?weeks=1')).body.metrics.audience;
    expect(flags.sources).toMatchObject({ media: 1, aucune: 0 });
  });

  it('keeps the name and the day, never who sent it', async () => {
    const env = makeTestEnv({ adminToken: 'admin-secret' });
    const { sessionCookie } = await magicLogin(env, 'marie@example.org');
    const res = await countRequest(env, 'click_subscribe', {
      origin: WEB_APP_ORIGIN,
      cookie: sessionCookie,
      'cf-connecting-ip': '203.0.113.7',
      referer: 'https://www.qwant.com/?q=squiggle',
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('set-cookie')).toBeNull();
    const raw = JSON.stringify([...(env.db as unknown as { metrics: Map<string, number> }).metrics]);
    expect(raw).toContain('click_subscribe');
    for (const secret of ['203.0.113', 'qwant', 'marie']) expect(raw).not.toContain(secret);
  });
});

describe('the counters the server bumps itself', () => {
  it('follows sign-in, analyses by surface and refusals by reason', async () => {
    const env = makeTestEnv({ adminToken: 'admin-secret' });
    const marie = await signedIn(env, 'marie@example.org');
    for (let i = 0; i < TRIAL_ANALYSES; i++) {
      const { json } = await audit(env, marie);
      expect((await call(env, marie, '/v1/analyze/finalize', { runId: json.runId })).status).toBe(200);
    }
    // The trial is spent: the next start is refused, and counted as such.
    expect((await audit(env, marie)).json.error).toBe('trial_exhausted');
    // A page of fifty articles is refused before anything else is weighed.
    const text = 'Le chômage a baissé de 12 % en un an. '.repeat(100);
    const page = Array.from({ length: 50 }, (_, i) => ({ id: `b${i}`, type: 'paragraph' as const, text, charStart: i * (text.length + 2) }));
    expect((await call(env, marie, '/v1/analyze/audit', { url: URL_, title: 'T', blocks: page, citedSources: [] })).status).toBe(413);

    const m = (await metrics(env, '?weeks=1')).body.metrics;
    expect(m.funnel.signin).toEqual({ link_sent: 1, google: 0, completed: 1, after_anon: 0, after_withheld: 0 });
    // BLOCKS is one sentence: a short message.
    expect(m.funnel.runsStarted).toEqual({ install: TRIAL_ANALYSES, session: 0, anon: 0, email: 0, video: 0, message: TRIAL_ANALYSES });
    expect(m.funnel.finalized).toEqual({ install: TRIAL_ANALYSES, session: 0, anon: 0, email: 0 });
    expect(m.funnel.refused).toMatchObject({ trial_exhausted: 1, article_too_long: 1, quota_exhausted: 0 });
    expect(m.headline.successRate).toEqual({ started: TRIAL_ANALYSES, finalized: TRIAL_ANALYSES, share: 1 });
    expect(m.headline.activeAccounts).toBe(1);
  });

  it('counts a run on a video transcript, read as one from its address alone, and one on a short message, from its length', async () => {
    const env = makeTestEnv({ adminToken: 'admin-secret' });
    const marie = await signedIn(env, 'marie@example.org');
    const video = 'https://www.youtube.com/watch?v=k1KPNO-1vJc';
    const article = [{ ...BLOCKS[0], text: 'Le chômage a baissé de 12 % en un an. '.repeat(40) }];
    for (const [url, blocks] of [[video, BLOCKS], [URL_, article], [URL_, BLOCKS]] as const) {
      const run = await call(env, marie, '/v1/analyze/audit', { url, title: 'T', blocks, citedSources: [] });
      expect(run.status).toBe(200);
      expect((await call(env, marie, '/v1/analyze/finalize', { runId: run.json.runId })).status).toBe(200);
    }

    // The video and the article are critiqued after their audit; the short message is not.
    expect(env.llm.calls.critique).toBe(2);
    const prompts = env.llm.completeOptions
      .filter((o) => !o.systemPrompt?.includes('relecteur critique'))
      .map((o) => [o.systemPrompt, ...o.messages.map((m) => m.content)].join('\n'));
    // However short, a video's transcript stays one.
    expect(prompts[0]).toContain('TRANSCRIPTION D\'UNE VIDÉO');
    expect(prompts[0]).not.toContain('MESSAGE COURT');
    expect(prompts[1]).not.toContain('TRANSCRIPTION');
    expect(prompts[1]).not.toContain('MESSAGE COURT');
    expect(prompts[2]).toContain('MESSAGE COURT');

    const m = (await metrics(env, '?weeks=1')).body.metrics;
    expect(m.funnel.runsStarted).toEqual({ install: 3, session: 0, anon: 0, email: 0, video: 1, message: 1 });
  });

  it('measures activation over the accounts that have had their whole first week', async () => {
    const env = makeTestEnv({ adminToken: 'admin-secret' });
    const quick = await env.db.createUser({ email: 'quick@example.org' }, T0 - 10 * DAY);
    await env.db.recordAnalysis({ userId: quick.id, now: T0 - 8 * DAY });
    const late = await env.db.createUser({ email: 'late@example.org' }, T0 - 12 * DAY);
    await env.db.recordAnalysis({ userId: late.id, now: T0 - 2 * DAY });
    await env.db.createUser({ email: 'never@example.org' }, T0 - 9 * DAY);
    // Too recent to judge, and too old for the cohort of a one-week window.
    await env.db.createUser({ email: 'new@example.org' }, T0 - DAY);
    await env.db.createUser({ email: 'old@example.org' }, T0 - 20 * DAY);

    const m = (await metrics(env, '?weeks=1')).body.metrics;
    expect(m.headline.activationWithinWeek).toEqual({ cohort: 3, activated: 1, share: 0.333 });
  });
});

describe('paid and free subscriptions', () => {
  it('counts a 100 % promotion code apart from the subscribers who pay, until an invoice costs something', async () => {
    const env = makeTestEnv({ adminToken: 'admin-secret' });
    const subscribe = async (email: string, amount: number, n: number) => {
      const user = await env.db.createUser({ email }, env.clock.now());
      for (let i = 0; i < TRIAL_ANALYSES; i++) await env.db.recordAnalysis({ userId: user.id, now: env.clock.now() });
      await postStripeEvent(env, {
        id: `evt_checkout_${n}`,
        type: 'checkout.session.completed',
        data: {
          object: { customer: `cus_${n}`, subscription: `sub_${n}`, amount_total: amount, metadata: { user_id: user.id } },
        },
      });
      return user;
    };
    await subscribe('payer@example.org', 499, 1);
    const teacher = await subscribe('teacher@example.org', 0, 2);

    let m = (await metrics(env)).body.metrics;
    expect(m.trial).toMatchObject({ completed: 2, convertedToPaid: 1, conversion: 0.5 });
    expect(m.subscriptions).toMatchObject({ active: 1, activeFree: 1, started: 2, startedFree: 1 });
    expect(m.funnel.checkout).toEqual({ started: 0, paid: 1, free: 1 });
    expect(m.headline.subscribers).toEqual({ paying: 1, free: 1, cancelled: 0 });

    // The code covered the first month only: the renewal is paid.
    await postStripeEvent(env, {
      id: 'evt_invoice_2',
      type: 'invoice.paid',
      data: { object: { customer: 'cus_2', subscription: 'sub_2', amount_paid: 499 } },
    });
    expect((await env.db.getUserById(teacher.id))!.subscriptionFree).toBe(false);
    m = (await metrics(env)).body.metrics;
    expect(m.trial.convertedToPaid).toBe(2);
    expect(m.headline.subscribers).toEqual({ paying: 2, free: 0, cancelled: 0 });
    // An invoice writes no plan.
    expect((await env.db.getUserById(teacher.id))!.plan).toBe('active');
  });

  it('activates a reader even when the free flag cannot be written (deploy before its migration)', async () => {
    const env = makeTestEnv({ adminToken: 'admin-secret' });
    const user = await env.db.createUser({ email: 'early@example.org' }, env.clock.now());
    env.db.setSubscriptionFree = async () => {
      throw new Error('column "subscription_free" does not exist');
    };
    const res = await postStripeEvent(env, {
      id: 'evt_early',
      type: 'checkout.session.completed',
      data: { object: { customer: 'cus_e', subscription: 'sub_e', amount_total: 499, metadata: { user_id: user.id } } },
    });
    expect(res.status).toBe(200);
    expect((await env.db.getUserById(user.id))!.plan).toBe('active');
  });
});
