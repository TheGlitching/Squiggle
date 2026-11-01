import { describe, expect, it } from 'vitest';

import { CALENDAR } from '../src/calendar';
import type { Ctx } from '../src/context';
import { MASTODON_TAGS, pickTags, weekTags } from '../src/hashtags';
import { chooseImages, linkFor, type Tweaks } from '../src/posts';
import type { Image } from '../src/sources';

// The routine's database is Node's own SQLite (22.13 and later, the VPS runs 24).
const sqlite = await import('node:sqlite').then(
  () => true,
  () => false,
);
const { Db } = sqlite ? await import('../src/db') : ({} as typeof import('../src/db'));

const facebookFond = CALENDAR.find((s) => s.network === 'facebook' && s.pillar === 'fond')!;
const at = (d: string) => new Date(`${d}T16:30:00.000Z`);
const linked = (d: string) => ({ network: 'facebook' as const, day: d, text: 'Lire la suite : https://squiggle.fr/blog/x?ref=facebook' });

describe.skipIf(!sqlite)('a post’s link', () => {
  it('gives Facebook’s piece of substance a link twice a month, then none', () => {
    const ctx = { db: Db.memory() };
    const p = { slot: facebookFond, pillar: 'fond' as const, at: at('2026-11-19') };
    expect(linkFor(ctx, p, [])).toBe('required');
    expect(linkFor(ctx, p, [linked('2026-11-05')])).toBe('required');
    expect(linkFor(ctx, p, [linked('2026-11-05'), linked('2026-11-12')])).toBe('none');
    // Last month's links and native posts do not count.
    expect(linkFor(ctx, p, [linked('2026-10-29'), linked('2026-10-22'), { network: 'facebook', day: '2026-11-05', text: 'Sans lien.' }])).toBe('required');
    // A failed link post this month reads as Meta's cap: native until the next month.
    ctx.db.setKv('facebook_sans_lien', '2026-11');
    expect(linkFor(ctx, p, [])).toBe('none');
    expect(linkFor(ctx, { ...p, at: at('2026-12-03') }, [])).toBe('required');
  });

  it('keeps other networks’ rules whatever Facebook has used', () => {
    const ctx = { db: Db.memory() };
    const full = [linked('2026-11-05'), linked('2026-11-12')];
    for (const slot of CALENDAR.filter((s) => s.network !== 'facebook')) {
      const pillar = slot.pillar === 'produit-ou-classe' ? 'produit' : slot.pillar;
      const expected = slot.network === 'x' ? 'none' : slot.network === 'instagram' ? 'domain' : slot.network === 'threads' && pillar !== 'fond' ? 'none' : 'required';
      expect(linkFor(ctx, { slot, pillar, at: at('2026-11-19') }, full)).toBe(expected);
    }
  });
});

describe('a post’s pictures', () => {
  const img = (n: number): Image => ({ url: `https://squiggle.fr/og/${n}.png`, alt: `diapositive ${n}` });
  const imgs = { slides: [img(1), img(2), img(3), img(4)], card: img(0) };
  const none: Tweaks = { minutes: 0, question: null, image: null };

  it('shows the carousel on Facebook and one picture on Threads when there is no link', () => {
    expect(chooseImages('facebook', 'long', imgs, none, 'none')).toEqual(imgs.slides);
    expect(chooseImages('threads', 'question', imgs, none, 'none')).toEqual([img(2)]);
    expect(chooseImages('facebook', 'page', { slides: [], card: img(0) }, none, 'none')).toEqual([img(0)]);
  });

  it('lets the link draw its card otherwise, unless a test says so', () => {
    expect(chooseImages('facebook', 'page', imgs, none, 'required')).toEqual([]);
    expect(chooseImages('threads', 'page', imgs, { ...none, image: 'avec' }, 'required')).toEqual([img(2)]);
    expect(chooseImages('threads', 'question', imgs, { ...none, image: 'sans' }, 'none')).toEqual([]);
  });

  it('turns one picture into the carousel, or the carousel into one picture, under a format test', () => {
    expect(chooseImages('bluesky', 'exemple', imgs, { ...none, format: 'carrousel' }, 'required')).toEqual(imgs.slides);
    expect(chooseImages('facebook', 'long', imgs, { ...none, format: 'image' }, 'none')).toEqual([img(1)]);
    expect(chooseImages('facebook', 'page', imgs, { ...none, format: 'carrousel' }, 'required')).toEqual([]);
    expect(chooseImages('instagram', 'carrousel', imgs, { ...none, format: 'image' }, 'domain')).toEqual(imgs.slides);
  });
});

