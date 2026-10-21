// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { articleTextHash, normalizeArticleText } from '../src/hosted/textHash';

const block = (text: string, id = 'b1', charStart = 0) => ({
  id,
  type: 'paragraph' as const,
  text,
  charStart,
});

describe('article text fingerprint', () => {
  it('reduces text to its letters and digits, lowercased, accents kept', () => {
    expect(normalizeArticleText([block('Le Chômage a baissé de 12 % !')])).toBe('lechômageabaissé' + 'de12');
  });

  it('ignores what a reload changes without the article changing', async () => {
    const base = await articleTextHash([block('Le chômage a baissé de 12 % en un an.'), block('Tout le monde le sait.', 'b2', 40)]);

    // Casing, whitespace, a non-breaking and a zero-width space, curly typography.
    expect(await articleTextHash([block('LE  CHÔMAGE a baissé de 12 %​ en un an !'), block('  Tout le monde le sait…  ', 'b2', 40)])).toBe(base);
    // Another cut of the page into blocks, other ids and offsets.
    expect(await articleTextHash([block('Le chômage a baissé de 12 % en un an. Tout', 'x1', 7), block('le monde le sait.', 'x2', 99)])).toBe(base);
    // Compatibility forms: a ligature and a full-width digit.
    expect(await articleTextHash([block('Le chômage a baissé de １２ % en un an.'), block('Tout le monde le sait.', 'b2', 40)])).toBe(base);
  });

  it('changes when a word or a number changes', async () => {
    const base = await articleTextHash([block('Le chômage a baissé de 12 % en un an.')]);
    expect(await articleTextHash([block('Le chômage a baissé de 21 % en un an.')])).not.toBe(base);
    expect(await articleTextHash([block('Le chômage a augmenté de 12 % en un an.')])).not.toBe(base);
    // Accents are letters: they are not folded away.
    expect(await articleTextHash([block('Le chomage a baissé de 12 % en un an.')])).not.toBe(base);
  });

  it('is a SHA-256 hex digest', async () => {
    expect(await articleTextHash([block('texte')])).toMatch(/^[0-9a-f]{64}$/);
  });
});
