import { describe, expect, it } from 'vitest';

import type { Ctx } from '../src/context';
import { Enrichment } from '../src/deep';
import { askJson, BudgetExceeded } from '../src/llm';
import { POST_TRIES, imageFallbacks, settle, type Check, type Retry } from '../src/posts';
import type { Image } from '../src/sources';

// The routine's database is Node's own SQLite (22.13 and later, the VPS runs 24).
const sqlite = await import('node:sqlite').then(
  () => true,
  () => false,
);
const { Db } = sqlite ? await import('../src/db') : ({} as typeof import('../src/db'));

/** A model that gives these answers in turn, and keeps what it was asked. */
function model(answers: string[]) {
  const asked: string[] = [];
  const fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
    asked.push(body.messages[1].content);
    const content = answers[asked.length - 1] ?? '{}';
    return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.001 } }));
  }) as typeof globalThis.fetch;
  const db = Db.memory();
  // The month's spend was just read: no call to OpenRouter's key page.
  db.setKv('openrouter_month', { checkedAt: new Date().toISOString(), used: 0 });
  const ctx = { db, fetch, runId: 1, secrets: { openrouterKey: 'k' }, log: () => {} } as unknown as Ctx;
  return { ctx, asked };
}

const example = (titre: unknown) => ({ rubrique: 'école', titre, texte: ['avant ', ['passage'], ' après'], lecture: 'Une lecture assez longue pour passer.' });
const ask = { purpose: 'enrichissement', system: 's', user: 'Propose des exemples.' };

describe.skipIf(!sqlite)('an answer that does not match its schema', () => {
  it('takes a plain string title as a title of one segment', () => {
    expect(Enrichment.parse({ exemples: [example('Le café')] }).exemples[0].titre).toEqual(['Le café']);
  });

  it('is asked again with the validation error, and the corrected answer is kept', async () => {
    const { ctx, asked } = model([JSON.stringify({ exemples: [example(42)] }), JSON.stringify({ exemples: [example(['Le café'])] })]);
    const parsed = await askJson(ctx, ask, Enrichment);
    expect(parsed.exemples[0].titre).toEqual(['Le café']);
    expect(asked).toHaveLength(2);
    expect(asked[1]).toContain('Propose des exemples.');
    expect(asked[1]).toContain('exemples.0.titre');
    // Each try is priced and counted against the caps.
    expect(ctx.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM spend WHERE service = 'openrouter'")?.n).toBe(2);
  });

  it('is asked again when there is no JSON to read', async () => {
    const { ctx, asked } = model(['Voici les exemples.', JSON.stringify({ exemples: [] })]);
    expect(await askJson(ctx, ask, Enrichment)).toMatchObject({ exemples: [] });
    expect(asked[1]).toContain('Voici les exemples.');
  });

  it('gives up after three tries, naming the error', async () => {
    const { ctx, asked } = model(Array(5).fill(JSON.stringify({ exemples: [example(42)] })));
    await expect(askJson(ctx, ask, Enrichment)).rejects.toThrow(/réponse invalide après 3 essais.*exemples\.0\.titre/);
    expect(asked).toHaveLength(3);
  });

  it('stops at the run’s cap rather than try again', async () => {
    const { ctx, asked } = model(Array(5).fill(JSON.stringify({ exemples: [example(42)] })));
    ctx.db.run("INSERT INTO spend (at, service, usd, run_id) VALUES (?, 'openrouter', ?, 1)", new Date().toISOString(), 0.749);
    await expect(askJson(ctx, ask, Enrichment)).rejects.toBeInstanceOf(BudgetExceeded);
    expect(asked).toHaveLength(1);
  });
});

describe('a refused post', () => {
  const img = (n: number): Image => ({ url: `https://squiggle.fr/og/${n}.png`, alt: `diapositive ${n}` });

  /** A writer that numbers its versions, and remembers what each try was told. */
  function writer() {
    const told: Array<Retry | null> = [];
    return { told, write: async (retry: Retry | null) => (told.push(retry), `version ${told.length}`) };
  }

  it('is rewritten with the reason, and accepted once it passes', async () => {
    const w = writer();
    const check = async (text: string): Promise<Check> => ({ text, reason: text === 'version 1' ? 'filtre : trop long pour x : 291 sur 280' : null });
    const out = await settle([img(1)], [], w.write, check);
    expect(out).toEqual({ text: 'version 2', images: [img(1)], status: 'propose', reason: 'filtre : trop long pour x : 291 sur 280', attempts: 2 });
    expect(w.told).toEqual([null, { text: 'version 1', reason: 'filtre : trop long pour x : 291 sur 280' }]);
  });

  it('is set aside after its tries, with the last reason', async () => {
    const w = writer();
    const out = await settle([], [], w.write, async (text) => ({ text, reason: `filtre : même accroche qu’une autre publication (${text})` }));
    expect(out).toMatchObject({ status: 'refuse', attempts: POST_TRIES, reason: `filtre : même accroche qu’une autre publication (version ${POST_TRIES})` });
    expect(w.told).toHaveLength(POST_TRIES);
  });

  it('tries another picture, then none, when the review lays the refusal on the picture', async () => {
    const seen: Image[][] = [];
    const check = async (text: string, images: Image[]): Promise<Check> => (seen.push(images), { text, reason: images.length ? 'relecture : l’image montre une autre notion' : null, image: true });
    const out = await settle([img(1)], imageFallbacks('x', 'exemple', [img(1)], { slides: [img(1), img(2)], card: null }), writer().write, check);
    expect(seen).toEqual([[img(1)], [img(2)], []]);
    expect(out).toMatchObject({ status: 'propose', images: [], attempts: 3 });
  });

  it('keeps Instagram’s pictures and a video, whatever the review says', () => {
    expect(imageFallbacks('instagram', 'carrousel', [img(1)], { slides: [img(1)], card: null })).toEqual([]);
    expect(imageFallbacks('instagram', 'carrousel', [img(1)], { slides: [img(1)], card: img(0) })).toEqual([[img(0)]]);
    expect(imageFallbacks('bluesky', 'video', [img(9)], { slides: [img(1)], card: img(0) })).toEqual([]);
  });

  it('is not rewritten when a call fails, and stops the drafting at the cap', async () => {
    const w = writer();
    const out = await settle([], [], w.write, async () => {
      throw new Error('HTTP 502');
    });
    expect(out).toMatchObject({ status: 'refuse', attempts: 1, reason: 'relecture impossible : HTTP 502' });
    const broke = async () => {
      throw new BudgetExceeded('plafond mensuel atteint (5 $)');
    };
    await expect(settle([], [], broke, async (text) => ({ text, reason: null }))).rejects.toBeInstanceOf(BudgetExceeded);
  });
});
