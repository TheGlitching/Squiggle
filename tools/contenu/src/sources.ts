/**
 * What a post may be drawn from: a glossary notion, a published article, or a
 * page of the site. Each source carries its full text, which is the authority
 * the filter checks every number of a post against (rule 1), and the image a
 * post shows: the page's carousel when the build drew one, its share card
 * otherwise. A source is only ever used once its page answers 200.
 */
import type { Article, Bloc, Texte } from '../../../web/src/blog';
import { FAMILLES, NOTIONS, type Notion, type Segments } from '../../../web/src/glossaire';
import { ARTICLES } from './articles';
import { ORIGIN } from './config';
import type { Ctx } from './context';

export type SourceKind = 'notion' | 'article' | 'page';

export interface Source {
  /** `glossaire/faux-dilemme`, `blog/conclusion-hative`, `page/enseignants`. */
  id: string;
  kind: SourceKind;
  path: string;
  title: string;
  /** Everything the page says, flattened: what the drafting reads and the filter checks against. */
  text: string;
  notion?: Notion;
  article?: Article;
}

export interface Image {
  url: string;
  alt: string;
}

export const flat = (segments: Segments): string => segments.map((s) => (typeof s === 'string' ? s : s[0])).join('');
const texte = (t: Texte): string => (typeof t === 'string' ? t : t.map((p) => (typeof p === 'string' ? p : p.texte)).join(''));

function exempleText(e: Notion['exemple'], label: string): string {
  return [`${label}, rubrique ${e.rubrique} : « ${flat(e.titre)} »`, flat(e.texte), `Ce qui cloche : ${e.lecture}`].join('\n');
}

export function notionSource(n: Notion): Source {
  const famille = FAMILLES.find((f) => f.id === n.famille)?.titre ?? n.famille;
  const text = [
    `${n.nom}${n.aussi?.length ? ` (aussi : ${n.aussi.join(', ')})` : ''}, famille « ${famille} »`,
    n.resume,
    ...n.definition,
    exempleText(n.exemple, 'Exemple'),
    ...(n.exemples ?? []).map((e, i) => exempleText(e, `Autre exemple ${i + 1}`)),
    `Comment le repérer :\n${n.reperer.map((r) => `- ${r}`).join('\n')}`,
    `La question : ${n.question}`,
  ].join('\n\n');
  return { id: `glossaire/${n.slug}`, kind: 'notion', path: `/glossaire/${n.slug}`, title: n.nom, text, notion: n };
}

function blocText(b: Bloc): string {
  if ('intertitre' in b) return `\n${b.intertitre}`;
  if ('sousTitre' in b) return b.sousTitre;
  if ('paragraphe' in b) return texte(b.paragraphe);
  if ('liste' in b) return b.liste.map((t) => `- ${texte(t)}`).join('\n');
  if ('etapes' in b) return b.etapes.map((t, i) => `${i + 1}. ${texte(t)}`).join('\n');
  if ('encadre' in b) return `${b.encadre.titre} :\n${b.encadre.points.map((t) => `- ${texte(t)}`).join('\n')}`;
  if ('tableau' in b) return [b.tableau.legende, b.tableau.colonnes.join(' | '), ...b.tableau.lignes.map((l) => l.map(texte).join(' | '))].join('\n');
  if ('questions' in b) return b.questions.map((q) => `${q.question}\n${texte(q.reponse)}`).join('\n');
  if ('exemple' in b) return exempleText(b.exemple, 'Exemple');
  return '';
}

export function articleSource(a: Article): Source {
  const text = [a.titre, a.description, a.chapo, ...a.corps.map(blocText)].filter(Boolean).join('\n\n');
  return { id: `blog/${a.slug}`, kind: 'article', path: `/blog/${a.slug}`, title: a.titre, text, article: a };
}

