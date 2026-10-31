/**
 * The changes a piece of substance makes to the repository's own files, as
 * text edits a reviewer reads in the pull request's diff: new examples or
 * synonyms in a glossary notion, a new article file, its counter in the closed
 * list of audience names. Each edit refuses rather than guesses when the file
 * does not look the way it expects: CI would catch a broken file, but a
 * pull request should never need it to.
 */
import type { Article } from '../../../web/src/blog';
import type { Notion } from '../../../web/src/glossaire';

/** A TypeScript single-quoted string, the repository's style. */
export function quote(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
}

const IDENT = /^[A-Za-z_$][\w$]*$/;

/** A value as the repository writes it: one property or element a line, two-space indents. */
export function literal(value: unknown, indent: string): string {
  const inner = `${indent}  `;
  if (typeof value === 'string') return quote(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const short = `[${value.map((v) => literal(v, inner)).join(', ')}]`;
    if (!short.includes('\n') && short.length + indent.length < 100) return short;
    return `[\n${value.map((v) => `${inner}${literal(v, inner)},`).join('\n')}\n${indent}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    return `{\n${entries.map(([k, v]) => `${inner}${IDENT.test(k) ? k : quote(k)}: ${literal(v, inner)},`).join('\n')}\n${indent}}`;
  }
  throw new Error(`valeur impossible à écrire : ${String(value)}`);
}

/** The lines of one notion's object in `glossaire.ts`, found by its slug. */
function notionBlock(lines: string[], slug: string): { start: number; end: number } {
  const at = lines.findIndex((l) => l === `    slug: ${quote(slug)},`);
  if (at < 0) throw new Error(`notion introuvable dans glossaire.ts : ${slug}`);
  let start = at;
  while (start > 0 && lines[start] !== '  {') start -= 1;
  let end = at;
  while (end < lines.length && lines[end] !== '  },') end += 1;
  if (lines[start] !== '  {' || lines[end] !== '  },') throw new Error(`notion ${slug} : forme inattendue`);
  return { start, end };
}

export interface Enrichment {
  exemples?: ReadonlyArray<Notion['exemple']>;
  aussi?: readonly string[];
  description?: string;
}

/** Adds examples, synonyms and a search description to one notion, keeping everything it already says. */
export function enrichNotion(source: string, slug: string, change: Enrichment): string {
  const lines = source.split('\n');
  const { start, end } = notionBlock(lines, slug);
  const block = lines.slice(start, end + 1);
  const find = (prefix: string) => block.findIndex((l) => l.startsWith(prefix));

  if (change.exemples?.length) {
    const entries = change.exemples.map((e) => `      ${literal(e, '      ')},`);
    const reperer = find('    reperer: [');
    if (reperer < 0) throw new Error(`notion ${slug} : pas de champ reperer`);
    const existing = find('    exemples: [');
    if (existing >= 0) {
      if (block[reperer - 1] !== '    ],') throw new Error(`notion ${slug} : exemples mal fermés`);
      block.splice(reperer - 1, 0, ...entries.join('\n').split('\n'));
    } else {
      block.splice(reperer, 0, '    exemples: [', ...entries.join('\n').split('\n'), '    ],');
    }
  }

  if (change.aussi?.length) {
    const at = find('    aussi: [');
    if (at >= 0) {
      const current = [...block[at].matchAll(/'((?:\\'|[^'])*)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
      if (!block[at].endsWith('],')) throw new Error(`notion ${slug} : champ aussi sur plusieurs lignes`);
      const merged = [...current, ...change.aussi.filter((a) => !current.some((c) => c.toLowerCase() === a.toLowerCase()))];
      block[at] = `    aussi: ${literal(merged, '    ')},`;
    } else {
      block.splice(find('    nom: ') + 1, 0, `    aussi: ${literal([...change.aussi], '    ')},`);
    }
  }

  if (change.description && find('    description:') < 0) {
    block.splice(find('    reperer: ['), 0, '    description:', `      ${quote(change.description)},`);
  }

  return [...lines.slice(0, start), ...block, ...lines.slice(end + 1)].join('\n');
}

/** A new article's file, `web/src/blog/<slug>.ts`, in the shape of the ones already there. */
export function articleFile(article: Article): string {
  const { brouillon: _ignored, ...rest } = article;
  void _ignored;
  return `import type { Article } from '../blog';\n\nconst article: Article = ${literal(rest, '')};\n\nexport default article;\n`;
}

/** Publishing a draft: its `publie` date set to the day its pull request is opened. */
export function publishDraft(source: string, date: string): string {
  if (!/^  publie: '\d{4}-\d{2}-\d{2}',$/m.test(source)) throw new Error('brouillon sans champ publie');
  return source.replace(/^  publie: '\d{4}-\d{2}-\d{2}',$/m, `  publie: '${date}',`);
}

/** An article's counter in the closed list (`shared/src/hosted/audience.ts`), as `blogCounter` names it. */
export function addBlogCounter(source: string, slug: string): string {
  const name = `blog_${slug.replaceAll('-', '_')}`;
  if (source.includes(`'${name}'`)) return source;
  const close = source.indexOf('] as const;');
  if (close < 0) throw new Error('audience.ts : liste introuvable');
  return `${source.slice(0, close)}  ${quote(name)},\n${source.slice(close)}`;
}
