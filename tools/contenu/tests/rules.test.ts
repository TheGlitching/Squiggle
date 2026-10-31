import { describe, expect, it } from 'vitest';

import { CALENDAR, REVIEW_DAYS, parisTime, resolvePillar, rotate, slotAt, weeksToFill } from '../src/calendar';
import type { GscData, GscRow } from '../src/collect/gsc';
import { Db } from '../src/db';
import { impressionsWithoutClicks, unansweredQueries } from '../src/deep';
import { firstWord } from '../src/inbox';
import { addLesson, activeLessons, avoided } from '../src/memory';
import { acceptTest, judge, networkShares, unknownNumbers, type Facts, type Note } from '../src/strategy';

describe('the calendar', () => {
  it('reads Paris time on both sides of the clock change', () => {
    expect(parisTime('2026-10-23', '12:15').toISOString()).toBe('2026-10-23T10:15:00.000Z');
    expect(parisTime('2026-11-30', '12:15').toISOString()).toBe('2026-11-30T11:15:00.000Z');
    expect(parisTime('2026-11-30', '00:30').toISOString()).toBe('2026-11-29T23:30:00.000Z');
  });

  it('starts with the general public: about half notions, a quarter or more substance, one teachers’ slot', () => {
    const notion = CALENDAR.filter((s) => s.pillar === 'notion').length;
    const fond = CALENDAR.filter((s) => s.pillar === 'fond').length;
    expect(notion / CALENDAR.length).toBeGreaterThanOrEqual(0.5);
    expect(fond / CALENDAR.length).toBeGreaterThanOrEqual(0.25);
    const monday = '2026-11-30';
    const pillars = CALENDAR.map((s) => resolvePillar(s, monday));
    expect(pillars.filter((p) => p === 'classe')).toHaveLength(1);
    expect(pillars.filter((p) => p === 'produit')).toHaveLength(1);
  });

  it('only fills weeks at least three weeks out, up to four', () => {
    const now = new Date('2026-11-02T04:00:00Z');
    const weeks = weeksToFill(now, '2026-11-02');
    expect(weeks).toEqual(['2026-11-23', '2026-11-30']);
    for (const w of weeks) for (const s of CALENDAR) expect(slotAt(w, s).getTime()).toBeGreaterThanOrEqual(now.getTime() + REVIEW_DAYS * 86_400_000);
  });

  it('puts a never-used source first, then the least recently used, then the most searched', () => {
    const usage = [
      { sourceId: 'a', network: 'x' as const, slotAt: '2026-10-01' },
      { sourceId: 'b', network: 'x' as const, slotAt: '2026-09-01' },
    ];
    expect(rotate(['a', 'b', 'c', 'd'], usage, (id) => (id === 'd' ? 50 : 0), new Set(['c']))).toEqual(['d', 'b', 'a']);
  });
});

describe('the decision rules', () => {
  it('gives no verdict under twenty visits, a winner from thirty per cent more per post', () => {
    expect(judge({ visits: 19, posts: 8 }, { visits: 5, posts: 8 })).toBe('pas de signal');
    expect(judge({ visits: 26, posts: 8 }, { visits: 20, posts: 8 })).toBe('gagnant');
    expect(judge({ visits: 25, posts: 8 }, { visits: 20, posts: 8 })).toBe('sans gagnant');
  });

  it('proposes the minimal rhythm under five per cent of the networks’ visits, never a closure', () => {
    const shares = networkShares({ bluesky: 60, threads: 25, facebook: 11, instagram: 3, x: 1 });
    expect(shares.x.proposal).toBe('rythme minimal');
    expect(shares.bluesky.proposal).toBe('garder');
    expect(shares.facebook.proposal).toBe('garder');
  });

  it('blocks a note that carries a number the program did not compute', () => {
    const facts = { week: '2026-11-02', google: { impressions: 312, clicks: 9 } } as unknown as Facts;
    const note: Note = { une_phrase: '312 impressions, 9 clics.', marche: [], marche_pas: ['X : 0 visite'], cette_semaine: [], propositions: [], consigne_semaine: '' };
    expect(unknownNumbers(note, facts)).toEqual(['0']);
    expect(unknownNumbers({ ...note, marche_pas: [] }, facts)).toEqual([]);
  });

  it('accepts one closed-list test per network, never a second while one runs', () => {
    const db = Db.memory();
    expect(acceptTest({ db }, { network: 'threads', kind: 'heure', value: '+60', hypothesis: 'le soir plus tard' })).toBe(true);
    expect(acceptTest({ db }, { network: 'threads', kind: 'pilier', value: 'x', hypothesis: 'h' })).toBe(false);
    expect(acceptTest({ db }, { network: 'x', kind: 'image', value: 'avec', hypothesis: 'h' })).toBe(false);
    expect(acceptTest({ db }, { network: 'mastodon', kind: 'heure', value: '+60', hypothesis: 'h' })).toBe(false);
    db.run("INSERT INTO tests (network, kind, value, hypothesis, start, end, status) VALUES ('threads', 'heure', '+60', 'h', '2026-11-30', '2026-12-27', 'en_cours')");
    expect(acceptTest({ db }, { network: 'threads', kind: 'question_finale', value: 'avec', hypothesis: 'h' })).toBe(false);
  });
});

