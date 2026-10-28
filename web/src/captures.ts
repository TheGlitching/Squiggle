/**
 * Screenshots of an article, from the images to the text the form is given.
 *
 * Some apps let nothing be copied, and a phone has no way for one app to read
 * another: a screenshot is the one thing every app lets the reader take. So
 * the reader imports a few, in reading order, and their text is read here, on
 * the device (Tesseract, in WebAssembly, with its French model served from our
 * own origin, `vite.config.ts`). No image is sent anywhere: what reaches the
 * server is the text, as a paste would.
 *
 * Two screenshots of a scrolled page usually overlap, and each carries the
 * phone's and the app's chrome (status bar, header, tab bar). `stitchCaptures`
 * drops the lines repeated at the same edge of most screenshots, keeps an
 * overlap once, and joins the visual lines back into paragraphs. The result
 * lands in the text field, under the reader's eyes, before anything is
 * analysed: a misread line is theirs to fix.
 */

/** One line of text as the OCR read it on one screenshot. */
export interface CaptureLine {
  text: string;
  /** 0 to 100, Tesseract's confidence in the whole line. */
  confidence: number;
  /** Pixels from the top of the screenshot. */
  top: number;
  bottom: number;
}

/** More than this, and the import is refused rather than left reading for minutes. */
export const MAX_CAPTURES = 30;

/** A line at the screenshot's edge read with less confidence than this is a line cut in half. */
const CUT_LINE_CONFIDENCE = 50;
/** How many lines from each edge can be the phone's or the app's chrome. */
const CHROME_LINES = 4;
/** Two readings of the same line this similar are the same line. */
const SAME_LINE = 0.85;
/** An overlap shorter than this (normalised characters) could be chance. */
const MIN_OVERLAP_CHARS = 25;

/**
 * Lowercase, accents and punctuation off, spaces collapsed: what is left of a
 * line once the OCR's usual hesitations are set aside.
 */
export function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** 1 for equal strings, 0 for nothing in common (Levenshtein, over the longer length). */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}

const same = (a: string, b: string) => similarity(a, b) >= SAME_LINE;

/** A video timestamp alone (`1:02`), which repeats on every screen of a transcript without being chrome. */
const LONE_TIME = /^(?:\d{1,2}:)?\d{1,2}:\d{2}$/;

/**
 * The key a piece of chrome keeps from one screenshot to the next: the clock
 * and the battery change, the words do not.
 */
function chromeKey(text: string): string {
  return normalise(text).replace(/\d/g, '#');
}

/**
 * The lines repeated at the same place of at least half the screenshots, and
 * of two at least: the status bar, the app's header and tab bar, a banner.
 * Chrome stays put while the page scrolls under it, so a line read again at
 * another height, as an overlap is, is never taken for chrome.
 */
function withoutChrome(captures: CaptureLine[][]): CaptureLine[][] {
  if (captures.length < 2) return captures;
  const needed = Math.max(2, Math.ceil(captures.length / 2));
  // Each edge line with its distance to that edge: from the top, or from the lowest line read.
  const edges = (lines: CaptureLine[]) => {
    const floor = Math.max(...lines.map((line) => line.bottom));
    return [
      ...lines.slice(0, CHROME_LINES).map((line) => ({ line, edge: 'top', at: line.top })),
      ...lines.slice(-CHROME_LINES).map((line) => ({ line, edge: 'bottom', at: floor - line.bottom })),
    ];
  };

  const chrome = new Set<CaptureLine>();
  const all = captures.map(edges);
  all.forEach((own, index) => {
    for (const { line, edge, at } of own) {
      const key = chromeKey(line.text);
      if (!key || LONE_TIME.test(line.text.trim())) continue;
      const tolerance = Math.max(10, (line.bottom - line.top) / 2);
      const seen = [line];
      all.forEach((other, otherIndex) => {
        if (otherIndex === index) return;
        const match = other.find(
          (candidate) =>
            candidate.edge === edge && Math.abs(candidate.at - at) <= tolerance && same(chromeKey(candidate.line.text), key),
        );
        if (match) seen.push(match.line);
      });
      if (seen.length >= needed) for (const repeated of seen) chrome.add(repeated);
    }
  });
  return captures.map((lines) => lines.filter((line) => !chrome.has(line)));
}

