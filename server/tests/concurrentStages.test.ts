/**
 * Research and source checks of one run sent at once, as the extension and the
 * web app now send them: nothing is lost, nothing is paid for twice, the
 * per-run caps hold, and the finished report is the one a call at a time gives.
 */
import { describe, expect, it } from 'vitest';

import { generateSigningKeyPair } from '@squiggle/shared';

import { claim as claimToken, exportJwk, magicLogin, makeTestEnv, signedRequest, type TestEnv } from './helpers';
import { MAX_RESEARCH_CALLS_PER_RUN } from '../src/analyze/stages';

const ARTICLE_URL = 'https://presse.example/societe/enquete';
const COUNT = 6;

const BLOCKS = Array.from({ length: COUNT }, (_, i) => ({
  id: `b${i + 1}`,
  type: 'paragraph' as const,
  text: `Le budget numéro ${i + 1} a augmenté de ${10 + i} % en un an.`,
  charStart: i * 60,
}));

// Two pages for the first claim, one for each of the others.
const CITED = [
  { href: 'https://source.example/1a', domain: 'source.example', text: 'Rapport 1a', blockId: 'b1' },
  { href: 'https://source.example/1b', domain: 'source.example', text: 'Rapport 1b', blockId: 'b1' },
  ...BLOCKS.slice(1).map((b, i) => ({
    href: `https://source.example/${i + 2}`,
    domain: 'source.example',
    text: `Rapport ${i + 2}`,
    blockId: b.id,
  })),
];

function auditWith(findings: number): string {
  return JSON.stringify({
    summary: 'Des chiffres sans source.',
    scores: [
      { domain: 'robustesse_factuelle', score: 20, strengths: [], weaknesses: [] },
      { domain: 'solidite_logique', score: 20, strengths: [], weaknesses: [] },
      { domain: 'cadrage_manipulation', score: 20, strengths: [], weaknesses: [] },
      { domain: 'deontologie', score: 8, strengths: [], weaknesses: [] },
      { domain: 'orthographe_grammaire', score: 4, strengths: [], weaknesses: [] },
    ],
    findings: Array.from({ length: findings }, (_, i) => ({
      id: `f${i + 1}`,
      blockId: BLOCKS[i % COUNT].id,
      quote: BLOCKS[i % COUNT].text,
      category: 'affirmation-non-etayee',
      checkableClaim: BLOCKS[i % COUNT].text,
      severity: 2,
      label: 'Chiffre non étayé',
      explanation: "Aucune source n'est citée pour ce chiffre.",
      confidence: 0.9,
    })),
    claims: [],
  });
}

function pageFetch(): typeof fetch {
  return (async () =>
    new Response('<html><body><p>Le rapport confirme la hausse.</p></body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })) as unknown as typeof fetch;
}

/** A provider whose calls finish in the reverse of the order they were made in. */
function reversedEnv(findings: number): TestEnv {
  const env = makeTestEnv({ fetchImpl: pageFetch() });
  env.llm.auditJson = auditWith(findings);
  const pause = (n: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, 40 - n * 4)));
  const grounded = env.llm.groundedAnswer.bind(env.llm);
  let researched = 0;
  env.llm.groundedAnswer = async (options) => {
    await pause(researched++);
    return grounded(options);
  };
  const complete = env.llm.complete.bind(env.llm);
  let read = 0;
  env.llm.complete = async (options) => {
    if ((options.systemPrompt ?? '').includes('inspection des sources')) await pause(read++);
    return complete(options);
  };
  return env;
}

async function signedIn(env: TestEnv, email: string) {
  const key = await generateSigningKeyPair();
  const { sessionCookie } = await magicLogin(env, email);
  const res = await claimToken(env, sessionCookie, await exportJwk(key));
  return { key, token: ((await res.json()) as { token: string }).token };
}

type Who = Awaited<ReturnType<typeof signedIn>>;

async function call(env: TestEnv, who: Who, path: string, body: unknown): Promise<Record<string, any>> {
  const req = await signedRequest(env, { key: who.key, token: who.token, path, method: 'POST', body: JSON.stringify(body) });
  return (await (await env.handler(req)).json()) as Record<string, any>;
}

