/**
 * The classroom mode, in the teacher's browser only. A session is a report and
 * the text it was made from, with the order the teacher chose to reveal its
 * findings in. It comes from the analysis just run, or from the session file
 * the teacher downloaded: nothing about it is ever sent to our server, so the
 * classroom mode adds no endpoint and keeps no student data.
 *
 * During the lesson two windows of the same browser share it: the desk on the
 * teacher's screen and the board on the projector. They talk over a
 * `BroadcastChannel`, which never leaves the browser.
 */
import type { AnalysisReport, Finding, TextBlock } from '../../shared/src/engine/types';
import { locateFindings } from './report';

export interface Seance {
  title: string;
  source?: string;
  blocks: TextBlock[];
  report: AnalysisReport;
  /** Every finding's id, in the order the board reveals them. */
  order: string[];
  /** The findings the teacher took out of the lesson. */
  left: string[];
  hideScore: boolean;
  /**
   * Opened from a file: a report our server can no longer vouch for, since
   * anyone can edit a file. The board then says where it came from instead of
   * presenting it as Squiggle's own analysis.
   */
  fromFile: boolean;
}

export type Phase = 'lecture' | 'reperage' | 'revelation' | 'bilan';

/** The lesson as it runs: in memory only, shared by the desk and the board. */
export interface ClassState {
  phase: Phase;
  /** Sentence number -> raised hands. A sentence the class proposed without a count is 0. */
  marks: Record<number, number>;
  /** How many findings of the deck the board shows. */
  revealed: number;
  black: boolean;
  showScore: boolean;
}

export const PHASES: Array<[Phase, string]> = [
  ['lecture', 'Lecture'],
  ['reperage', 'Repérage'],
  ['revelation', 'Révélation'],
  ['bilan', 'Bilan'],
];

export function startState(seance: Seance): ClassState {
  return { phase: 'lecture', marks: {}, revealed: 0, black: false, showScore: !seance.hideScore };
}

/** The findings the board will reveal, in their order. */
export function deckOf(seance: Seance): Finding[] {
  const byId = new Map(seance.report.findings.map((f) => [f.id, f]));
  return seance.order.filter((id) => !seance.left.includes(id)).flatMap((id) => byId.get(id) ?? []);
}

/* ---------- The text, cut into numbered sentences ---------- */

export interface Part {
  text: string;
  /** The findings whose passage covers this stretch, most severe first. */
  findings: Finding[];
  /** The findings whose passage starts here. */
  starts: Finding[];
}

/** A numbered sentence, or the text around them (a title, the space between two sentences). */
export interface Run {
  n: number | null;
  parts: Part[];
}

export interface Layout {
  blocks: Array<{ block: TextBlock; runs: Run[] }>;
  sentences: Array<{ n: number; text: string }>;
  /** Where each located finding starts: its sentence number, or 0 for the title. */
  sentenceOf: Map<string, number>;
}

/**
 * The text as the class reads it: every sentence of the body numbered, as on
 * the student sheet, with each finding's passage where `locateFindings` puts
 * it. A finding belongs to the sentence its passage starts in. Titles are not
 * numbered: a finding there is "in the title" (0).
 */
export function layoutOf(blocks: TextBlock[], findings: Finding[]): Layout {
  const { segments } = locateFindings(blocks, findings);
  const segmenter = new Intl.Segmenter('fr', { granularity: 'sentence' });
  const sentences: Layout['sentences'] = [];
  const sentenceOf = new Map<string, number>();
  let count = 0;

  const laid = blocks.map((block) => {
    const ranges: Array<{ start: number; end: number; n: number | null }> = [];
    if (block.type === 'heading') {
      ranges.push({ start: 0, end: block.text.length, n: null });
    } else {
      for (const { segment, index } of segmenter.segment(block.text)) {
        const core = segment.trimEnd();
        if (!core.trim()) {
          ranges.push({ start: index, end: index + segment.length, n: null });
          continue;
        }
        count += 1;
        sentences.push({ n: count, text: core.trim() });
        ranges.push({ start: index, end: index + core.length, n: count });
        if (core.length < segment.length) ranges.push({ start: index + core.length, end: index + segment.length, n: null });
      }
    }

    const runs: Run[] = ranges.map(({ n }) => ({ n, parts: [] }));
    let offset = 0;
    for (const segment of segments.get(block.id) ?? [{ text: block.text, findings: [], starts: [] }]) {
      const from = offset;
      const to = offset + segment.text.length;
      offset = to;
      ranges.forEach((range, index) => {
        const start = Math.max(from, range.start);
        const end = Math.min(to, range.end);
        if (start >= end) return;
        const starts = start === from ? segment.starts : [];
        for (const finding of starts) if (!sentenceOf.has(finding.id)) sentenceOf.set(finding.id, range.n ?? 0);
        runs[index].parts.push({ text: block.text.slice(start, end), findings: segment.findings, starts });
      });
    }
    return { block, runs };
  });

  return { blocks: laid, sentences, sentenceOf };
}

