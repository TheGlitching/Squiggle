/**
 * What a crawler or a link preview reads: each public page's own head, the sitemap
 * that lists them, and the robots.txt that points at it. Neither runs the app, so
 * all of it must be in the files the build writes (`prerender` in vite.config.ts).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App';
import { ALL_ARTICLES, BLOG_PATH } from '../src/blog';
import { FAMILLES, NOTIONS } from '../src/glossaire';
import { OWNER_PATH } from '../src/api';
import { APP_PATHS, NOT_FOUND_TITLE, ORIGIN, PUBLIC_PAGES, TITLE_MAX, appHeadFor, blogPages, headFor, pageSources, redirects, shareImagePath, sitemap, titleFor } from '../src/seo';
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
    expect(PUBLIC_PAGES.find((page) => page.path === '/mentions-legales')!.description.length).toBeGreaterThanOrEqual(120);
  });

  it('keeps every title short enough that a result shows it whole', () => {
    // The drafts too: an article is titled the day it is published.
    for (const page of [...PUBLIC_PAGES, ...blogPages(ALL_ARTICLES)]) expect(page.title.length, page.path).toBeLessThanOrEqual(TITLE_MAX);
    const page = (slug: string) => PUBLIC_PAGES.find((item) => item.path === `/glossaire/${slug}`)!;
    // A long notion name keeps its definition and loses its examples before it loses the site's name.
    expect(page('correlation-causalite').title).toBe('Corrélation prise pour causalité : définition - Squiggle');
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
    // A blog article names Squiggle as its author and publisher, as its Article schema requires.
    for (const page of PUBLIC_PAGES.slice(1).filter((item) => !item.path.startsWith(`${BLOG_PATH}/`)))
      expect(headFor(page)).not.toContain('Organization');
    for (const page of PUBLIC_PAGES.slice(1)) expect(headFor(page)).not.toContain('SoftwareApplication');
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
      const [term, trail] = data(`/glossaire/${notion.slug}`)['@graph'];
      expect(term).toMatchObject({ '@type': 'DefinedTerm', name: notion.nom, url: `${ORIGIN}/glossaire/${notion.slug}` });
      expect(term.alternateName).toEqual(notion.aussi);
      expect(term.inDefinedTermSet['@id']).toBe(set['@id']);
      // The trail the page shows above its title, ending on the notion itself.
      expect(trail['@type']).toBe('BreadcrumbList');
      expect(trail.itemListElement.map((item: { name: string; position: number }) => [item.position, item.name])).toEqual([
        [1, 'Glossaire'],
        [2, FAMILLES.find(({ id }) => id === notion.famille)!.titre],
        [3, notion.nom],
      ]);
      expect(trail.itemListElement[0].item).toBe(`${ORIGIN}/glossaire`);
      expect(trail.itemListElement[2].item).toBeUndefined();
    }
  });

  it('titles a notion with several examples in the plural, and describes it by the question a search asks', () => {
    const page = (slug: string) => PUBLIC_PAGES.find((item) => item.path === `/glossaire/${slug}`)!;
    expect(page('proces-d-intention').title).toBe('Procès d’intention : définition et exemples - Squiggle');
    expect(page('proces-d-intention').description).toMatch(/^Comment reconnaître un procès d’intention/);
    expect(page('faux-dilemme').title).toBe('Faux dilemme : définition et exemple - Squiggle');
  });

  it('describes the teacher pages as learning resources for teachers', () => {
    for (const path of ['/enseignants/fiche-activite', '/enseignants/grille-lecture', '/enseignants/exercices']) {
      const json = headFor(PUBLIC_PAGES.find((page) => page.path === path)!).match(/ld\+json">(.+)<\/script>/)![1];
      expect(JSON.parse(json), path).toMatchObject({
        '@type': 'LearningResource',
        url: `${ORIGIN}${path}`,
        audience: { educationalRole: 'teacher' },
        educationalLevel: ['Collège', 'Lycée'],
      });
    }
  });

  it('lists every public page in the sitemap, which robots.txt names', () => {
    const locs = [...sitemap().matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    expect(locs).toEqual(PUBLIC_PAGES.map((page) => `${ORIGIN}${page.path}`));
    const robots = readFileSync(resolve(__dirname, '../public/robots.txt'), 'utf8');
    expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
    expect(robots).not.toMatch(/^Disallow: \/$/m);
  });

  it('sends a page’s address with a trailing slash to the page for good', () => {
    const lines = redirects().trim().split('\n');
    expect(lines).toContain('/glossaire/ /glossaire 301');
    expect(lines).toContain('/glossaire/proces-d-intention/ /glossaire/proces-d-intention 301');
    expect(lines).toContain('/connexion/ /connexion 301');
    expect(lines.some((line) => line.startsWith('/ '))).toBe(false);
    // Cloudflare refuses the whole file past 2 000 static rules.
    expect(lines.length).toBeLessThan(2000);
  });

  it('dates each page in the sitemap by its own source files, unless it carries its own date', () => {
    // A blog article is dated by its own fields; the build dates every other page from git.
    for (const page of PUBLIC_PAGES.filter((item) => !item.lastmod)) {
      const files = pageSources(page.path);
      expect(files, page.path).toBeDefined();
      for (const file of files!) expect(existsSync(resolve(__dirname, '..', file)), file).toBe(true);
    }
    const dated = sitemap(PUBLIC_PAGES.map((page) => (page.path === '/' ? { ...page, lastmod: '2026-10-31' } : page)));
    expect(dated).toContain(`<url><loc>${ORIGIN}/</loc><lastmod>2026-10-31</lastmod></url>`);
    expect(dated).toContain(`<url><loc>${ORIGIN}/glossaire</loc></url>`);
  });

  it('gives every page a share image with its size and alt text, and each notion its own', () => {
    const tag = (head: string, attr: string, key: string) =>
      head.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)" />`))?.[1];
    for (const page of PUBLIC_PAGES) {
      const head = headFor(page);
      const image = tag(head, 'property', 'og:image');
      expect(image, page.path).toBe(`${ORIGIN}${shareImagePath(page)}`);
      expect(tag(head, 'name', 'twitter:image')).toBe(image);
      expect(tag(head, 'property', 'og:image:width')).toBe('1200');
      expect(tag(head, 'property', 'og:image:height')).toBe('630');
      expect(tag(head, 'property', 'og:image:type')).toBe('image/png');
      expect(tag(head, 'property', 'og:image:alt')?.length).toBeGreaterThan(20);
      expect(tag(head, 'name', 'twitter:image:alt')).toBe(tag(head, 'property', 'og:image:alt'));
      expect(tag(head, 'name', 'twitter:card')).toBe('summary_large_image');
      expect(tag(head, 'name', 'robots')).toBe('index, follow');
    }
    for (const notion of NOTIONS) {
      const page = PUBLIC_PAGES.find((item) => item.path === `/glossaire/${notion.slug}`)!;
      expect(shareImagePath(page)).toBe(`/og/glossaire/${notion.slug}.png`);
      expect(page.share).toMatchObject({ title: notion.nom, text: notion.resume });
    }
    for (const path of ['/', '/enseignants', '/classe', '/transparence', '/glossaire']) {
      const page = PUBLIC_PAGES.find((item) => item.path === path)!;
      expect(shareImagePath(page), path).toBe(path === '/' ? '/og.png' : `/og${path}.png`);
    }
    expect(shareImagePath(PUBLIC_PAGES.find((item) => item.path === '/mentions-legales')!)).toBe('/og.png');
  });

  it('writes a page for every address the app answers, so any other is a 404', () => {
    // Cloudflare answers an address with no file with 404.html (server/wrangler.jsonc):
    // a route of App.tsx the build writes no page for would be a 404 in production.
    const routes = [...readFileSync(resolve(__dirname, '../src/App.tsx'), 'utf8').matchAll(/(?:case |route === )'(\/[^']*)'/g)].map(
      (match) => match[1],
    );
    const written = new Set([...PUBLIC_PAGES.map((page) => page.path), ...APP_PATHS, '/tarifs']);
    // The owner's page is the one route served as the 404 on purpose.
    expect(written.has(OWNER_PATH)).toBe(false);
    expect(sitemap()).not.toContain(OWNER_PATH);
    expect(readFileSync(resolve(__dirname, '../public/robots.txt'), 'utf8')).not.toContain(OWNER_PATH);
    for (const route of routes) expect(written.has(route), route).toBe(true);
    for (const path of APP_PATHS) expect(routes, path).toContain(path);
    for (const path of APP_PATHS) expect(PUBLIC_PAGES.map((page) => page.path)).not.toContain(path);

    expect(titleFor('/glossaire/inconnu')).toBe(NOT_FOUND_TITLE);
    const head = appHeadFor(NOT_FOUND_TITLE);
    expect(head).toContain('<meta name="robots" content="noindex" />');
    expect(head).not.toContain('rel="canonical"');
    expect(head).toContain(`<meta property="og:image" content="${ORIGIN}/og.png" />`);
    render(<App path="/glossaire/inconnu" />);
    expect(screen.getByText('Page introuvable')).toBeInTheDocument();
  });

  it('keeps the tab title in step with the page as the reader moves around', () => {
    window.history.pushState({}, '', '/enseignants');
    render(<App />);
    expect(document.title).toBe('Squiggle pour les enseignants');
    expect(titleFor('/compte')).toBe(PUBLIC_PAGES[0].title);
  });
});
