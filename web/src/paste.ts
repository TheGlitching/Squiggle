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
 * The engine's blocks for a paste. `charStart` places each block in the text
 * the blocks spell when joined by a blank line, which is what the validator
 * offsets a finding's quote against.
 */
export function blocksFromPaste(article: Pick<PastedArticle, 'title' | 'text'>): TextBlock[] {
  const blocks: TextBlock[] = [];
  let offset = 0;
  const push = (type: TextBlock['type'], text: string) => {
    blocks.push({ id: `b${blocks.length + 1}`, type, text, charStart: offset });
    offset += text.length + 2;
  };
  const title = article.title.trim();
  if (title) push('heading', title);
  for (const line of article.text.split(/\r?\n/)) {
    const trimmed = line.replace(/\s+/g, ' ').trim();
    if (trimmed) for (const part of splitLongLine(trimmed)) push('paragraph', part);
  }
  return blocks;
}

export type PasteProblem = 'too_short' | 'too_long' | 'too_many_lines' | 'title_too_long' | 'bad_source';

/** What stops this paste from being analysed, if anything. */
export function pasteProblem(article: PastedArticle): PasteProblem | null {
  const text = article.text.trim();
  if (text.length < MIN_TEXT_CHARS) return 'too_short';
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
