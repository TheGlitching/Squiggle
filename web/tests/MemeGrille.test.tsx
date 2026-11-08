/**
 * The page tells a wary reader the reports are real and the texts mirror each other. A
 * quote that is not in its text, a question that pairs two different sentences, or a
 * finding that only one text received and the page keeps quiet about, would make that false.
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CATEGORY_LABELS, SCORE_BANDS, scoreBand } from '../src/demo';
import { MEME_GRILLE_PATH, ONLY_B, QUESTIONS, RUNS, TEXTS } from '../src/memeGrille';
import { Accueil } from '../src/pages/Accueil';
import { MemeGrille } from '../src/pages/MemeGrille';
import { PUBLIC_PAGES } from '../src/seo';

afterEach(cleanup);

const fullText = (side: 'a' | 'b') => [TEXTS[side].title, ...TEXTS[side].paragraphs].join('\n');

describe('Même grille, deux camps', () => {
  it('quotes only what each text says', () => {
    for (const side of ['a', 'b'] as const) {
      for (const finding of TEXTS[side].findings) expect(fullText(side)).toContain(finding.quote);
    }
  });

  it('builds the two texts sentence for sentence', () => {
    const sentences = (paragraph: string) => paragraph.split(/(?<=[.:])\s/).length;
    expect(TEXTS.a.paragraphs.map(sentences)).toEqual(TEXTS.b.paragraphs.map(sentences));
    expect(TEXTS.a.paragraphs[3]).toBe(TEXTS.b.paragraphs[3]);
  });

  it('accounts for every finding of both texts, on a question or as a difference', () => {
    expect(QUESTIONS.map(([, a]) => a).sort()).toEqual(TEXTS.a.findings.map((_, index) => index));
    expect([...QUESTIONS.map(([, , b]) => b), ...ONLY_B].sort()).toEqual(TEXTS.b.findings.map((_, index) => index));
  });

  it('pairs findings of the same kind on each question', () => {
    for (const [, a, b] of QUESTIONS) expect(TEXTS.a.findings[a].category).toBe(TEXTS.b.findings[b].category);
  });

  it('shows the run it details as the first of the three', () => {
    expect(RUNS.scores.a[0]).toBe(TEXTS.a.score);
    expect(RUNS.scores.b[0]).toBe(TEXTS.b.score);
  });

  it('says the texts are invented, shows both scores and every finding', () => {
    render(<MemeGrille />);
    expect(screen.getByRole('article', { name: `Texte inventé, ${TEXTS.a.camp.replace(/'/g, '’')}` })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: `Texte inventé, ${TEXTS.b.camp.replace(/'/g, '’')}` })).toBeInTheDocument();
    const differences = within(screen.getByRole('region', { name: 'Ce qui diffère' }));
    for (const text of [TEXTS.a, TEXTS.b]) {
      expect(differences.getByText(`${text.score} sur 100`)).toBeInTheDocument();
      expect(scoreBand(text.score) in SCORE_BANDS).toBe(true);
    }
    for (const index of ONLY_B) {
      expect(differences.getByText(TEXTS.b.findings[index].label.replace(/'/g, '’'))).toBeInTheDocument();
    }
    expect(screen.getAllByText(CATEGORY_LABELS.sophisme).length).toBe(2);
  });

  it('leads from the home page to the full comparison', () => {
    render(<Accueil />);
    const section = within(screen.getByRole('region', { name: 'Même grille, deux camps' }));
    expect(section.getByRole('link', { name: 'Comparer les deux rapports' })).toHaveAttribute('href', MEME_GRILLE_PATH);
  });

  it('has a stable public address', () => {
    expect(PUBLIC_PAGES.map((page) => page.path)).toContain(MEME_GRILLE_PATH);
  });
});
