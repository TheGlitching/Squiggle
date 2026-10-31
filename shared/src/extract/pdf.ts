/**
 * The text of a PDF, read on the reader's device with pdf.js, as an article's
 * headings and paragraphs.
 *
 * The site (`web/src/pdf.ts`) and the extension (`src/pdf/main.ts`) both read
 * a PDF this way, each with its own copy of pdf.js, which it hands to
 * `readPdf`: the file never leaves the device, only its text does, as a paste.
 *
 * pdf.js gives each page's runs of text in the order the file draws them,
 * which for a report or a newspaper page is the reading order, columns
 * included, and each run's position and height. `pdfBlocks` puts the runs back
 * into lines and the lines into paragraphs: a blank wider than the usual one
 * between two lines, or a change of type size, starts a new one, and a
 * paragraph carries over a column or a page while its sentence is not over.
 * The running header and footer, repeated at the same edge of the pages, and
 * the page numbers are dropped, as is the small print of figures and notes.
 */
import { MAX_ARTICLE_CHARS } from '../hosted/limits';

/** One run of text as pdf.js gives it, in the page's own units, `y` up from the bottom. */
export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfBlock {
  type: 'heading' | 'paragraph';
  text: string;
  /** The page it starts on, from 1. */
  page: number;
}

interface Line {
  text: string;
  x: number;
  y: number;
  height: number;
  /** A footnote's first line: it opens on the note's number, set small and raised. */
  note?: boolean;
}

/** Larger than the body by this much, a line is a heading's. */
const HEADING_RATIO = 1.1;
/** Smaller than the body by this much, it is a figure's label or a note: dropped. */
const SMALL_PRINT_RATIO = 0.85;
/** A blank this many times the type size between two lines ends a paragraph. */
const PARAGRAPH_GAP = 1.5;
/** ...and a heading's lines, set larger and wider apart, this many while no sentence ends. */
const HEADING_GAP = 2.5;
/** A heading longer than this is a paragraph set large (an introduction). */
const MAX_HEADING_CHARS = 200;
/** How many lines from each edge of a page can be its running header or footer. */
const EDGE_LINES = 2;
/** How far back, after a jump, a paragraph left mid-sentence can still be taken up. */
const LOOKBACK_BLOCKS = 12;

