import { describe, expect, it } from 'vitest';

import { CALENDAR, REVIEW_DAYS, parisTime, resolvePillar, rotate, slotAt, weeksToFill } from '../src/calendar';
import type { GscData, GscRow } from '../src/collect/gsc';
import { impressionsWithoutClicks, unansweredQueries } from '../src/deep';
import { firstWord } from '../src/inbox';
import { addLesson, activeLessons, avoided } from '../src/memory';

// The routine's database is Node's own SQLite (22.13 and later, the VPS runs 24).
// Where Node is older, the tests that need it say so instead of failing to load.
const sqlite = await import('node:sqlite').then(
  () => true,
  () => false,
);
const { Db } = sqlite ? await import('../src/db') : ({} as typeof import('../src/db'));
import { acceptTest, judge, networkShares, testValue, testVerdict, unknownNumbers, type Facts, type Note, type Tally } from '../src/strategy';

describe('the calendar', () => {
  it('reads Paris time on both sides of the clock change', () => {
    expect(parisTime('2026-10-23', '12:15').toISOString()).toBe('2026-10-23T10:15:00.000Z');
    expect(parisTime('2026-11-30', '12:15').toISOString()).toBe('2026-11-30T11:15:00.000Z');
    expect(parisTime('2026-11-30', '00:30').toISOString()).toBe('2026-11-29T23:30:00.000Z');
  });

  it('starts with the general public: about half notions, a quarter or more substance, product and teachers every week', () => {
    const notion = CALENDAR.filter((s) => s.pillar === 'notion').length;
    const fond = CALENDAR.filter((s) => s.pillar === 'fond').length;
    expect(notion / CALENDAR.length).toBeGreaterThanOrEqual(0.5);
    expect(fond / CALENDAR.length).toBeGreaterThanOrEqual(0.25);
    for (const monday of ['2026-11-30', '2026-12-07']) {
      const friday = CALENDAR.filter((s) => s.pillar === 'produit-ou-classe').map((s) => [s.network, resolvePillar(s, monday)] as const);
      expect(new Set(friday.map(([, p]) => p))).toEqual(new Set(['produit', 'classe']));
      const of = (network: string) => friday.find(([n]) => n === network)![1];
      expect(of('mastodon')).not.toBe(of('bluesky'));
      expect(of('instagram')).not.toBe(of('bluesky'));
    }
  });

  it('starts with the next week, then fills one week further each Monday until four weeks out', () => {
    const monday = (d: string) => new Date(`${d}T04:00:00Z`);
    expect(weeksToFill(monday('2026-11-02'), '2026-11-02', null)).toEqual(['2026-11-09']);
    // The weeks already filled are held in the journal and skipped: each Monday adds the last one.
    expect(weeksToFill(monday('2026-11-09'), '2026-11-09', '2026-11-02')).toEqual(['2026-11-16', '2026-11-23']);
    expect(weeksToFill(monday('2026-11-16'), '2026-11-16', '2026-11-02')).toEqual(['2026-11-23', '2026-11-30', '2026-12-07']);
    // From the fourth Monday on, the steady state: weeks three and four out.
    expect(weeksToFill(monday('2026-11-23'), '2026-11-23', '2026-11-02')).toEqual(['2026-12-14', '2026-12-21']);
  });

  it('only fills weeks at least three weeks out, up to four, once started', () => {
    const now = new Date('2026-11-02T04:00:00Z');
    const weeks = weeksToFill(now, '2026-11-02', '2026-10-05');
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
  const tally = (t: Partial<Tally>): Tally => ({ posts: 8, weeks: 4, visits: 0, conversation: 0, followers: 0, ...t });

  it('judges on visits first, a winner from thirty per cent more per post', () => {
    expect(judge(tally({ visits: 26 }), tally({ visits: 20 }))).toEqual({ verdict: 'gagnant', signal: 'visites' });
    expect(judge(tally({ visits: 25 }), tally({ visits: 20 }))).toEqual({ verdict: 'aucun effet', signal: 'visites' });
    expect(judge(tally({ visits: 20 }), tally({ visits: 26 }))).toEqual({ verdict: 'moins bien', signal: 'visites' });
  });

  it('falls back on the conversation, then the followers gained, and says when there is not yet any signal', () => {
    expect(judge(tally({ visits: 19, conversation: 40 }), tally({ visits: 5, conversation: 20 }))).toEqual({ verdict: 'gagnant', signal: 'conversation' });
    expect(judge(tally({ visits: 3, conversation: 4, followers: 21 }), tally({ followers: 20 }))).toEqual({ verdict: 'aucun effet', signal: 'abonnés' });
    expect(judge(tally({ visits: 19, conversation: 19, followers: 19 }), tally({}))).toEqual({ verdict: 'pas encore de signal', signal: null });
  });

  it('runs a content test on every network, one week each way, and a setting on its network alone', () => {
    const content = { network: 'tous', kind: 'question_finale', value: 'avec', start: '2026-11-30' };
    expect(testValue(content, 'threads', new Date('2026-12-01T17:30:00Z'))).toBe('avec');
    expect(testValue(content, 'bluesky', new Date('2026-12-09T11:15:00Z'))).toBe('sans');
    expect(testValue(content, 'x', new Date('2026-12-17T11:00:00Z'))).toBe('avec');
    expect(testValue({ ...content, kind: 'image' }, 'x', new Date('2026-12-01T11:00:00Z'))).toBeNull();
    expect(testValue({ network: 'mastodon', kind: 'mots_diese', value: 'sans', start: '2026-11-30' }, 'mastodon', new Date('2026-12-09T11:30:00Z'))).toBe('sans');
    expect(testValue({ network: 'mastodon', kind: 'mots_diese', value: 'sans', start: '2026-11-30' }, 'bluesky', new Date('2026-12-09T11:30:00Z'))).toBeNull();
  });

  it('proposes the minimal rhythm under five per cent of the networks’ visits, never a closure', () => {
    const shares = networkShares({ bluesky: 60, mastodon: 0, threads: 25, facebook: 11, instagram: 3, x: 1 });
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

  it.skipIf(!sqlite)('accepts one closed-list test per network, never a second while one runs', () => {
    const db = Db.memory();
    expect(acceptTest({ db }, { network: 'threads', kind: 'heure', value: '+60', hypothesis: 'le soir plus tard' })).toBe(true);
    expect(acceptTest({ db }, { network: 'threads', kind: 'pilier', value: 'x', hypothesis: 'h' })).toBe(false);
    expect(acceptTest({ db }, { network: 'x', kind: 'lien', value: 'avec', hypothesis: 'h' })).toBe(false);
    expect(acceptTest({ db }, { network: 'bluesky', kind: 'mots_diese', value: 'sans', hypothesis: 'h' })).toBe(false);
    expect(acceptTest({ db }, { network: 'linkedin', kind: 'heure', value: '+60', hypothesis: 'h' })).toBe(false);
    db.run("INSERT INTO tests (network, kind, value, hypothesis, start, end, status) VALUES ('threads', 'heure', '+60', 'h', '2026-11-30', '2027-01-24', 'en_cours')");
    expect(acceptTest({ db }, { network: 'threads', kind: 'lien', value: 'sans', hypothesis: 'h' })).toBe(false);
  });

  it.skipIf(!sqlite)('accepts a content test only on every network at once, one at a time', () => {
    const db = Db.memory();
    expect(acceptTest({ db }, { network: 'threads', kind: 'question_finale', value: 'avec', hypothesis: 'h' })).toBe(false);
    expect(acceptTest({ db }, { network: 'tous', kind: 'format', value: 'video', hypothesis: 'h' })).toBe(false);
    expect(acceptTest({ db }, { network: 'tous', kind: 'format', value: 'carrousel', hypothesis: 'h' })).toBe(true);
    db.run("INSERT INTO tests (network, kind, value, hypothesis, start, end, status) VALUES ('tous', 'format', 'carrousel', 'h', '2026-11-30', '2027-01-24', 'en_cours')");
    expect(acceptTest({ db }, { network: 'tous', kind: 'question_finale', value: 'avec', hypothesis: 'h' })).toBe(false);
    expect(acceptTest({ db }, { network: 'threads', kind: 'heure', value: '-30', hypothesis: 'h' })).toBe(true);
  });

  it.skipIf(!sqlite)('weighs a content test’s weeks with the value against its weeks without, on the conversation when visits are few', () => {
    const db = Db.memory();
    const monday = (i: number) => new Date(Date.parse('2026-11-30T00:00:00Z') + 7 * i * 86_400_000).toISOString().slice(0, 10);
    for (let i = 0; i < 8; i += 1) {
      const posted = new Date(Date.parse(`${monday(i)}T11:15:00Z`)).toISOString();
      db.run("INSERT INTO posts (id, week, network, slot_at, pillar, angle, source_id, text, status, created_at) VALUES (?, ?, 'bluesky', ?, 'notion', 'exemple', 's', 't', 'publie', ?)", `p${i}`, monday(i), posted, posted);
      // The week's posts as the next Monday's snapshot reads them: eight replies on the weeks with a question, two without.
      const bluesky = { followers: 100 + i, posts: [{ uri: `u${i}`, url: '', text: '', createdAt: posted, likes: 0, reposts: 0, replies: i % 2 === 0 ? 8 : 2, quotes: 0 }] };
      db.run("INSERT INTO snapshots (source, week, collected_at, status, payload) VALUES ('bluesky', ?, ?, 'ok', ?)", monday(i + 1), posted, JSON.stringify(bluesky));
    }
    expect(testVerdict({ db }, { network: 'tous', kind: 'question_finale', start: monday(0), end: '2027-01-24' })).toEqual({ verdict: 'gagnant', signal: 'conversation' });
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

  it.skipIf(!sqlite)('applies a writing lesson at once and only proposes a strategy one', () => {
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
