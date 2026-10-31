/**
 * A text a reader hands over without its markup, turned into the blocks the
 * engine reads: a paste on the site, and an e-mail forwarded to the server.
 *
 * Both halves build their blocks with this one module so the same text gives
 * the same blocks, and so the same fingerprint (`articleTextHash`): a text
 * forwarded by e-mail and the same text pasted on the site share one report.
 *
 * The extension cuts a page into blocks from its markup; a text has none, so
 * every non-empty line is a paragraph and the title, when there is one, is the
 * first block. That keeps the title inside the text fingerprint (two pastes
 * under different titles are two texts) and inside what the audit can quote,
 * so a finding about the title is highlighted in it like any other.
 */
import type { TextBlock } from '../engine/types';

/** Longest single block, as `server/src/analyze/schemas.ts` accepts it. */
export const MAX_PASTED_BLOCK_CHARS = 20_000;

/** A line longer than one block is cut after a sentence, never inside a word. */
export function splitLongLine(line: string): string[] {
  const parts: string[] = [];
  let rest = line;
  while (rest.length > MAX_PASTED_BLOCK_CHARS) {
    const window = rest.slice(0, MAX_PASTED_BLOCK_CHARS);
    // After the last sentence in the window, unless that leaves most of it empty.
    const sentence = window.lastIndexOf('. ');
    const cut = sentence > MAX_PASTED_BLOCK_CHARS / 2 ? sentence + 1 : window.lastIndexOf(' ');
    const at = cut > 0 ? cut + 1 : MAX_PASTED_BLOCK_CHARS;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/**
 * Blocks written in order. `charStart` places each block in the text the
 * blocks spell when joined by a blank line, which is what the validator
 * offsets a finding's quote against. `push` returns the block's id.
 */
export function blockWriter(): { blocks: TextBlock[]; push: (type: TextBlock['type'], text: string) => string } {
  const blocks: TextBlock[] = [];
  let offset = 0;
  return {
    blocks,
    push(type, text) {
      const id = `b${blocks.length + 1}`;
      blocks.push({ id, type, text, charStart: offset });
      offset += text.length + 2;
      return id;
    },
  };
}

/** The title, then one paragraph per non-empty line of the text. */
export function plainTextBlocks(title: string, text: string): TextBlock[] {
  const writer = blockWriter();
  if (title.trim()) writer.push('heading', title.trim());
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.replace(/\s+/g, ' ').trim();
    if (trimmed) for (const part of splitLongLine(trimmed)) writer.push('paragraph', part);
  }
  return writer.blocks;
}