/** Where a finding is, as the class says it: "phrase 4", "titre". */
export function placeOf(layout: Layout, finding: Finding): string | null {
  const n = layout.sentenceOf.get(finding.id);
  if (n === undefined) return null;
  return n === 0 ? 'titre' : `phrase ${n}`;
}

/**
 * The reveal order a session starts with: reading order, strengths last (the
 * review shows them as a nuance, not a fault), passages not found in the text
 * after the rest.
 */
export function defaultOrder(layout: Layout, findings: Finding[]): string[] {
  const rank = new Map<string, number>();
  for (const { runs } of layout.blocks)
    for (const run of runs) for (const part of run.parts) for (const f of part.starts) if (!rank.has(f.id)) rank.set(f.id, rank.size);
  const key = (f: Finding) => (f.category === 'point-fort' ? 1e6 : 0) + (rank.get(f.id) ?? 1e5);
  return [...findings].sort((a, b) => key(a) - key(b)).map((f) => f.id);
}

export function newSeance(input: { title: string; source?: string; blocks: TextBlock[]; report: AnalysisReport }): Seance {
  const layout = layoutOf(input.blocks, input.report.findings);
  return {
    title: input.title.trim(),
    source: input.source?.trim() || undefined,
    blocks: input.blocks,
    report: input.report,
    order: defaultOrder(layout, input.report.findings),
    left: [],
    hideScore: true,
    fromFile: false,
  };
}

/**
 * The question the teacher asks before revealing a finding. From a template
 * per category rather than from the model: free, the same every time, and
 * nothing Squiggle invents about the article.
 */
export function questionFor(finding: Finding): string {
  if (finding.verification === 'douteuse') return 'Jugé douteux, pas faux : pourquoi cette nuance ?';
  switch (finding.category) {
    case 'sophisme':
      return 'Le raisonnement tient-il ? Trouvez un contre-exemple.';
    case 'cadrage':
      return 'Quel mot oriente le jugement ? Que dit-il de plus que les faits ?';
    case 'source-absente':
      return 'Qui l’affirme ? Où pourrait-on le vérifier ?';
    case 'affirmation-non-etayee':
      return 'Sur quoi repose cette affirmation ? Que faudrait-il citer ?';
    case 'surinterpretation':
      return 'Les faits cités suffisent-ils pour aller jusqu’à cette conclusion ?';
    case 'point-fort':
      return 'Que change ce passage au reste de l’article ?';
    default:
      return 'L’aviez-vous remarqué ? Qu’est-ce qui vous arrête ici ?';
  }
}

/** What the class found, missed, or marked of its own, for the review. */
export function tally(seance: Seance, layout: Layout, state: ClassState) {
  const marked = (f: Finding) => {
    const n = layout.sentenceOf.get(f.id);
    return n !== undefined && n > 0 && n in state.marks;
  };
  // Only a passage in a numbered sentence can be proposed by the class.
  const weak = deckOf(seance).filter((f) => f.category !== 'point-fort' && (layout.sentenceOf.get(f.id) ?? 0) > 0);
  const found = weak.filter(marked).length;
  const withFinding = new Set(seance.report.findings.map((f) => layout.sentenceOf.get(f.id)));
  const extra = Object.keys(state.marks).filter((n) => !withFinding.has(Number(n))).length;
  return { weak: weak.length, found, extra, marked };
}

/* ---------- The lesson, one key at a time ---------- */

export type Key = 'next' | 'prev' | 'black';

/**
 * The keyboard and a presenter's remote walk the lesson as one line: reading,
 * marking, the reveal's opening, each finding, the review. So a teacher who
 * can only show the board, its screen duplicated, still runs it all.
 */
export function step(state: ClassState, key: Key, deck: number): ClassState {
  if (key === 'black') return { ...state, black: !state.black };
  const line = 3 + deck;
  const at =
    state.phase === 'lecture' ? 0 : state.phase === 'reperage' ? 1 : state.phase === 'bilan' ? line : 2 + state.revealed;
  const to = Math.max(0, Math.min(line, at + (key === 'next' ? 1 : -1)));
  if (to === at) return state;
  if (to === 0) return { ...state, phase: 'lecture', revealed: 0 };
  if (to === 1) return { ...state, phase: 'reperage', revealed: 0 };
  if (to === line) return { ...state, phase: 'bilan', revealed: deck };
  return { ...state, phase: 'revelation', revealed: to - 2 };
}

/** Two windows, one lesson. The desk holds the state; the board asks for it and forwards its keys. */
export const CHANNEL = 'squiggle-classe';

export type Message =
  | { type: 'hello' }
  | { type: 'key'; key: Key }
  | { type: 'state'; seance: Seance; state: ClassState }
  | { type: 'end' };

/** The keys a keyboard or a presenter's remote sends. */
export function keyOf(event: KeyboardEvent): Key | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  if (['ArrowRight', 'PageDown', ' '].includes(event.key)) return 'next';
  if (['ArrowLeft', 'PageUp'].includes(event.key)) return 'prev';
  // Remotes send B or "." for a black screen.
  if (['n', 'N', 'b', 'B', '.'].includes(event.key)) return 'black';
  return null;
}