describe.skipIf(!sqlite)('a running test, on the post it concerns', () => {
  it('sets a link test on its network and a content test on every network, one week each way', async () => {
    const { tweaks } = await import('../src/posts');
    const db = Db.memory();
    db.run("INSERT INTO tests (network, kind, value, hypothesis, start, end, status) VALUES ('bluesky', 'lien', 'sans', 'h', '2026-11-30', '2027-01-24', 'en_cours')");
    db.run("INSERT INTO tests (network, kind, value, hypothesis, start, end, status) VALUES ('tous', 'format', 'carrousel', 'h', '2026-11-30', '2027-01-24', 'en_cours')");
    expect(tweaks({ db }, 'bluesky', new Date('2026-12-02T11:15:00Z'))).toMatchObject({ link: 'sans', format: 'carrousel' });
    expect(tweaks({ db }, 'threads', new Date('2026-12-09T17:30:00Z'))).toMatchObject({ link: null, format: 'image' });
    expect(tweaks({ db }, 'instagram', new Date('2026-12-02T18:00:00Z'))).toMatchObject({ link: null, format: null });
    const p = { slot: CALENDAR.find((s) => s.network === 'bluesky')!, pillar: 'notion' as const, at: at('2026-12-02') };
    expect(linkFor({ db }, p, [], { link: 'sans' })).toBe('none');
    expect(linkFor({ db }, p, [])).toBe('required');
  });
});

describe('Mastodon’s hashtags', () => {
  it('takes the three most used of the closed list, never one nobody used', () => {
    expect(pickTags({ Désinformation: 87, Éducation: 1220, FactChecking: 38, Enseignement: 27, EspritCritique: 21 })).toEqual(['Éducation', 'Désinformation', 'FactChecking']);
    expect(pickTags({ Désinformation: 3, EspritCritique: 3 })).toEqual(['Désinformation', 'EspritCritique']);
  });

  it.skipIf(!sqlite)('measures once a week on the public API, and keeps last week’s choice when it fails', async () => {
    const calls: string[] = [];
    let fail = false;
    const fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (fail) return new Response('busy', { status: 503 });
      const accounts = url.endsWith('/Education') ? '50' : url.endsWith('/EspritCritique') ? '9' : url.endsWith('/Enseignement') ? '4' : '0';
      return new Response(JSON.stringify({ history: [{ day: '1793491200', uses: accounts, accounts }, { day: '1793404800', uses: '1', accounts: '1' }] }), { status: 200 });
    }) as typeof globalThis.fetch;
    const ctx = { db: Db.memory(), fetch, dry: false, now: new Date('2026-11-02T04:00:00.000Z'), log: () => {} } as unknown as Ctx;
    expect(await weekTags(ctx)).toEqual(['Éducation', 'EspritCritique', 'Enseignement']);
    expect(calls).toContain('https://piaille.fr/api/v1/tags/Desinformation');
    expect(calls).toHaveLength(MASTODON_TAGS.length * 3);
    // The same week reads the stored choice.
    expect(await weekTags(ctx)).toEqual(['Éducation', 'EspritCritique', 'Enseignement']);
    expect(calls).toHaveLength(MASTODON_TAGS.length * 3);
    fail = true;
    expect(await weekTags({ ...ctx, now: new Date('2026-11-09T04:00:00.000Z') } as Ctx)).toEqual(['Éducation', 'EspritCritique', 'Enseignement']);
  });
});
