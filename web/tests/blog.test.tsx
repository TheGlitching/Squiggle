/**
 * The blog: an article is a file in `src/blog/`, online once its pull request is
 * merged, and a draft is never built. While no article is published, the blog does
 * not exist on the site at all.
 */
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from '../src/App';
import { ALL_ARTICLES, BLOG_OPEN, PUBLISHED, ancre, blogCounter, blogPath, type Article, type Bloc, type Texte } from '../src/blog';
import { notion, typo } from '../src/glossaire';
import { ArticlePage } from '../src/pages/Blog';
import { ORIGIN, PUBLIC_PAGES, blogPages, feed, headFor, sitemap } from '../src/seo';

afterEach(() => {
  cleanup();
  window.history.pushState({}, '', '/');
});

const textes = (bloc: Bloc): readonly Texte[] => {
  if ('paragraphe' in bloc) return [bloc.paragraphe];
  if ('liste' in bloc) return bloc.liste;
  if ('etapes' in bloc) return bloc.etapes;
  if ('encadre' in bloc) return bloc.encadre.points;
  if ('tableau' in bloc) return bloc.tableau.lignes.flat();
  if ('questions' in bloc) return bloc.questions.map((item) => item.reponse);
  return [];
};

const links = (item: Article) =>
  item.corps
    .flatMap(textes)
    .flatMap((texte) => (typeof texte === 'string' ? [] : texte.filter((part) => typeof part !== 'string')));

describe('the articles', () => {
  it('are one file each, named by the slug', () => {
    const files = readdirSync(resolve(__dirname, '../src/blog')).map((file) => file.replace(/(\.brouillon)?\.ts$/, ''));
    expect(ALL_ARTICLES.map((item) => item.slug).sort()).toEqual(files.sort());
    expect(new Set(ALL_ARTICLES.map((item) => item.titre)).size).toBe(ALL_ARTICLES.length);
  });

  it.each(ALL_ARTICLES.map((item) => [item.slug, item] as const))('%s is complete and links only to pages that exist', (_, item) => {
    expect(item.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(item.description.length).toBeLessThanOrEqual(160);
    // Three lines on the share card, well under the 110 characters Google keeps of a headline.
    expect(item.titre.length).toBeLessThanOrEqual(80);
    for (const day of [item.publie, item.misAJour ?? item.publie]) {
      expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10)).toBe(day);
    }
    expect(item.notions.length).toBeGreaterThan(0);
    for (const slug of item.notions) expect(notion(slug), slug).toBeDefined();
    const pages = new Set([...PUBLIC_PAGES.map((page) => page.path), ...ALL_ARTICLES.map((other) => blogPath(other.slug))]);
    for (const link of links(item)) expect(pages.has(link.vers), link.vers).toBe(true);
  });

  it('gives every published article its counter, which the server accepts', () => {
    for (const item of PUBLISHED) expect(blogCounter(item.slug), item.slug).not.toBeNull();
  });
});

describe('the formatting of an article', () => {
  const item: Article = {
    ...ALL_ARTICLES[0],
    corps: [
      { encadre: { titre: 'L’essentiel', points: ['Un point.', 'Un autre.'] } },
      { sommaire: true },
      { intertitre: 'La méthode' },
      { etapes: ['Lire.', 'Comparer.'] },
      { sousTitre: 'Un cas' },
      { tableau: { legende: 'Les sauts', colonnes: ['Le saut', 'La notion'], lignes: [['Plus de monde', 'Généralisation']] } },
      { intertitre: 'Questions fréquentes' },
      { questions: [{ question: 'Est-ce faux ?', reponse: 'Pas forcément.' }] },
    ],
  };

  it('renders a box, a table of contents to every section, numbered steps, a table and plain questions', () => {
    render(<ArticlePage item={item} />);
    expect(screen.getByRole('complementary', { name: 'L’essentiel' })).toHaveTextContent('Un autre.');
    const sommaire = screen.getByRole('navigation', { name: 'Sommaire' });
    for (const titre of ['La méthode', 'Questions fréquentes']) {
      expect(screen.getByRole('link', { name: titre })).toHaveAttribute('href', `#${ancre(titre)}`);
      expect(screen.getByRole('heading', { level: 2, name: titre })).toHaveAttribute('id', ancre(titre));
    }
    expect(sommaire.querySelectorAll('a')).toHaveLength(2);
    expect(screen.getByText('Comparer.').closest('ol')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 3, name: 'Un cas' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Les sauts' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Plus de monde' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /Est-ce faux/ })).toBeInTheDocument();
  });

  it('anchors a heading without accents or punctuation', () => {
    expect(ancre('Trois façons d’aller trop loin')).toBe('trois-facons-d-aller-trop-loin');
  });
});

