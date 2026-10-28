/**
 * A pasted article, from the textarea to the blocks the engine reads.
 *
 * The extension cuts a page into blocks from its markup; a paste has none, so
 * every non-empty line is a paragraph and the title, when there is one, is the
 * first block. That keeps the title inside the text fingerprint (two pastes
 * under different titles are two texts) and inside what the audit can quote,
 * so a finding about the title is highlighted in it like any other.
 *
 * The limits mirror `server/src/analyze/schemas.ts`, so a text the server
 * would refuse is stopped here with a sentence instead of a 400. The article
 * cap is the server's own constant, from the shared workspace.
 */
import type { TextBlock } from '../../shared/src/engine/types';
import { articleLength, MAX_ARTICLE_CHARS } from '../../shared/src/hosted/limits';
import { readTranscript, timeAt, type Start } from './transcript';

/** Below this, the paste is a link or a title, not an article. */
export const MIN_TEXT_CHARS = 200;
const MAX_BLOCK_CHARS = 20_000;
const MAX_BLOCKS = 2_000;
export const MAX_TITLE_CHARS = 500;

export interface PastedArticle {
  title: string;
  /** The article's address, kept as metadata only: nothing ever fetches it. */
  source: string;
  text: string;
}

export const EMPTY_ARTICLE: PastedArticle = { title: '', source: '', text: '' };

/** A line longer than one block is cut after a sentence, never inside a word. */
function splitLongLine(line: string): string[] {
  const parts: string[] = [];
  let rest = line;
  while (rest.length > MAX_BLOCK_CHARS) {
    const window = rest.slice(0, MAX_BLOCK_CHARS);
    // After the last sentence in the window, unless that leaves most of it empty.
    const sentence = window.lastIndexOf('. ');
    const cut = sentence > MAX_BLOCK_CHARS / 2 ? sentence + 1 : window.lastIndexOf(' ');
    const at = cut > 0 ? cut + 1 : MAX_BLOCK_CHARS;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/**
 * The engine's blocks for a paste, and for a video's transcript where each of
 * its passages starts in each block, by block id. `charStart` places each block
 * in the text the blocks spell when joined by a blank line, which is what the
 * validator offsets a finding's quote against.
 */
export function readPaste(article: Pick<PastedArticle, 'title' | 'text'>): {
  blocks: TextBlock[];
  times: Record<string, Start[]> | null;
} {
  const blocks: TextBlock[] = [];
  const times: Record<string, Start[]> = {};
  let offset = 0;
  const push = (type: TextBlock['type'], text: string) => {
    const id = `b${blocks.length + 1}`;
    blocks.push({ id, type, text, charStart: offset });
    offset += text.length + 2;
    return id;
  };
  const title = article.title.trim();
  if (title) push('heading', title);

  const transcript = readTranscript(article.text);
  if (!transcript) {
    for (const line of article.text.split(/\r?\n/)) {
      const trimmed = line.replace(/\s+/g, ' ').trim();
      if (trimmed) for (const part of splitLongLine(trimmed)) push('paragraph', part);
    }
    return { blocks, times: null };
  }
  for (const paragraph of transcript) {
    // A part of a cut paragraph keeps the starts that fall in it, and the time it opens on.
    let from = 0;
    for (const part of splitLongLine(paragraph.text)) {
      from = paragraph.text.indexOf(part, from);
      const inside = paragraph.starts
        .filter((s) => s.offset > from && s.offset < from + part.length)
        .map((s) => ({ offset: s.offset - from, at: s.at }));
      times[push('paragraph', part)] = [{ offset: 0, at: timeAt(paragraph.starts, from) }, ...inside];
      from += part.length;
    }
  }
  return { blocks, times };
}

export function blocksFromPaste(article: Pick<PastedArticle, 'title' | 'text'>): TextBlock[] {
  return readPaste(article).blocks;
}

/** The characters the analysis reads: a transcript's speech, without its times. */
export function pastedChars(text: string): number {
  const transcript = readTranscript(text);
  return transcript ? transcript.reduce((sum, p) => sum + p.text.length, 0) : text.trim().length;
}

export type PasteProblem = 'too_short' | 'too_long' | 'too_many_lines' | 'title_too_long' | 'bad_source';

/** What stops this paste from being analysed, if anything. */
export function pasteProblem(article: PastedArticle): PasteProblem | null {
  if (pastedChars(article.text) < MIN_TEXT_CHARS) return 'too_short';
  const blocks = blocksFromPaste(article);
  // Counted as the server counts it, on the blocks it will receive.
  if (articleLength(blocks) > MAX_ARTICLE_CHARS) return 'too_long';
  if (article.title.trim().length > MAX_TITLE_CHARS) return 'title_too_long';
  if (blocks.length > MAX_BLOCKS) return 'too_many_lines';
  if (article.source.trim() && !webAddress(article.source)) return 'bad_source';
  return null;
}

export const PASTE_PROBLEMS: Record<PasteProblem, string> = {
  too_short: `Collez le texte complet de l’article : au moins ${MIN_TEXT_CHARS} caractères.`,
  too_long: `Ce texte dépasse ${MAX_ARTICLE_CHARS.toLocaleString('fr-FR')} caractères. Collez l’article seul, sans les commentaires ni le reste de la page.`,
  too_many_lines: 'Ce texte compte trop de lignes. Collez l’article seul, sans le reste de la page.',
  title_too_long: `Le titre dépasse ${MAX_TITLE_CHARS} caractères.`,
  bad_source: 'L’adresse source doit commencer par https:// ou http://.',
};

/** The string as an http(s) address, or null. */
export function webAddress(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Elements a copied page breaks lines on; everything else runs on inline. */
const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'dd', 'div', 'dl', 'dt', 'figcaption', 'figure', 'footer',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'ol', 'p', 'pre', 'section', 'table',
  'td', 'th', 'tr', 'ul',
]);
const SKIPPED_TAGS = new Set(['head', 'noscript', 'script', 'style', 'template', 'title']);

/**
 * Copied markup as the text a plain paste would give: one line per paragraph,
 * heading or list item, scripts and styles left out. Some pages and apps put
 * only `text/html` on the clipboard, which a textarea would paste as nothing.
 */
export function textFromHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let out = '';
  const walk = (node: Node): void => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === Node.TEXT_NODE) {
        // A line break in the markup's source is a space, as on screen.
        out += (child.nodeValue ?? '').replace(/\s+/g, ' ');
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = (child as Element).tagName.toLowerCase();
        if (SKIPPED_TAGS.has(tag)) continue;
        if (tag === 'br') {
          out += '\n';
          continue;
        }
        const block = BLOCK_TAGS.has(tag);
        if (block) out += '\n';
        walk(child);
        if (block) out += '\n';
      }
    }
  };
  walk(doc.body);
  return out
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

