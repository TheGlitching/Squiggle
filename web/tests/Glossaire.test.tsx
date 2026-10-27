/**
 * The glossary: every notion is a whole page that leads to its neighbours, and a
 * report's finding finds its page from the free label the model wrote. The labels
 * below are ones the engine has produced, or the names the prompt itself suggests.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App';
import { EXAMPLES } from '../src/demo';
import { FAMILLES, NOTIONS, glossaryLink, typo } from '../src/glossaire';

afterEach(() => {
  cleanup();
  window.history.pushState({}, '', '/');
});

const passages = (segments: ReadonlyArray<string | readonly [string]>) => segments.filter((part) => typeof part !== 'string');

describe('the glossary content', () => {
  it('has 25 notions, each in a family, each pointing at notions that exist', () => {
    expect(NOTIONS).toHaveLength(25);
    const slugs = new Set(NOTIONS.map((notion) => notion.slug));
    expect(slugs.size).toBe(NOTIONS.length);
    for (const { id } of FAMILLES) expect(NOTIONS.some((notion) => notion.famille === id)).toBe(true);
    for (const notion of NOTIONS) {
      expect(notion.voisines.length).toBeGreaterThan(0);
      for (const slug of notion.voisines) {
        expect(slugs.has(slug), `${notion.slug} -> ${slug}`).toBe(true);
        expect(slug).not.toBe(notion.slug);
      }
    }
  });

  it('shows each notion on its own made-up article, with exactly one passage highlighted', () => {
    for (const { slug, exemple } of NOTIONS) {
      expect(passages(exemple.titre).length + passages(exemple.texte).length, slug).toBe(1);
    }
    expect(new Set(NOTIONS.map(({ exemple }) => exemple.lecture)).size).toBe(NOTIONS.length);
  });

  it('writes no em dash, and keeps French punctuation off the start of a line', () => {
    const text = JSON.stringify(NOTIONS);
    expect(text).not.toContain('—');
    expect(typo('Pourquoi ? « Ici » : là')).toBe('Pourquoi ? « Ici » : là');
  });
});

describe('a finding finds its notion', () => {
  it('from the notion’s own name or any of its other names', () => {
    for (const notion of NOTIONS) {
      for (const label of [notion.nom, ...(notion.aussi ?? [])]) {
        expect(glossaryLink({ label, category: notion.categorie })?.to, label).toBe(`/glossaire/${notion.slug}`);
      }
    }
  });

  it.each([
    ['Faux dilemme manichéen', 'sophisme', 'faux-dilemme'],
    ['Généralisation hâtive et déterminisme technologique', 'sophisme', 'generalisation-hative'],
    ['Corrélation prise pour causalité', 'sophisme', 'correlation-causalite'],
    ['Appel au sens commun', 'sophisme', 'appel-a-la-popularite'],
    ['Étude non nommée', 'source-absente', 'autorite-anonyme'],
    ['Autorité non nommée', 'cadrage', 'autorite-anonyme'],
    ['Exagération', 'cadrage', 'vocabulaire-charge'],
    ['Formule appuyée', 'cadrage', 'vocabulaire-charge'],
    ['Titre qui surinterprète l’étude', 'cadrage', 'titre-trompeur'],
    ['Citation sélective', 'cadrage', 'citation-tronquee'],
    ['Chiffre non étayé', 'affirmation-non-etayee', 'chiffre-sans-origine'],
    ['Chiffre sans source', 'source-absente', 'chiffre-sans-origine'],
    ['Chiffre d’adoption non sourcé', 'source-absente', 'chiffre-sans-origine'],
    // A doubtful figure is not a figure without origin: its category decides.
    ['Chiffre mis en doute', 'affirmation-non-etayee', 'affirmation-non-etayee'],
    ['Intention prêtée au ministre', 'cadrage', 'proces-d-intention'],
  ])('« %s » (%s) → %s', (label, category, slug) => {
    expect(glossaryLink({ label, category })?.to).toBe(`/glossaire/${slug}`);
  });

  it('falls back on its family when the label names nothing, and links no strength', () => {
    expect(glossaryLink({ label: 'Raisonnement circulaire', category: 'sophisme' })).toEqual({
      to: '/glossaire#raisonnement',
      label: 'Glossaire : raisonnements qui déraillent',
    });
    expect(glossaryLink({ label: 'Mise en scène', category: 'cadrage' })?.to).toBe('/glossaire#cadrage');
    expect(glossaryLink({ label: 'Réserve', category: 'surinterpretation' })?.to).toBe('/glossaire/surinterpretation');
    expect(glossaryLink({ label: 'Témoins de terrain', category: 'point-fort' })).toBeNull();
  });

  it('links every fragile passage of the landing’s example, and not its strength', () => {
    for (const example of EXAMPLES) {
      expect(glossaryLink(example) === null, example.label).toBe(example.category === 'point-fort');
    }
  });
});

describe('the glossary pages', () => {
  it('lists every notion by family on /glossaire', () => {
    render(<App path="/glossaire" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Glossaire de l’esprit critique' })).toBeInTheDocument();
    for (const { id, titre } of FAMILLES) {
      const region = within(screen.getByRole('region', { name: titre }));
      for (const notion of NOTIONS.filter((item) => item.famille === id)) {
        expect(region.getByRole('link', { name: new RegExp(`^${notion.nom}`) })).toHaveAttribute(
          'href',
          `/glossaire/${notion.slug}`,
        );
      }
    }
  });

  it.each(NOTIONS.map((notion) => [notion.slug, notion] as const))('/glossaire/%s is a whole page', (slug, notion) => {
    render(<App path={`/glossaire/${slug}`} />);
    expect(screen.getByRole('heading', { level: 1, name: notion.nom })).toBeInTheDocument();
    for (const name of ['Sur un article d’exemple', 'Comment le repérer', 'Dans un rapport Squiggle', 'En classe']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
    expect(screen.getByText(notion.question)).toBeInTheDocument();
    const neighbours = within(screen.getByRole('complementary', { name: 'Notions voisines' }));
    expect(neighbours.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(
      expect.arrayContaining(notion.voisines.map((other) => `/glossaire/${other}`)),
    );
  });

  // The neighbours sit at the foot of the page: following one must not leave the reader there.
  it('opens a neighbouring notion at its top, in place', () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    window.history.pushState({}, '', '/glossaire/faux-dilemme');
    render(<App />);
    const neighbours = within(screen.getByRole('complementary', { name: 'Notions voisines' }));
    fireEvent.click(neighbours.getByRole('link', { name: /^Pente savonneuse/ }));
    expect(screen.getByRole('heading', { level: 1, name: 'Pente savonneuse' })).toBeInTheDocument();
    expect(scroll).toHaveBeenCalledWith(0, 0);
    scroll.mockRestore();
  });

  it('answers an unknown notion with the 404 page', () => {
    render(<App path="/glossaire/sophisme-inconnu" />);
    expect(screen.getByText('Page introuvable')).toBeInTheDocument();
  });
});