/**
 * The phone's clock, when the status bar was read on one screenshot only (a
 * dark page often hides it from the OCR): a time at the very top, with no word
 * beside it. A transcript's first timestamp sits below the app's own header.
 */
const STATUS_BAR = /^\d{1,2}[:h]\d{2}\b(?!.*\p{L}{4})/u;
const STATUS_BAR_HEIGHT = 100;

/** Without the status bar, and the half-read lines a screenshot's edges cut through. */
function withoutCutLines(lines: CaptureLine[]): CaptureLine[] {
  let start = lines[0] && lines[0].top < STATUS_BAR_HEIGHT && STATUS_BAR.test(lines[0].text) ? 1 : 0;
  let end = lines.length;
  // ponytail: only from the very edge; a cut line under chrome read on one screenshot only stays, for the reader to delete.
  while (start < end && lines[start].confidence < CUT_LINE_CONFIDENCE) start++;
  while (end > start && lines[end - 1].confidence < CUT_LINE_CONFIDENCE) end--;
  return lines.slice(start, end);
}

/**
 * Where `next` takes over from `previous`: the longest run of lines read on
 * both, ending near the bottom of the one and starting near the top of the
 * other. What `previous` shows after the run is chrome or a cut line, as is
 * what `next` shows before it. `null` when they do not overlap.
 */
function overlap(previous: CaptureLine[], next: CaptureLine[]): { end: number; start: number } | null {
  const a = previous.map((line) => normalise(line.text));
  const b = next.map((line) => normalise(line.text));
  // Room for the chrome left over and a cut line, and for a reader who scrolled little.
  const slack = (length: number) => Math.max(CHROME_LINES, Math.ceil(length / 4));
  let best: { end: number; start: number; chars: number } | null = null;
  // run[j]: how many lines up to a[i] and b[j] match, one after the other.
  let run = new Array<number>(b.length).fill(0);
  let chars = new Array<number>(b.length).fill(0);
  for (let i = 0; i < a.length; i++) {
    const nextRun = new Array<number>(b.length).fill(0);
    const nextChars = new Array<number>(b.length).fill(0);
    for (let j = 0; j < b.length; j++) {
      if (!a[i] || !same(a[i], b[j])) continue;
      nextRun[j] = (j > 0 ? run[j - 1] : 0) + 1;
      nextChars[j] = (j > 0 ? chars[j - 1] : 0) + a[i].length;
      const startsAt = j - nextRun[j] + 1;
      const fits = i >= a.length - slack(a.length) && startsAt < slack(b.length);
      if (fits && nextChars[j] >= MIN_OVERLAP_CHARS && (!best || nextChars[j] > best.chars)) {
        best = { end: i + 1, start: j + 1, chars: nextChars[j] };
      }
    }
    run = nextRun;
    chars = nextChars;
  }
  return best && { end: best.end, start: best.start };
}