export type Copied = { kind: 'text'; text: string } | { kind: 'empty' } | { kind: 'refused' };

/**
 * What the reader copied, read in the tap on "Coller le texte copié". Plain
 * text first, the copied markup turned into text when the plain part is
 * missing or blank. `refused` covers a browser without the API and a reader or
 * system that said no; `empty` is a clipboard with no text this page may see,
 * which on a phone is often not the reader's doing, so neither is a dead end.
 */
export async function readCopied(clipboard: Clipboard | undefined): Promise<Copied> {
  if (!clipboard) return { kind: 'refused' };
  try {
    if (typeof clipboard.read === 'function') {
      const items = await clipboard.read();
      for (const type of ['text/plain', 'text/html']) {
        for (const item of items) {
          if (!item.types.includes(type)) continue;
          const raw = await (await item.getType(type)).text();
          const text = (type === 'text/html' ? textFromHtml(raw) : raw).trim();
          if (text) return { kind: 'text', text };
        }
      }
      return { kind: 'empty' };
    }
    if (typeof clipboard.readText !== 'function') return { kind: 'refused' };
    const text = (await clipboard.readText()).trim();
    return text ? { kind: 'text', text } : { kind: 'empty' };
  } catch {
    return { kind: 'refused' };
  }
}

/** A share that is only an address: Android often puts the link in `text`. */
const LONE_URL = /^\s*(https?:\/\/\S+)\s*$/i;
/** An address at the end of shared text, as news apps send "headline https://…". */
const TRAILING_URL = /\s+(https?:\/\/\S+)\s*$/i;

/**
 * What a "Partager vers Squiggle" puts in the form (Web Share Target, GET).
 * The address only ever lands in the source field; it is never followed. A
 * share without text leaves the text empty, and the page asks for a paste.
 */