async function audit(env: TestEnv, who: Who) {
  return call(env, who, '/v1/analyze/audit', { url: ARTICLE_URL, title: 'Budgets', blocks: BLOCKS, citedSources: CITED });
}

/** The run a call at a time, as the clients sent it before. */
async function oneByOne(env: TestEnv, who: Who) {
  const { runId, researchable } = await audit(env, who);
  const claims: any[] = [];
  for (const findingId of researchable) {
    const res = await call(env, who, '/v1/analyze/research', { runId, findingId });
    if (res.claim) claims.push(res.claim);
  }
  for (const claim of claims) {
    for (const source of CITED.filter((s) => s.blockId === claim.blockId)) {
      await call(env, who, '/v1/analyze/source-check', { runId, claimId: claim.id, sourceUrl: source.href });
    }
  }
  return (await call(env, who, '/v1/analyze/finalize', { runId })).report;
}

/** The run with every research at once, then every claim's pages, a claim's own pages in turn. */
async function allAtOnce(env: TestEnv, who: Who) {
  const { runId, researchable } = await audit(env, who);
  const answers = await Promise.all(
    researchable.map((findingId: string) => call(env, who, '/v1/analyze/research', { runId, findingId })),
  );
  const claims = answers.flatMap((a) => (a.claim ? [a.claim] : []));
  await Promise.all(
    claims.map(async (claim) => {
      for (const source of CITED.filter((s) => s.blockId === claim.blockId)) {
        await call(env, who, '/v1/analyze/source-check', { runId, claimId: claim.id, sourceUrl: source.href });
      }
    }),
  );
  return (await call(env, who, '/v1/analyze/finalize', { runId })).report;
}

describe('research and source checks of one run at once', () => {
  it('lose nothing, and give the report one call at a time gives', async () => {
    const serialEnv = reversedEnv(COUNT);
    const serial = await oneByOne(serialEnv, await signedIn(serialEnv, 'a@example.org'));
    const parallelEnv = reversedEnv(COUNT);
    const parallel = await allAtOnce(parallelEnv, await signedIn(parallelEnv, 'a@example.org'));

    expect(serial.claims).toHaveLength(COUNT);
    expect(serial.research.sourceChecks).toHaveLength(COUNT + 1);
    // Claim ids are drawn at random: name each one after the finding it tests.
    const strip = (r: any) => {
      let text = JSON.stringify({ ...r, meta: { ...r.meta, analyzedAt: '', durationMs: 0 } });
      for (const c of r.claims) text = text.split(c.id).join(`claim-${c.findingId}`);
      return JSON.parse(text);
    };
    expect(strip(parallel)).toEqual(strip(serial));
    expect(parallelEnv.llm.calls).toEqual(serialEnv.llm.calls);
  });

  it('pays once for a finding asked for twice at the same time', async () => {
    const env = reversedEnv(1);
    const who = await signedIn(env, 'a@example.org');
    const { runId } = await audit(env, who);
    const [first, second] = await Promise.all([
      call(env, who, '/v1/analyze/research', { runId, findingId: 'f1' }),
      call(env, who, '/v1/analyze/research', { runId, findingId: 'f1' }),
    ]);
    expect(env.llm.calls.grounded).toBe(1);
    expect([first.claim, second.claim].filter(Boolean)).toHaveLength(1);
  });

  it('holds the per-run research cap however many calls arrive at once', async () => {
    const env = reversedEnv(MAX_RESEARCH_CALLS_PER_RUN + 4);
    const who = await signedIn(env, 'a@example.org');
    const { runId } = await audit(env, who);
    const ids = Array.from({ length: MAX_RESEARCH_CALLS_PER_RUN + 4 }, (_, i) => `f${i + 1}`);
    const answers = await Promise.all(ids.map((findingId) => call(env, who, '/v1/analyze/research', { runId, findingId })));
    expect(env.llm.calls.grounded).toBe(MAX_RESEARCH_CALLS_PER_RUN);
    expect(answers.filter((a) => a.error === 'rate_limited')).toHaveLength(4);
  });
});
