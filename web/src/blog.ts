/**
 * The blog: method articles, each one a reading gesture that ties several glossary
 * notions together. One file per article in `src/blog/`, so an article is written,
 * read and accepted in its own pull request, and goes online when it is merged.
 *
 * The same rules as the glossary hold: every example is a made-up article, no real
 * outlet and no real person is ever named, and no figure, quotation or study appears
 * that the article does not source itself.
 *
 * A draft is a file named `<slug>.brouillon.ts`. It is never built: no page, no
 * sitemap entry, no feed item, and not even its text in the app's script. Only the
 * dev server (`npm run dev`) shows it, at its address, to read it as it will look.
 * Publishing it is renaming it to `<slug>.ts` and setting `publie`.
 */
import { isAudienceMetricName, type AudienceMetricName } from '@squiggle/shared/src/hosted/audience';

import type { Notion } from './glossaire';

/** A link inside a paragraph: a page of the site, written as its path (`/glossaire/faux-dilemme`). */
export interface Lien {
  texte: string;
  vers: string;
}

/** A run of text, with links where it has some. */
export type Texte = string | ReadonlyArray<string | Lien>;

export type Bloc =
  | { intertitre: string }
  /** A subsection under the last `intertitre`. */
  | { sousTitre: string }
  | { paragraphe: Texte }
  | { liste: readonly Texte[] }
  /** Steps to take in order, numbered. */
  | { etapes: readonly Texte[] }
  /** A box set apart from the text: « L’essentiel » under the chapô, or a reminder. One point is a sentence, several a list. */
  | { encadre: { titre: string; points: readonly Texte[] } }
  /** A comparison: a header row, then one row per line, as many cells as columns. */
  | { tableau: { legende: string; colonnes: readonly string[]; lignes: ReadonlyArray<readonly Texte[]> } }
  /** Questions a reader asks, each answered: plain headings and paragraphs, with no FAQ schema. */
  | { questions: ReadonlyArray<{ question: string; reponse: Texte }> }
  /** The table of contents: a link to every `intertitre` of the article. */
  | { sommaire: true }
  /** A made-up article, its fragile passage highlighted, as on a glossary page. */
  | { exemple: Notion['exemple'] };

/** The anchor of an `intertitre`, for the table of contents: `Les mots du saut` as `les-mots-du-saut`. */
export function ancre(intertitre: string): string {
  return intertitre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export interface Article {
  slug: string;
  /** At most 80 characters: three lines on the share card. */
  titre: string;
  /** The title on the carousel's cover, set as large as a notion's name: a few words. */
  titreCourt: string;
  /** For search engines and link previews: at most 160 characters. */
  description: string;
  /** The opening paragraph, under the title. */
  chapo: string;
  /** The day it goes online, `YYYY-MM-DD`: the day its pull request is merged. */
  publie: string;
  /** The day it was last changed in substance, `YYYY-MM-DD`. */
  misAJour?: string;
  /** Set from the file's name: `<slug>.brouillon.ts`. */
  brouillon?: boolean;
  /** The glossary notions it puts to work, by slug: linked at its end, and named in its schema. */
  notions: readonly string[];
  corps: readonly Bloc[];
}

/** Whether this build shows drafts: only the dev server does (`vite.config.ts`). */
const SHOW_DRAFTS: boolean = __BLOG_DRAFTS__;

type Files = Record<string, { default: Article }>;
const FILES: Files = import.meta.glob(['./blog/*.ts', '!./blog/*.brouillon.ts'], { eager: true });
// A production build leaves the drafts out of the app's script altogether.
const DRAFTS: Files = import.meta.env.PROD ? {} : import.meta.glob('./blog/*.brouillon.ts', { eager: true });

/** Every article in the repository, drafts included outside a production build, newest first. */
export const ALL_ARTICLES: readonly Article[] = [
  ...Object.values(FILES).map((file) => file.default),
  ...Object.values(DRAFTS).map((file) => ({ ...file.default, brouillon: true })),
].sort((a, b) => b.publie.localeCompare(a.publie) || a.slug.localeCompare(b.slug));

/** The articles this build puts online. */
export const PUBLISHED: readonly Article[] = ALL_ARTICLES.filter((item) => !item.brouillon);

/** The articles this build shows: the published ones, and the drafts on the dev server. */
export const SHOWN: readonly Article[] = SHOW_DRAFTS ? ALL_ARTICLES : PUBLISHED;

/** Until one article is published, the blog does not exist: no index, no link, no feed. */
export const BLOG_OPEN = SHOWN.length > 0;

export const BLOG_PATH = '/blog';
export const FEED_PATH = '/blog/rss.xml';
export const blogPath = (slug: string) => `${BLOG_PATH}/${slug}`;

export function article(slug: string): Article | undefined {
  return SHOWN.find((item) => item.slug === slug);
}

/**
 * The counter an article's call to analyse bumps (`POST /web/count`), one per
 * article: `blog_sondage_quatre_questions` for `sondage-quatre-questions`. The
 * server only counts the closed list of `AUDIENCE_METRIC_NAMES`, so publishing an
 * article adds its name there; a test refuses a published article without one.
 */
export function blogCounter(slug: string): AudienceMetricName | null {
  const name = `blog_${slug.replaceAll('-', '_')}`;
  return isAudienceMetricName(name) ? name : null;
}

/** `2026-11-06` as `6 novembre 2026`. */
export function dateLongue(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