export function articleFromShare(params: URLSearchParams): Partial<PastedArticle> | null {
  const sharedTitle = params.get('title')?.trim() ?? '';
  let text = params.get('text')?.trim() ?? '';
  let source = params.get('url')?.trim() ?? '';
  if (!sharedTitle && !text && !source) return null;

  const lone = LONE_URL.exec(text);
  if (lone) {
    source ||= lone[1];
    text = '';
  } else {
    const trailing = TRAILING_URL.exec(text);
    if (trailing) {
      source ||= trailing[1];
      text = text.slice(0, trailing.index).trim();
    }
  }

  // A short one-line share is a headline, not an article: it is the title.
  const headline = !sharedTitle && !text.includes('\n') && text.length < MIN_TEXT_CHARS;
  return {
    title: headline ? text : sharedTitle,
    source: webAddress(source) ?? '',
    text: headline ? '' : text,
  };
}

/**
 * Where a share's fields are: in the query string from "Partager vers Squiggle",
 * or after the `#` from the iPhone shortcut (`web/shortcut/`), as
 * `#title=…&text=…&url=…`. A fragment never reaches a server, so the
 * shortcut's article goes from the reader's phone to this page and nowhere else.
 */
export function sharedParams(location: Pick<Location, 'search' | 'hash'>): URLSearchParams {
  return new URLSearchParams(location.hash.length > 1 ? location.hash.slice(1) : location.search);
}

/** Below this, a line is too short to be told apart from another one like it ("Publicité", a time). */
const SAME_LINE_CHARS = 40;
/** The shortest run of words two copies must share to be one passage cut in two. */
const MIN_OVERLAP_CHARS = 20;

/** Where `next` picks up the end of `line`, as a copy that starts inside the paragraph the last one ended in. */
function overlap(line: string, next: string): number {
  for (let size = Math.min(line.length, next.length); size >= MIN_OVERLAP_CHARS; size--) {
    if (line.endsWith(next.slice(0, size))) return size;
  }
  return 0;
}

/**
 * The text with one more passage copied after it ("Ajouter la suite"): an
 * app that only lets the reader select what is on screen is copied a screen
 * at a time, and two copies overlap. What the new passage repeats at its
 * start is dropped, the paragraph the last copy cut short is completed, and a
 * long line already in the text is not added twice.
 */
export function appendPaste(current: string, added: string): string {
  const clean = (text: string) =>
    text
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  const lines = clean(current);
  const next = clean(added);

  // The overlap at the start of the new passage.
  while (next.length && lines.length) {
    const first = next[0];
    const lastIndex = lines.length - 1;
    const last = lines[lastIndex];
    const long = first.length >= MIN_OVERLAP_CHARS;
    if (lines.some((line) => line === first || (long && line.includes(first)))) {
      next.shift();
    } else if (last.length >= MIN_OVERLAP_CHARS && first.includes(last)) {
      // The last copy stopped inside this paragraph: the new one has all of it.
      lines[lastIndex] = first;
      next.shift();
    } else {
      const shared = overlap(last, first);
      if (shared) {
        lines[lastIndex] = last + first.slice(shared);
        next.shift();
      }
      break;
    }
  }
  for (const line of next) {
    if (line.length >= SAME_LINE_CHARS && lines.includes(line)) continue;
    lines.push(line);
  }
  return lines.join('\n');
}

const DRAFT_KEY = 'squiggle:texte-a-analyser';

/**
 * The paste waits in this browser while the reader signs in: the round trip
 * through Google or an emailed link leaves the page, and a reader who loses a
 * long paste to a sign-in does not paste it twice. It never leaves the device.
 */
export function loadDraft(): PastedArticle {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY_ARTICLE;
    const parsed = JSON.parse(raw) as Partial<PastedArticle>;
    return {
      title: typeof parsed.title === 'string' ? parsed.title : '',
      source: typeof parsed.source === 'string' ? parsed.source : '',
      text: typeof parsed.text === 'string' ? parsed.text : '',
    };
  } catch {
    return EMPTY_ARTICLE;
  }
}

export function saveDraft(article: PastedArticle): void {
  try {
    if (!article.title && !article.source && !article.text) localStorage.removeItem(DRAFT_KEY);
    else localStorage.setItem(DRAFT_KEY, JSON.stringify(article));
  } catch {
    // Storage full or blocked: the paste still works, it just does not survive a reload.
  }
}