const ENDS_SENTENCE = /[.!?…:;»"”)]$/;
const OPENS_SENTENCE = /^[\p{Lu}\d«"“(•–—-]/u;
/** A table of contents' line: dot leaders, then a page number. */
const CONTENTS_LINE = /(?:\.\s?){4,}\s*\d+$/;
/** This many such lines, and the page is a table of contents. */
const CONTENTS_PAGE_LINES = 3;
const PAGE_NUMBER = /^(?:page\s*)?\d{1,4}(?:\s*(?:\/|sur)\s*\d{1,4})?$/i;

/** The runs of one page, joined into lines, top to bottom in reading order. */
function linesOf(items: readonly PdfTextItem[]): Line[] {
  const lines: Line[] = [];
  let line: (Line & { end: number }) | null = null;
  for (let item of items) {
    // Symbol fonts map their glyphs (bullets, arrows) to private code points no reader can show.
    item = { ...item, str: item.str.replace(/\p{Co}/gu, '') };
    if (!item.str.trim()) {
      // A run of spaces still separates the words around it.
      if (line && item.str && !line.text.endsWith(' ')) line.text += ' ';
      continue;
    }
    const height: number = item.height || line?.height || 1;
    // A superscript (1er, a note's call) sits higher and smaller, on the same line.
    const raised = line && height < line.height * SMALL_PRINT_RATIO && item.y >= line.y - line.height * 0.3 && item.y <= line.y + line.height;
    if (line && (Math.abs(item.y - line.y) < Math.max(height, line.height) / 2 || raised)) {
      const gap = item.x - line.end;
      if (gap > height * 0.15 && !line.text.endsWith(' ') && !item.str.startsWith(' ')) line.text += ' ';
      if (/^\d{1,3}$/.test(line.text.trim()) && line.height < height * SMALL_PRINT_RATIO) {
        // The line sits on its text, not on the raised number.
        line.note = true;
        line.y = item.y;
      }
      line.text += item.str;
      line.end = Math.max(line.end, item.x + item.width);
      if (!raised) line.height = Math.max(line.height, height);
      continue;
    }
    line = { text: item.str, x: item.x, y: item.y, height, end: item.x + item.width };
    lines.push(line);
  }
  return lines
    .map(({ text, x, y, height, note }) => ({ text: text.replace(/\s+/g, ' ').trim(), x, y, height, note }))
    .filter((l) => l.text);
}

/** A line's key from one page to the next: the page number changes, the words do not. */
const edgeKey = (text: string) => text.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ');

/** Each page without its running header and footer, and without its page number. */
function withoutRunningLines(pages: Line[][]): Line[][] {
  const edges = (lines: Line[]) => [...lines.slice(0, EDGE_LINES), ...lines.slice(-EDGE_LINES)];
  const seen = new Map<string, number>();
  for (const lines of pages) {
    for (const key of new Set(edges(lines).map((l) => edgeKey(l.text)))) seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const needed = Math.max(2, Math.ceil(pages.length / 2));
  return pages.map((lines) => {
    const edge = new Set(edges(lines));
    return lines.filter((l) => !edge.has(l) || (!PAGE_NUMBER.test(l.text) && (seen.get(edgeKey(l.text)) ?? 0) < needed));
  });
}

/** The size most of the text is set in, weighted by length. */
function bodySize(lines: Line[]): number {
  const bySize = new Map<number, number>();
  for (const l of lines) {
    const size = Math.round(l.height * 2) / 2;
    bySize.set(size, (bySize.get(size) ?? 0) + l.text.length);
  }
  let body = 0;
  let most = -1;
  for (const [size, chars] of bySize) {
    if (chars > most) [body, most] = [size, chars];
  }
  return body;
}

const sameSize = (a: number, b: number) => Math.abs(a - b) <= Math.max(a, b) * 0.1;

/** A word cut at the end of a line ("infor-" then "mation") is one word again. */
function join(before: string, after: string): string {
  return /\p{L}[-‐‑]$/u.test(before) && /^\p{Ll}/u.test(after) ? before.slice(0, -1) + after : `${before} ${after}`;
}

/** The headings and paragraphs of a PDF, from the runs of each of its pages. */
export function pdfBlocks(pages: readonly (readonly PdfTextItem[])[]): PdfBlock[] {
  const lined = withoutRunningLines(pages.map(linesOf));
  const body = bodySize(lined.flat());
  const blocks: Array<{ text: string; size: number; page: number; note?: boolean }> = [];
  let previous: Line | null = null;
  /** The block the previous line went into, which is not always the last one. */
  let current: (typeof blocks)[number] | undefined;
  for (const [index, lines] of lined.entries()) {
    // A table of contents, whose entries run over two lines, says nothing the headings do not.
    if (lines.filter((l) => CONTENTS_LINE.test(l.text)).length >= CONTENTS_PAGE_LINES) continue;
    let pageStart = true;
    for (const line of lines) {
      if (line.height < body * SMALL_PRINT_RATIO || CONTENTS_LINE.test(line.text)) continue;
      // A footnote starts a block of its own, which nothing outside it carries on.
      const last = line.note || current?.note ? undefined : current;
      let into: (typeof blocks)[number] | undefined;
      const gap = previous ? previous.y - line.y : 0;
      const usual = previous ? Math.max(line.height, previous.height) : 0;
      if (pageStart || gap <= 0 || gap > usual * 3) {
        // A jump to another column or page, perhaps past a figure's title: a sentence left
        // open just before goes on here, as does one left open a little earlier if this
        // line does not start a new one.
        const open = blocks
          .slice(-LOOKBACK_BLOCKS)
          .reverse()
          .find((b) => !b.note && sameSize(b.size, line.height) && b.size < body * HEADING_RATIO && !ENDS_SENTENCE.test(b.text));
        if (line.note) into = undefined;
        else if (open && (open === last || !/^\p{Lu}/u.test(line.text))) into = open;
        else if (last && sameSize(last.size, line.height) && !OPENS_SENTENCE.test(line.text)) into = last;
      } else if (current?.note && !line.note && sameSize(current.size, line.height) && gap <= usual * PARAGRAPH_GAP) {
        // The note's next line.
        into = current;
      } else if (
        last &&
        sameSize(last.size, line.height) &&
        gap <= usual * (line.height >= body * HEADING_RATIO && !ENDS_SENTENCE.test(last.text) ? HEADING_GAP : PARAGRAPH_GAP)
      ) {
        into = last;
      }
      if (into) into.text = join(into.text, line.text);
      else blocks.push((into = { text: line.text, size: line.height, page: index + 1, note: line.note }));
      current = into;
      previous = line;
      pageStart = false;
    }
  }
  // Footnotes go. Set larger, short, and not a sentence: a heading. A paragraph set large is an introduction.
  return blocks.filter((b) => !b.note).map(({ text, size, page }) => ({
    type: size >= body * HEADING_RATIO && text.length <= MAX_HEADING_CHARS && !/[.!?…]$/.test(text) ? 'heading' : 'paragraph',
    text,
    page,
  }));
}

/** The text of pages `from` to `to`, a block per line, as a paste. */
export function pdfText(blocks: readonly PdfBlock[], from = 1, to = Infinity): string {
  return blocks
    .filter((block) => block.page >= from && block.page <= to)
    .map((block) => block.text)
    .join('\n');
}

/**
 * The last page that keeps pages `from` onwards within one analysis, or `from`
 * itself when that page alone is over: the range a long PDF starts on.
 */
export function pagesThatFit(blocks: readonly PdfBlock[], from: number, pages: number): number {
  let to = from;
  // ponytail: joins the text again for each page, quadratic in pages; a few hundred pages read in milliseconds.
  while (to < pages && pdfText(blocks, from, to + 1).length <= MAX_ARTICLE_CHARS) to++;
  return to;
}

/** The part of pdf.js `readPdf` uses: the site and the extension each hand over their own copy. */
export interface PdfJs {
  getDocument(source: { data: Uint8Array; isEvalSupported?: boolean }): {
    promise: Promise<PdfDocument>;
    destroy(): Promise<void>;
  };
}

export interface PdfDocument {
  numPages: number;
  getMetadata(): Promise<{ info?: unknown }>;
  getPage(number: number): Promise<{
    getTextContent(): Promise<{ items: ReadonlyArray<{ str?: string; transform?: number[]; width?: number; height?: number }> }>;
  }>;
}

export interface ReadPdf {
  title: string;
  blocks: PdfBlock[];
  pages: number;
  /** The document itself, still open for whoever needs its pages next (to read a scan). */
  document: PdfDocument;
  /** Lets the document go: the caller's to call once done with it. */
  close(): Promise<void>;
}

/** A title the file's metadata gives that is only the name of the program or file that made it. */
const NOT_A_TITLE = /^(?:microsoft\s+\w+\s*-|untitled|sans titre|document\d*$)|\.(?:docx?|odt|pdf|indd|qxp)$/i;

/** The PDF's own title when it has a real one, or its first heading. */
function titleOf(info: unknown, blocks: PdfBlock[]): string {
  const meta = typeof info === 'object' && info && 'Title' in info && typeof info.Title === 'string' ? info.Title.trim() : '';
  if (meta && !NOT_A_TITLE.test(meta)) return meta;
  return blocks.find((b) => b.type === 'heading')?.text ?? '';
}

/** The text of a PDF file, read here with the given pdf.js. */
export async function readPdf(pdfjs: PdfJs, data: ArrayBuffer | Uint8Array, signal?: AbortSignal): Promise<ReadPdf> {
  // Eval only speeds up drawing glyphs, which reading text never does.
  const task = pdfjs.getDocument({ data: data instanceof Uint8Array ? data : new Uint8Array(data), isEvalSupported: false });
  const stop = () => void task.destroy();
  signal?.addEventListener('abort', stop);
  try {
    const document = await task.promise;
    const pages: PdfTextItem[][] = [];
    for (let number = 1; number <= document.numPages; number++) {
      const content = await (await document.getPage(number)).getTextContent();
      pages.push(
        content.items.flatMap((item) =>
          typeof item.str === 'string' && item.transform
            ? [{ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width ?? 0, height: item.height ?? 0 }]
            : [],
        ),
      );
    }
    const blocks = pdfBlocks(pages);
    const { info } = await document.getMetadata().catch(() => ({ info: undefined }));
    return { title: titleOf(info, blocks), blocks, pages: document.numPages, document, close: () => task.destroy() };
  } catch (error) {
    await task.destroy().catch(() => {});
    throw error;
  } finally {
    signal?.removeEventListener('abort', stop);
  }
}
