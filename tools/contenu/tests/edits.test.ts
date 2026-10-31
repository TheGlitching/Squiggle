import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { transformSync } from 'esbuild';
import { describe, expect, it } from 'vitest';

import type { Notion } from '../../../web/src/glossaire';
import { addBlogCounter, articleFile, enrichNotion, literal, publishDraft } from '../src/edits';

const repo = join(__dirname, '../../..');
const glossaire = readFileSync(join(repo, 'web/src/glossaire.ts'), 'utf8');
const audience = readFileSync(join(repo, 'shared/src/hosted/audience.ts'), 'utf8');

const EXEMPLE: Notion['exemple'] = {
  rubrique: 'Sport',
  titre: ['Le club n’a plus le choix'],
  texte: ['Le président est formel : ', ['soit on vend le stade, soit le club disparaît'], '.'],
  lecture: 'D’autres options existent, et l’article n’en dit rien.',
};

/** Parses as TypeScript, or throws. */
const parses = (source: string) => transformSync(source, { loader: 'ts' });

describe('enrichNotion', () => {
  it('adds an examples field to a notion that has none, and nothing else changes', () => {
    const out = enrichNotion(glossaire, 'faux-dilemme', { exemples: [EXEMPLE] });
    expect(() => parses(out)).not.toThrow();
    expect(out).toContain("    exemples: [\n      {\n        rubrique: 'Sport',");
    expect(out.replace(/    exemples: \[[\s\S]*?\n    \],\n/, '')).toBe(glossaire);
  });

  it('appends to the examples a notion already has', () => {
    const out = enrichNotion(glossaire, 'correlation-causalite', { exemples: [EXEMPLE] });
    expect(() => parses(out)).not.toThrow();
    expect(out.split('\n').length).toBeGreaterThan(glossaire.split('\n').length);
    expect(out.indexOf('Le club n’a plus le choix')).toBeGreaterThan(out.indexOf('Les kinés, mauvais pour les joueurs ?'));
  });

  it('merges synonyms without repeating one and writes a description only where there is none', () => {
    const out = enrichNotion(glossaire, 'faux-dilemme', { aussi: ['fausse alternative', 'Dilemme truqué'], description: 'Une description.' });
    expect(out).toContain("    aussi: ['Fausse alternative', 'Dilemme truqué'],");
    expect(out).toContain("    description:\n      'Une description.',");
    expect(() => parses(out)).not.toThrow();
  });

  it('refuses a notion it cannot find', () => {
    expect(() => enrichNotion(glossaire, 'n-existe-pas', { aussi: ['x'] })).toThrow(/introuvable/);
  });
});

describe('new articles', () => {
  it('writes an article file that parses, escapes quotes, and keeps the block shapes', () => {
    const file = articleFile({
      slug: 'essai',
      titre: 'Un titre avec l\'apostrophe droite',
      titreCourt: 'Un titre',
      description: 'Une description.',
      chapo: 'Un chapô.',
      publie: '2026-11-02',
      notions: ['faux-dilemme'],
      corps: [{ paragraphe: ['Voir ', { texte: 'le faux dilemme', vers: '/glossaire/faux-dilemme' }, '.'] }, { sommaire: true }],
    });
    expect(() => parses(file)).not.toThrow();
    expect(file).toContain("titre: 'Un titre avec l\\'apostrophe droite',");
    expect(file).toContain("vers: '/glossaire/faux-dilemme'");
  });

  it('adds the counter once, inside the closed list', () => {
    const out = addBlogCounter(audience, 'sondage-quatre-questions');
    expect(out).toContain("  'blog_sondage_quatre_questions',\n] as const;");
    expect(addBlogCounter(out, 'sondage-quatre-questions')).toBe(out);
  });

  it('dates a draft on publication', () => {
    expect(publishDraft("const a = {\n  publie: '2026-01-01',\n};", '2026-11-02')).toContain("  publie: '2026-11-02',");
  });

  it('keeps short arrays on one line', () => {
    expect(literal(['a', 'b'], '')).toBe("['a', 'b']");
  });
});