/* ---------- Kept in this tab, while it is open ---------- */

const KEY = 'squiggle:seance';
let held: Seance | null = null;

/**
 * The session lives in this tab: in memory, and in the tab's session storage
 * so a reload keeps it. Closing the tab forgets it, which is what a shared
 * classroom computer needs: nothing of the teacher's stays behind.
 */
export function loadSeance(): Seance | null {
  if (held) return held;
  try {
    const raw = sessionStorage.getItem(KEY);
    held = raw ? parseSeance(raw, JSON.parse(raw)?.fromFile === true) : null;
  } catch {
    held = null;
  }
  return held;
}

export function saveSeance(seance: Seance | null): void {
  held = seance;
  try {
    if (seance) sessionStorage.setItem(KEY, JSON.stringify(seance));
    else sessionStorage.removeItem(KEY);
  } catch {
    // Storage blocked or full: the session still works, it just does not survive a reload.
  }
}

/* ---------- The session file ---------- */

const FORMAT = 'squiggle-seance';
const VERSION = 1;
export const FILE_EXTENSION = '.squiggle';
/** A session is an article and its report: far below this. A bigger file is not one. */
export const MAX_FILE_BYTES = 5_000_000;

export class SeanceError extends Error {}

/** The file a teacher carries to the classroom: the text, the report, the order. */
export function seanceFile(seance: Seance): Blob {
  const { title, source, blocks, report, order, left, hideScore } = seance;
  const body = { format: FORMAT, version: VERSION, title, source, blocks, report, order, left, hideScore };
  // A neutral type, so no browser renames the file after a type it thinks it knows.
  return new Blob([JSON.stringify(body)], { type: 'application/octet-stream' });
}

/** A name a teacher recognises in a downloads folder or on a USB key, valid on every system. */
export function fileName(seance: Seance): string {
  const title = seance.title
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .trim();
  return `Séance Squiggle${title ? ` - ${title}` : ''}${FILE_EXTENSION}`;
}

const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const BLOCK_TYPES = ['heading', 'paragraph', 'quote', 'caption', 'list-item'];
const BANDS = ['solide', 'perfectible', 'fragile', 'problematique'];

function isFinding(value: unknown): value is Finding {
  return (
    isObject(value) &&
    isString(value.id) &&
    isString(value.blockId) &&
    isString(value.quote) &&
    isString(value.category) &&
    [1, 2, 3].includes(value.severity as number) &&
    isString(value.label) &&
    isString(value.explanation) &&
    (value.verification === undefined || isString(value.verification)) &&
    (value.sources === undefined || Array.isArray(value.sources))
  );
}

/**
 * A session read back from a file or this tab's storage. Everything the pages
 * read is checked: a file is anyone's to edit, and a damaged one must be
 * refused with a sentence, not break the page halfway through a lesson.
 */
export function parseSeance(text: string, fromFile = true): Seance {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new SeanceError('Ce fichier n’est pas une séance Squiggle.');
  }
  if (!isObject(data) || (data.format !== undefined && data.format !== FORMAT)) {
    throw new SeanceError('Ce fichier n’est pas une séance Squiggle.');
  }
  if (isNumber(data.version) && data.version > VERSION) {
    throw new SeanceError('Ce fichier vient d’une version plus récente de Squiggle. Rechargez la page, puis rouvrez-le.');
  }
  const { title, source, blocks, report, order, left, hideScore } = data;
  const validBlocks =
    Array.isArray(blocks) &&
    blocks.length > 0 &&
    blocks.every((b) => isObject(b) && isString(b.id) && BLOCK_TYPES.includes(b.type as string) && isString(b.text) && isNumber(b.charStart));
  const validReport =
    isObject(report) &&
    isNumber(report.score) &&
    BANDS.includes(report.scoreBand as string) &&
    isString(report.summary) &&
    Array.isArray(report.categories) &&
    Array.isArray(report.findings) &&
    report.findings.every(isFinding) &&
    isObject(report.research) &&
    isObject(report.meta) &&
    isString(report.meta.analyzedAt) &&
    isString(report.meta.promptVersion);
  if (!isString(title) || !validBlocks || !validReport) {
    throw new SeanceError('Ce fichier de séance est incomplet ou abîmé. Téléchargez-le à nouveau depuis la préparation.');
  }

  const findings = (report as unknown as AnalysisReport).findings;
  const ids = findings.map((f) => f.id);
  const known = (list: unknown) => (Array.isArray(list) ? list.filter((id): id is string => ids.includes(id as string)) : []);
  // An order that lost or gained a finding is completed rather than refused: the report is what counts.
  const kept = [...new Set(known(order))];
  return {
    title,
    source: isString(source) ? source : undefined,
    blocks: blocks as TextBlock[],
    report: report as unknown as AnalysisReport,
    order: [...kept, ...ids.filter((id) => !kept.includes(id))],
    left: known(left),
    hideScore: hideScore !== false,
    fromFile,
  };
}