describe('the piece of substance', () => {
  const row = (keys: string[], impressions: number, clicks: number, position: number): GscRow => ({ keys, impressions, clicks, ctr: clicks / impressions, position });
  const gsc = (pages: GscRow[], queryPages: GscRow[] = []): GscData =>
    ({ totals28: { clicks: 20, impressions: 400, position: 12 }, pages28: pages, queryPages28: queryPages, queries28: [] }) as unknown as GscData;

  it('enriches the notion people see in search without clicking', () => {
    const subject = impressionsWithoutClicks(
      gsc(
        [
          row(['https://squiggle.fr/glossaire/faux-dilemme'], 64, 0, 9),
          row(['https://squiggle.fr/glossaire/homme-de-paille'], 200, 0, 2.5),
          row(['https://squiggle.fr/glossaire/generalisation-hative'], 25, 0, 8),
        ],
        [row(['faux dilemme exemple', 'https://squiggle.fr/glossaire/faux-dilemme'], 30, 0, 9)],
      ),
    );
    expect(subject).toMatchObject({ kind: 'fiche', slug: 'faux-dilemme', queries: ['faux dilemme exemple'] });
  });

  it('finds queries no page answers, and leaves those a notion already names', () => {
    const queries = unansweredQueries(
      gsc([], [row(['conclusion trop rapide', 'https://squiggle.fr/glossaire/generalisation-hative'], 40, 0, 11), row(['faux dilemme', 'https://squiggle.fr/glossaire/faux-dilemme'], 90, 1, 5)]),
    );
    expect(queries.map((q) => q.query)).toEqual(['conclusion trop rapide']);
  });
});

describe('what the owner says', () => {
  it('reads « stop » and « reprendre » alone on the first line, whatever the case', () => {
    expect(firstWord('Stop\n\nLe lun. a écrit :')).toBe('stop');
    expect(firstWord('  REPRENDRE ')).toBe('reprendre');
    expect(firstWord('Ne stop pas tout, retire juste jeudi')).toBeNull();
  });

  it('applies a writing lesson at once and only proposes a strategy one', () => {
    const db = Db.memory();
    addLesson({ db }, { origin: 'test', kind: 'redaction', text: 'Poser la question avant l’exemple sur Threads.' });
    addLesson({ db }, { origin: 'test', kind: 'strategie', text: 'Deux publications de plus sur Bluesky.' });
    addLesson({ db }, { origin: 'test', kind: 'redaction', text: 'Poser la question avant l’exemple sur Threads.' });
    expect(activeLessons({ db }).map((l) => l.text)).toEqual(['Poser la question avant l’exemple sur Threads.']);
  });

  it('leaves a subject alone by slug or by a word of its title', () => {
    const list = [{ id: 1, kind: 'eviter_sujet' as const, value: 'dilemme', until: '2027-01-01', origin: 'e-mail' }];
    expect(avoided(list, { id: 'glossaire/faux-dilemme', title: 'Faux dilemme' })).toBe(true);
    expect(avoided(list, { id: 'glossaire/homme-de-paille', title: 'Homme de paille' })).toBe(false);
  });
});
