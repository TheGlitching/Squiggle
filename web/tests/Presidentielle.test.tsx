/**
 * `/presidentielle`: its one claim is that the findings are the tool's, on two made-up
 * speeches, with no party and no candidate. These tests hold it to that.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App';
import { CATEGORY_LABELS } from '../src/demo';
import { marked } from '../src/pages/Presidentielle';
import DISCOURS from '../src/presidentielle.json';
import { ORIGIN, PUBLIC_PAGES, TITLE_MAX, headFor, sitemap } from '../src/seo';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the data', () => {
  it('holds two speeches, whose every finding quotes its own text', () => {
    expect(DISCOURS).toHaveLength(2);
    for (const item of DISCOURS) {
      expect(item.constats.length).toBeGreaterThan(0);
      for (const constat of item.constats) {
        expect(item.texte.some((paragraph) => paragraph.includes(constat.quote)), constat.quote).toBe(true);
        expect(Object.keys(CATEGORY_LABELS)).toContain(constat.category);
      }
    }
  });

  it('names no party and no candidate, and keeps no research source', () => {
    const text = JSON.stringify(DISCOURS);
    expect(text).not.toMatch(/\b(LFI|RN|PS|LR|PCF|EELV|France insoumise|Rassemblement national|Renaissance|Républicains|Reconquête|Horizons|Modem)\b/);
    for (const item of DISCOURS) for (const constat of item.constats) expect(constat).not.toHaveProperty('sources');
  });
});

describe('marked', () => {
  it('cuts a paragraph around its quotes, and merges those that overlap', () => {
    const quote = (text: string) => ({ category: 'cadrage', severity: 2, label: '', explanation: '', quote: text });
    expect(marked('soit A, soit le désastre. Fin.', [quote('soit A, soit le'), quote('le désastre'), quote('absent')])).toEqual([
      ['soit A, soit le'],
      [' désastre'],
      '. Fin.',
    ]);
    expect(marked('Rien.', [])).toEqual(['Rien.']);
  });
});

describe('the page', () => {
  it('shows both speeches and every finding word for word', () => {
    render(<App path="/presidentielle" />);
    for (const item of DISCOURS) {
      expect(screen.getByRole('heading', { level: 3, name: item.titre })).toBeInTheDocument();
      expect(within(screen.getByRole('list', { name: `Les constats sur « ${item.titre} »` })).getAllByRole('listitem')).toHaveLength(item.constats.length);
    }
  });

  it('says what it leaves out, and counts who goes on to analyse', () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<App path="/presidentielle" />);
    expect(screen.getByText(/nous ne le montrons pas ici/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('link', { name: 'Analyser un discours' })[0]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/web\/count$/),
      expect.objectContaining({ body: JSON.stringify({ name: 'click_presidentielle_analyser' }) }),
    );
  });

  it('is findable: title, description, schema and sitemap', () => {
    const page = PUBLIC_PAGES.find((item) => item.path === '/presidentielle')!;
    expect(page.title.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(page.description.length).toBeLessThanOrEqual(160);
    expect(JSON.parse(headFor(page).match(/ld\+json">(.+)<\/script>/)![1])).toMatchObject({ '@type': 'Article', url: `${ORIGIN}/presidentielle` });
    expect(sitemap()).toContain(`<loc>${ORIGIN}/presidentielle</loc>`);
  });
});
