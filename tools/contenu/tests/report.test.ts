import { writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseCommands } from '../src/inbox';
import type { PostRow } from '../src/posts';
import { buildReport, plainReason, type ReportInput } from '../src/report';
import type { Facts } from '../src/strategy';
import { checkSummary, jargon } from '../src/summary';

function post(num: number, network: PostRow['network'], slot: string, text: string, extra: Partial<PostRow> = {}): PostRow {
  return {
    id: `p${num}`,
    week: '2026-11-23',
    network,
    slot_at: slot,
    pillar: 'notion',
    angle: 'exemple',
    source_id: 'glossaire/faux-dilemme',
    source_title: 'Faux dilemme',
    text,
    image_url: network === 'instagram' ? 'https://squiggle.fr/og/social/faux-dilemme/1.png https://squiggle.fr/og/social/faux-dilemme/2.png' : null,
    alt: null,
    status: 'propose',
    reason: null,
    postiz_id: null,
    created_at: '2026-11-02T05:00:00Z',
    num,
    ...extra,
  };
}

const facts = {
  week: '2026-11-02',
  google: { impressions: 18, clicks: 0, position: 13.8, impressionsVs4: null, clicksVs4: null },
  networks: {
    bluesky: { visits: 0, posts: 0, visitsPerPost4w: null, followers: null },
    threads: { visits: 0, posts: 0, visitsPerPost4w: null, followers: null },
    facebook: { visits: 0, posts: 0, visitsPerPost4w: null, followers: null },
    instagram: { visits: 3, posts: 0, visitsPerPost4w: null, followers: null },
    x: { visits: 0, posts: 0, visitsPerPost4w: null, followers: null },
  },
  networkVisits: { week: 3, previous: null },
  accounts: { week: 3, previous: null },
  tests: [],
  weeksOfData: 1,
} as unknown as Facts;

function input(extra: Partial<ReportInput> = {}): ReportInput {
  return {
    facts,
    strategy: null,
    deep: { subject: { rule: 'brouillon', kind: 'brouillon', slug: 'sondage', reason: '', queries: [] }, production: { label: 'l’article « Un sondage dans un article »' } as never, pr: null, why: 'un article déjà rédigé attendait d’être publié' },
    entering: [
      post(1, 'x', '2026-11-23T11:00:00.000Z', 'Écrans : il faut choisir. Soit on interdit le téléphone, soit on sacrifie une génération.'),
      post(2, 'instagram', '2026-11-25T18:00:00.000Z', 'Deux options, et le reste disparaît. Lien dans la bio.'),
      post(3, 'bluesky', '2026-11-26T17:30:00.000Z', 'Trop long', { status: 'refuse', reason: 'filtre : trop long pour bluesky : 302 sur 300', num: null }),
    ],
    comments: [],
    toRead: {},
    lessons: [],
    mail: [],
    health: { reserve: { bluesky: null, threads: null, facebook: null, instagram: null, x: null }, failed: [], disconnected: [], spend: { openrouter: 0.03, x: 0 }, paused: false, draftMode: false },
    steps: [],
    now: new Date('2026-11-02T05:00:00Z'),
    dry: true,
    ...extra,
  };
}

describe('the weekly report', () => {
  const report = buildReport(input(), { essentiel: ['Une semaine calme.', 'Deux publications entrent dans la file.'], lecture: 'Instagram apporte les seules visites.' });
  // `RENDU=<file>` keeps the rendering, to look at it in a browser.
  if (process.env.RENDU) writeFileSync(process.env.RENDU, report.html);

  it('says once that it is a dry run, then the essential, then what is expected', () => {
    expect(report.html.match(/Version d’essai : rien n’a été publié/g)).toHaveLength(1);
    expect(report.text.indexOf('Une semaine calme.')).toBeLessThan(report.text.indexOf('LES CHIFFRES'));
    expect(report.text).toContain('> Une décision vous attend, juste en dessous.');
  });

  it('numbers each post entering the queue, groups them by day, and shows its image as a thumbnail', () => {
    expect(report.text).toContain('[1] X, 12 h');
    expect(report.text).toContain('--- Lundi 23 novembre ---');
    expect(report.html).toContain('<img src="https://squiggle.fr/og/social/faux-dilemme/1.png" width="88"');
    expect(report.html).toContain('+1 image');
    expect(report.text).toContain('« retire 1 »');
  });

  it('says a refused post plainly, at the bottom', () => {
    expect(report.text).toContain('Bluesky jeudi 26 novembre, refusée par le contrôle : trop longue pour ce réseau');
    expect(plainReason('relecture : relecture impossible : réponse coupée')).toBe('la relecture n’a pas pu se faire');
  });

  it('keeps empty sections to one line, and says too little data once', () => {
    expect(report.text).toContain('RÉPONSES À FAIRE\n\nRien cette semaine.');
    expect(report.text.match(/trop peu de semaines/g)).toHaveLength(1);
    expect(report.text).toContain('Santé : tout va bien.');
  });

  it('carries no internal word', () => {
    // Postiz and GitHub are the owner's own apps, named where they are used.
    const visible = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/Postiz|GitHub/g, ' ');
    expect(jargon(visible(report.text))).toBeNull();
    expect(jargon(visible(report.html.replace(/<style>[\s\S]*<\/style>/, '')))).toBeNull();
  });
});

describe('the summary check', () => {
  it('refuses a number the program did not compute, and an internal word', () => {
    expect(checkSummary({ essentiel: ['3 visites.', 'Rien d’autre.'], lecture: '' }, { visites: 3 })).toBeNull();
    expect(checkSummary({ essentiel: ['12 visites.', 'Rien d’autre.'], lecture: '' }, { visites: 3 })).toBe('chiffres non calculés : 12');
    expect(checkSummary({ essentiel: ['Une pull request est ouverte.', 'Rien d’autre.'], lecture: '' }, {})).toBe('mot interne : pull request');
  });
});

describe('short answers', () => {
  it('reads « retire 4 », several numbers, and « oui B », one a line, leaving the rest', () => {
    expect(parseCommands('retire 4')).toEqual({ retire: [4], answers: [], rest: '' });
    const c = parseCommands('Retirez la 4 et 7.\nnon b\nMerci, très bien sinon');
    expect(c.retire).toEqual([4, 7]);
    expect(c.answers).toEqual([{ yes: false, letter: 'B' }]);
    expect(c.rest).toBe('Merci, très bien sinon');
    expect(parseCommands('oui A').answers).toEqual([{ yes: true, letter: 'A' }]);
    expect(parseCommands('Je retirerais bien celle sur la notion de jeudi').retire).toEqual([]);
  });
});
