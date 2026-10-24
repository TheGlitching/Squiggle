/**
 * Where each finding's quote sits in the pasted text, and the tone its passage
 * is painted in. The names a report uses (categories, severities, bands) are
 * the landing demo's mirrors of the extension, in `demo.ts`.
 */
import type { Finding, TextBlock } from '../../shared/src/engine/types';
import { severityToHighlightSeverity, type HighlightSeverity } from './demo';

/**
 * A passage's tone in the text, as the extension paints it in the page: capped
 * by the verification. Its card is toned by severity alone (`findingTone`).
 */
export function passageTone(finding: Finding): HighlightSeverity {
  return severityToHighlightSeverity(finding.severity, finding.category, finding.verification);
}

const TONE_RANK: Record<HighlightSeverity, number> = { critical: 3, warning: 2, info: 1, positive: 0 };

/**
 * Typography a copy-paste changes without changing a word: curly against
 * straight quotes and apostrophes, French guillemets with their thin spaces,
 * dashes, and runs of whitespace. Each character maps to one (for any French
 * text), so an index found in the folded text is the same in the original.
 */
function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc\u2032`]/g, "'")
    .replace(/[\u201c\u201d\u00ab\u00bb\u201e]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/[\s\u00a0\u202f]/g, ' ');
}

/** Marks French typography sets off with a space and English does not: « ici », ici : là. */
const SPACED = /[":;!?]/;

/**
 * `needle` in `haystack`, ignoring that typography, any run of spaces, and
 * whether a quote mark or a colon was spaced the French way.
 */
function findLoosely(haystack: string, needle: string): { start: number; end: number } | null {
  const folded = fold(needle)
    .replace(/ +/g, ' ')
    .trim()
    .replace(/ *([":;!?]) */g, '$1');
  if (!folded) return null;
  const pattern = [...folded]
    .map((ch) => {
      const escaped = ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return ch === ' ' ? ' +' : SPACED.test(ch) ? ` *${escaped} *` : escaped;
    })
    .join('');
  const match = new RegExp(pattern).exec(fold(haystack));
  if (!match) return null;
  // The optional spaces around a mark may have swallowed the text's own: they are not the quote.
  let start = match.index;
  let end = start + match[0].length;
  while (start < end && /\s/.test(haystack[start])) start += 1;
  while (end > start && /\s/.test(haystack[end - 1])) end -= 1;
  return { start, end };
}

export interface Segment {
  text: string;
  /** The findings whose quote covers this stretch, most severe first. */
  findings: Finding[];
  /** The findings whose quote starts here: their anchor in the text. */
  starts: Finding[];
}

export interface LocatedText {
  /** Each block cut into plain and highlighted stretches. */
  segments: Map<string, Segment[]>;
  /** The findings whose quote is somewhere in the text. */
  located: Set<string>;
}

/**
 * Where each finding's quote is, block by block. The engine's offset is used
 * when it fits; otherwise the quote is looked for in its block, then in every
 * block, loosely. A quote found nowhere is still reported, without a passage.
 * Overlapping quotes share their common stretch, painted in the graver tone.
 */
export function locateFindings(blocks: TextBlock[], findings: Finding[]): LocatedText {
  const ranges = new Map<string, Array<{ start: number; end: number; finding: Finding }>>();
  const located = new Set<string>();

  for (const finding of findings) {
    const quote = finding.quote.trim();
    if (!quote) continue;
    const own = blocks.find((b) => b.id === finding.blockId);
    let hit: { block: TextBlock; start: number; end: number } | null = null;

    if (own && finding.charStart !== undefined && finding.charEnd !== undefined) {
      const start = finding.charStart - own.charStart;
      const end = finding.charEnd - own.charStart;
      if (start >= 0 && end <= own.text.length && fold(own.text.slice(start, end)) === fold(quote)) {
        hit = { block: own, start, end };
      }
    }
    for (const block of own ? [own, ...blocks.filter((b) => b !== own)] : blocks) {
      if (hit) break;
      const found = findLoosely(block.text, quote);
      if (found) hit = { block, ...found };
    }
    if (!hit) continue;

    located.add(finding.id);
    const list = ranges.get(hit.block.id) ?? [];
    list.push({ start: hit.start, end: hit.end, finding });
    ranges.set(hit.block.id, list);
  }

  const segments = new Map<string, Segment[]>();
  for (const block of blocks) {
    const list = ranges.get(block.id) ?? [];
    const cuts = [...new Set([0, block.text.length, ...list.flatMap((r) => [r.start, r.end])])].sort((a, b) => a - b);
    const parts: Segment[] = [];
    for (let i = 0; i < cuts.length - 1; i += 1) {
      const [from, to] = [cuts[i], cuts[i + 1]];
      const covering = list
        .filter((r) => r.start <= from && r.end >= to)
        .map((r) => r.finding)
        .sort((a, b) => TONE_RANK[passageTone(b)] - TONE_RANK[passageTone(a)]);
      parts.push({
        text: block.text.slice(from, to),
        findings: covering,
        starts: list.filter((r) => r.start === from).map((r) => r.finding),
      });
    }
    segments.set(block.id, parts);
  }

  return { segments, located };
}
