/**
 * What a crawler or a link preview reads: each public page's own head, the sitemap
 * that lists them, and the robots.txt that points at it. Neither runs the app, so
 * all of it must be in the files the build writes (`prerender` in vite.config.ts).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App';
import { NOTIONS } from '../src/glossaire';
import { ORIGIN, PUBLIC_PAGES, headFor, sitemap, titleFor } from '../src/seo';
import { installFetch } from './helpers';

// The analysis page asks who is signed in: no one, here.
beforeEach(() => void installFetch(() => undefined));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

describe('search engines and link previews', () => {
  it('gives every public page its own title and description', () => {
    expect(new Set(PUBLIC_PAGES.map((page) => page.title)).size).toBe(PUBLIC_PAGES.length);
    expect(new Set(PUBLIC_PAGES.map((page) => page.description)).size).toBe(PUBLIC_PAGES.length);
    for (const page of PUBLIC_PAGES) expect(page.description.length).toBeLessThanOrEqual(160);
  });

  it.each(PUBLIC_PAGES.map((page) => [page.path, page] as const))('%s is a page of the app, with its own head', (path, page) => {
    render(<App path={path} />);
    expect(screen.queryByText('Page introuvable')).toBeNull();
    const head = headFor(page);
    expect(head).toContain(`<link rel="canonical" href="${ORIGIN}${path}" />`);
    expect(head).toContain(`<meta property="og:url" content="${ORIGIN}${path}" />`);
    expect(head).toContain(`<meta property="og:title" content="${page.title}" />`);
    expect(head).toContain(`<meta name="twitter:description" content="${page.description}" />`);
  });

  it('describes the publisher and the offer on the home page, and no FAQ', () => {
    const json = headFor(PUBLIC_PAGES[0]).match(/<script type="application\/ld\+json">(.+)<\/script>/)?.[1];
    const types = (JSON.parse(json!) as { '@graph': Array<{ '@type': string; offers?: Array<{ price: string }> }> })[
      '@graph'
    ];
    expect(types.map((item) => item['@type'])).toEqual(['Organization', 'WebSite', 'SoftwareApplication']);
    expect(types[2].offers?.map((offer) => offer.price)).toEqual(['0', '4.99']);
    for (const page of PUBLIC_PAGES.slice(1)) expect(headFor(page)).not.toContain('Organization');
    for (const page of PUBLIC_PAGES.filter((item) => !item.jsonLd).slice(1)) expect(headFor(page)).not.toContain('ld+json');
    expect(PUBLIC_PAGES.map(headFor).join('')).not.toContain('FAQPage');
  });

  it('describes the glossary as a set of defined terms, each notion one of them', () => {
    const data = (path: string) =>
      JSON.parse(headFor(PUBLIC_PAGES.find((page) => page.path === path)!).match(/ld\+json">(.+)<\/script>/)![1]);
    const set = data('/glossaire');
    expect(set['@type']).toBe('DefinedTermSet');
    expect(set.hasDefinedTerm).toHaveLength(NOTIONS.length);
    for (const notion of NOTIONS) {
      const term = data(`/glossaire/${notion.slug}`);
      expect(term).toMatchObject({ '@type': 'DefinedTerm', name: notion.nom, url: `${ORIGIN}/glossaire/${notion.slug}` });
      expect(term.inDefinedTermSet['@id']).toBe(set['@id']);
    }
  });

  it('lists every public page in the sitemap, which robots.txt names', () => {
    const locs = [...sitemap().matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    expect(locs).toEqual(PUBLIC_PAGES.map((page) => `${ORIGIN}${page.path}`));
    const robots = readFileSync(resolve(__dirname, '../public/robots.txt'), 'utf8');
    expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
    expect(robots).not.toMatch(/^Disallow: \/$/m);
  });

  it('keeps the tab title in step with the page as the reader moves around', () => {
    window.history.pushState({}, '', '/enseignants');
    render(<App />);
    expect(document.title).toBe('Squiggle pour les enseignants');
    expect(titleFor('/compte')).toBe(PUBLIC_PAGES[0].title);
  });
});
