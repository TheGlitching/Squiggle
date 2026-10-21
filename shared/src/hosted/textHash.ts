/**
 * The fingerprint of an article's text, the half of the shared cache key that
 * the URL cannot supply.
 *
 * The server never fetches an article, so the text it analyses is whatever a
 * client sent. A cache keyed on the URL alone would let any account publish a
 * report built from invented text under the address of a real article and have
 * every later reader served it. Keying on this hash as well means a report is
 * only ever served to a reader whose own page yields the same text.
 *
 * Both halves compute it from the same blocks with this one function: the
 * extension to ask the cache, the server to store what it was actually given.
 * The server never takes a client's word for the hash it files a report under.
 *
 * The normalisation drops everything a reload can change without the article
 * changing: case, whitespace, punctuation, invisible characters, how the page
 * was cut into blocks, and the block ids and offsets. What is left is the
 * letters and digits of the text, in order. Any change to a word or a number
 * changes the hash, so a corrected article stops being served its old report.
 */
import { sha256Hex } from '../auth/signing';
import type { TextBlock } from '../engine/types';

/** Letters and digits only: `\p{L}` and `\p{N}` keep accents, drop everything else. */
const NOT_TEXT = /[^\p{L}\p{N}]+/gu;

export function normalizeArticleText(blocks: ReadonlyArray<Pick<TextBlock, 'text'>>): string {
  // NFKC first, so a ligature, a full-width digit or a non-breaking space
  // written two ways on two loads becomes one form before it is compared.
  // Blocks are joined without a separator, so where the page was cut does not
  // matter either.
  return blocks
    .map((block) => block.text.normalize('NFKC').toLowerCase().replace(NOT_TEXT, ''))
    .join('');
}

/** Lowercase hex SHA-256 of the normalised text of `blocks`. */
export function articleTextHash(blocks: ReadonlyArray<Pick<TextBlock, 'text'>>): Promise<string> {
  return sha256Hex(normalizeArticleText(blocks));
}
