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
    const all = NOTIONS.flatMap(({ slug, exemple, exemples = [] }) => [exemple, ...exemples].map((item) => [slug, item] as const));
    for (const [slug, item] of all) {
      expect(passages(item.titre).length + passages(item.texte).length, slug).toBe(1);
    }
    expect(new Set(all.map(([, item]) => item.lecture)).size).toBe(all.length);
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

  it('gives the notions a search already finds more made-up examples, under the words the search uses', () => {
    const enriched = ['proces-d-intention', 'generalisation-hative', 'citation-tronquee', 'affirmation-non-etayee', 'correlation-causalite', 'pente-savonneuse', 'appel-a-la-popularite', 'fausse-analogie', 'debat-presente-comme-clos'];
    expect(NOTIONS.filter((item) => item.exemples).map((item) => item.slug).sort()).toEqual([...enriched].sort());
    for (const slug of enriched) {
      const item = NOTIONS.find((notion) => notion.slug === slug)!;
      expect(item.exemples!.length, slug).toBeGreaterThanOrEqual(2);
      expect(item.description!.length, slug).toBeLessThanOrEqual(160);
    }
    render(<App path="/glossaire/proces-d-intention" />);
    const part = within(screen.getByRole('region', { name: 'Autres exemples de procès d’intention' }));
    expect(part.getAllByText(/, un article inventé$/)).toHaveLength(3);
    cleanup();
    render(<App path="/glossaire/affirmation-non-etayee" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Autres exemples d’affirmation non étayée' })).toBeInTheDocument();
    cleanup();
    render(<App path="/glossaire/generalisation-hative" />);
    expect(screen.getByText(/Autres noms : .*Conclusion hâtive/)).toBeInTheDocument();
    expect(glossaryLink({ label: 'Procès en intention', category: 'cadrage' })?.to).toBe('/glossaire/proces-d-intention');
  });

  it('offers the analysis right after the example, and counts who takes it', () => {
    const fetch = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal('fetch', fetch);
    render(<App path="/glossaire/faux-dilemme" />);
    const callout = within(screen.getByRole('complementary', { name: 'Analyser un article' }));
    expect(callout.getByText(/Ce procédé se cache peut-être dans l’article que vous lisez/)).toBeInTheDocument();
    fireEvent.click(callout.getByRole('link', { name: 'Analyser un article' }));
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/web\/count$/),
      expect.objectContaining({ body: JSON.stringify({ name: 'click_glossaire_analyser' }) }),
    );
    vi.unstubAllGlobals();
  });

  it('gathers every classroom question on /enseignants/exercices, each linked to its notion', () => {
    render(<App path="/enseignants/exercices" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Exercices d’esprit critique' })).toBeInTheDocument();
    for (const item of NOTIONS) {
      expect(screen.getByText(item.question)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: `La fiche : ${item.nom.charAt(0).toLowerCase()}${item.nom.slice(1)}` })).toHaveAttribute(
        'href',
        `/glossaire/${item.slug}`,
      );
    }
  });

  it('answers an unknown notion with the 404 page', () => {
    render(<App path="/glossaire/sophisme-inconnu" />);
    expect(screen.getByText('Page introuvable')).toBeInTheDocument();
  });
});