/** A line that opens on a video timestamp starts a passage of its own. */
const OPENS_ON_TIME = /^[[(]?(?:\d{1,2}:)?\d{1,2}:\d{2}\b/;
/** A list item's bullet, which the OCR reads as a lone `e` or `•` before a capital. */
const BULLET = /^[•·◦e]\s+(?=\p{Lu})/u;
/** The end of a sentence, so the end of a paragraph if the gap says so. */
const ENDS_SENTENCE = /[.!?…:»"”)]$/;

interface Placed {
  line: CaptureLine;
  /** Whether this line starts a paragraph, from the gap above it on its own screenshot. */
  opens: boolean;
}

/**
 * Each line, and whether a paragraph starts with it: a blank wider than the
 * usual one between two lines, or than a line, says so, as does a timestamp or
 * a bullet.
 */
function paragraphs(lines: CaptureLine[]): Placed[] {
  const blanks = lines
    .slice(1)
    .map((line, index) => line.top - lines[index].bottom)
    .filter((blank) => blank > 0)
    .sort((x, y) => x - y);
  const usual = blanks.length ? blanks[Math.floor(blanks.length / 2)] : 0;
  const heights = lines.map((line) => line.bottom - line.top).sort((x, y) => x - y);
  // Lines are set closer than their own height; a paragraph's blank is at least that.
  const lineHeight = heights.length ? heights[Math.floor(heights.length / 2)] : 0;
  return lines.map((line, index) => ({
    line,
    opens:
      index === 0 ||
      OPENS_ON_TIME.test(line.text.trim()) ||
      BULLET.test(line.text.trim()) ||
      (usual > 0 && line.top - lines[index - 1].bottom > Math.min(usual * 1.5, lineHeight)),
  }));
}

/**
 * The text of a series of screenshots, in the order given: chrome dropped,
 * overlaps kept once, lines joined into paragraphs, one per line of the result.
 */
export function stitchCaptures(captures: CaptureLine[][]): string {
  const cleaned = withoutChrome(captures.map((lines) => [...lines].sort((x, y) => x.top - y.top))).map(withoutCutLines);
  const placed: Placed[] = [];
  let previous: CaptureLine[] | null = null;
  for (const lines of cleaned) {
    if (!lines.length) continue;
    const own = paragraphs(lines);
    const join = previous ? overlap(previous, lines) : null;
    if (join) {
      // What `previous` shows below the overlap is not article text.
      placed.splice(placed.length - (previous!.length - join.end));
      placed.push(...own.slice(join.start));
    } else {
      // A screenshot that starts where the last one stopped continues its sentence, if that one was not over.
      const last = placed.at(-1);
      if (last) {
        own[0].opens = ENDS_SENTENCE.test(last.line.text.trim()) || OPENS_ON_TIME.test(own[0].line.text.trim());
      }
      placed.push(...own);
    }
    previous = lines;
  }

  const out: string[] = [];
  for (const { line, opens } of placed) {
    const text = line.text.replace(/\s+/g, ' ').trim().replace(BULLET, '');
    if (!text) continue;
    if (opens || !out.length) {
      out.push(text);
      continue;
    }
    const before = out[out.length - 1];
    // A word cut at the end of a line ("infor-" then "mation") is one word again.
    out[out.length - 1] = /\p{L}-$/u.test(before) && /^\p{Ll}/u.test(text) ? before.slice(0, -1) + text : `${before} ${text}`;
  }
  return out.join('\n');
}

/** The lines of a Tesseract result, top to bottom. */
export function linesOf(page: {
  blocks: Array<{
    paragraphs: Array<{ lines: Array<{ text: string; confidence: number; bbox: { y0: number; y1: number } }> }>;
  }> | null;
}): CaptureLine[] {
  return (page.blocks ?? [])
    .flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines))
    .map((line) => ({ text: line.text.trim(), confidence: line.confidence, top: line.bbox.y0, bottom: line.bbox.y1 }))
    .filter((line) => line.text)
    .sort((x, y) => x.top - y.top);
}

/** Where the OCR's own files are served from (`vite.config.ts`), so nothing is fetched from a third party. */
export const OCR_BASE = '/ocr/';

/**
 * The text of these screenshots, read on this device. `onProgress` hears which
 * one is being read. The OCR (a few megabytes) loads on the first import only.
 */
export async function readCaptures(
  files: readonly Blob[],
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('fra', 1, {
    workerPath: `${OCR_BASE}worker.min.js`,
    corePath: OCR_BASE,
    langPath: OCR_BASE,
  });
  const stop = () => void worker.terminate();
  signal?.addEventListener('abort', stop);
  try {
    const captures: CaptureLine[][] = [];
    for (const [index, file] of files.entries()) {
      onProgress(index, files.length);
      const { data } = await worker.recognize(file, {}, { blocks: true, text: false });
      if (signal?.aborted) throw new DOMException('Lecture annulée', 'AbortError');
      captures.push(linesOf(data));
    }
    onProgress(files.length, files.length);
    return stitchCaptures(captures);
  } finally {
    signal?.removeEventListener('abort', stop);
    await worker.terminate().catch(() => {});
  }
}