export const NOTION_SOURCES: readonly Source[] = NOTIONS.map(notionSource);
export const ARTICLE_SOURCES: readonly Source[] = [...ARTICLES].sort((a, b) => b.publie.localeCompare(a.publie)).map(articleSource);

/** The site's own pages a "product" or "teachers" post may point to. Legal pages never. */
export const PRODUCT_PAGES = ['/analyser', '/favori', '/transparence', '/'] as const;
export const TEACHER_PAGES = ['/enseignants', '/classe', '/enseignants/exercices', '/enseignants/grille-lecture'] as const;

/** A page's visible text, without markup: enough to check a post against what the page says. */
export function htmlText(html: string): { title: string; description: string; text: string } {
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? '';
  const description = /<meta name="description" content="([^"]*)"/i.exec(html)?.[1] ?? '';
  const body = (/<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html)
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|h[1-6]|li|div|section|blockquote|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const decode = (s: string) =>
    s
      .replace(/&nbsp;/g, '\u00a0')
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  const text = decode(body)
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  return { title: decode(title).replace(/ - Squiggle$/, ''), description: decode(description), text };
}

/** Whether a page of the site answers 200 right now. */
export async function online(ctx: Pick<Ctx, 'fetch'>, path: string): Promise<boolean> {
  try {
    const response = await ctx.fetch(`${ORIGIN}${path}`, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(20_000) });
    return response.status === 200;
  } catch {
    return false;
  }
}

/** A page of the site as a source, read live. */
export async function pageSource(ctx: Pick<Ctx, 'fetch'>, path: string): Promise<Source | null> {
  const response = await ctx.fetch(`${ORIGIN}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
  if (response.status !== 200) return null;
  const page = htmlText(await response.text());
  return { id: `page${path === '/' ? '/accueil' : path}`, kind: 'page', path, title: page.title, text: [page.title, page.description, page.text].join('\n\n') };
}

/**
 * The images a post on this source shows: the carousel's slides when the build
 * drew them (`/og/social/<slug>/slides.json`), else the page's share card,
 * else none; and the story drawn beside the carousel (`story.json`), if any. The alternative text always comes from the site, never the model.
 */
export async function imagesFor(ctx: Pick<Ctx, 'fetch'>, source: Source): Promise<{ slides: Image[]; card: Image | null; story: Image | null }> {
  const slug = source.path.split('/').pop();
  let slides: Image[] = [];
  let story: Image | null = null;
  if (source.kind !== 'page' && slug) {
    try {
      const response = await ctx.fetch(`${ORIGIN}/og/social/${slug}/slides.json`, { signal: AbortSignal.timeout(20_000) });
      if (response.ok) {
        const list = (await response.json()) as Array<{ image: string; alt: string }>;
        slides = list.filter((s) => s.image?.startsWith('/og/social/') && s.alt).map((s) => ({ url: `${ORIGIN}${s.image}`, alt: s.alt }));
      }
      // The 9:16 story the build draws beside the carousel, with its own text.
      const storyJson = await ctx.fetch(`${ORIGIN}/og/social/${slug}/story.json`, { signal: AbortSignal.timeout(20_000) });
      if (storyJson.ok) {
        const s = (await storyJson.json()) as { image: string; alt: string };
        if (s.image?.startsWith('/og/social/') && s.alt) story = { url: `${ORIGIN}${s.image}`, alt: s.alt };
      }
    } catch {
      slides = [];
    }
  }
  // The share card is the one the page itself declares, with the alternative text the build wrote for it.
  let card: Image | null = null;
  const response = await ctx.fetch(`${ORIGIN}${source.path}`, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
  if (response.status === 200) {
    const html = await response.text();
    const url = /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1];
    const alt = /<meta property="og:image:alt" content="([^"]+)"/.exec(html)?.[1];
    if (url?.startsWith(`${ORIGIN}/`) && alt) card = { url, alt: htmlText(`<body>${alt}</body>`).text };
  }
  return { slides, card, story };
}