describe('a draft', () => {
  const drafts = ALL_ARTICLES.filter((item) => item.brouillon);

  it('exists, to show how an article renders', () => {
    expect(drafts.length).toBeGreaterThan(0);
  });

  it('is never built: no page, no sitemap entry, no feed item, a 404 at its address', () => {
    for (const item of drafts) {
      expect(PUBLIC_PAGES.map((page) => page.path)).not.toContain(blogPath(item.slug));
      expect(sitemap()).not.toContain(blogPath(item.slug));
      expect(feed()).not.toContain(blogPath(item.slug));
      render(<App path={blogPath(item.slug)} />);
      expect(screen.getByText('Page introuvable')).toBeInTheDocument();
      cleanup();
    }
  });

  it('renders as an article, marked as a draft, with the call to analyse and its notions', () => {
    const item = drafts[0];
    render(<ArticlePage item={item} />);
    expect(screen.getByRole('heading', { level: 1, name: typo(item.titre) })).toBeInTheDocument();
    expect(screen.getByText(/cet article n’est pas publié/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Analyser un article' })).toHaveAttribute('href', '/analyser');
    for (const slug of item.notions) {
      expect(screen.getAllByRole('link').some((link) => link.getAttribute('href') === `/glossaire/${slug}`), slug).toBe(true);
    }
  });
});

describe('the blog before its first article', () => {
  it('is not on the site', () => {
    if (PUBLISHED.length) return;
    expect(BLOG_OPEN).toBe(false);
    expect(PUBLIC_PAGES.some((page) => page.path.startsWith('/blog'))).toBe(false);
    render(<App path="/blog" />);
    expect(screen.getByText('Page introuvable')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Blog' })).toBeNull();
  });
});

describe('a published article, for search engines and feed readers', () => {
  // The draft, as it will be once merged.
  const item: Article = { ...ALL_ARTICLES[0], brouillon: false, misAJour: '2026-11-20' };
  const [index, page] = blogPages([item]);

  it('has its page, with an Article schema written by Squiggle and the notions it is about', () => {
    expect(index.path).toBe('/blog');
    expect(page.path).toBe(blogPath(item.slug));
    const [data, trail] = JSON.parse(headFor(page).match(/ld\+json">(.+)<\/script>/)![1])['@graph'];
    expect(data).toMatchObject({
      '@type': 'Article',
      headline: item.titre,
      datePublished: item.publie,
      dateModified: '2026-11-20',
      url: `${ORIGIN}${page.path}`,
      image: `${ORIGIN}/og${page.path}.png`,
      author: { '@type': 'Organization', name: 'Squiggle' },
      inLanguage: 'fr',
    });
    expect(data.about.map((term: { url: string }) => term.url)).toEqual(item.notions.map((slug) => `${ORIGIN}/glossaire/${slug}`));
    // The trail the page shows above its title, ending on the article itself.
    expect(trail).toEqual({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Blog', item: `${ORIGIN}/blog` },
        { '@type': 'ListItem', position: 2, name: item.titre },
      ],
    });
    expect(page.share).toMatchObject({ title: item.titre });
    expect(headFor(page)).toContain(`<link rel="alternate" type="application/rss+xml" title="Le blog de Squiggle" href="${ORIGIN}/blog/rss.xml" />`);
  });

  it('is in the sitemap with the day it last changed', () => {
    const xml = sitemap([index, page]);
    expect(xml).toContain(`<url><loc>${ORIGIN}/blog</loc><lastmod>2026-11-20</lastmod></url>`);
    expect(xml).toContain(`<url><loc>${ORIGIN}${page.path}</loc><lastmod>2026-11-20</lastmod></url>`);
  });

  it('is an item of the RSS feed', () => {
    const xml = feed([item]);
    expect(xml).toContain(`<link>${ORIGIN}${page.path}</link>`);
    expect(xml).toContain(`<pubDate>${new Date(`${item.publie}T00:00:00Z`).toUTCString()}</pubDate>`);
    expect(xml).toContain('<language>fr</language>');
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;)/);
  });
});
