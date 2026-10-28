/**
 * From a paste to the engine's blocks, and from a share to the form. What is
 * pinned is what the server and the reader rely on: blocks the server's own
 * limits accept, a fingerprint that covers the title, and a shared address
 * that only ever lands in the source field.
 */
import { describe, expect, it } from 'vitest';

import { MAX_ARTICLE_CHARS } from '../../shared/src/hosted/limits';
import { articleTextHash } from '../../shared/src/hosted/textHash';
import { favoriFragment } from '../src/favori/payload';
import {
  appendPaste,
  articleFromShare,
  blocksFromPaste,
  MIN_TEXT_CHARS,
  pasteProblem,
  sharedParams,
  webAddress,
} from '../src/paste';

const BODY = 'Le chômage a baissé de 12 % en un an.\n\n  Tout le monde   le sait.\r\nUne troisième ligne.';

describe('blocksFromPaste', () => {
  it('makes the title the first block and every non-empty line a paragraph', () => {
    const blocks = blocksFromPaste({ title: ' Emploi : la baisse ', text: BODY });
    expect(blocks.map((b) => [b.id, b.type, b.text])).toEqual([
      ['b1', 'heading', 'Emploi : la baisse'],
      ['b2', 'paragraph', 'Le chômage a baissé de 12 % en un an.'],
      ['b3', 'paragraph', 'Tout le monde le sait.'],
      ['b4', 'paragraph', 'Une troisième ligne.'],
    ]);
  });

  it('places each block where it sits in the text the blocks spell', () => {
    const blocks = blocksFromPaste({ title: '', text: BODY });
    const joined = blocks.map((b) => b.text).join('\n\n');
    for (const block of blocks) expect(joined.slice(block.charStart, block.charStart + block.text.length)).toBe(block.text);
  });

  it('cuts a line longer than one block after a word, never inside one', () => {
    const sentence = 'Une phrase assez longue pour remplir la ligne. ';
    const blocks = blocksFromPaste({ title: '', text: sentence.repeat(1000) });
    expect(blocks.length).toBeGreaterThan(1);
    for (const block of blocks) {
      expect(block.text.length).toBeLessThanOrEqual(20_000);
      expect(block.text.endsWith('.')).toBe(true);
    }
  });

  it('fingerprints the title with the text: the same body under two titles is two texts', async () => {
    const a = await articleTextHash(blocksFromPaste({ title: 'Le chômage baisse', text: BODY }));
    const b = await articleTextHash(blocksFromPaste({ title: 'Le chômage s’effondre', text: BODY }));
    const relaid = await articleTextHash(blocksFromPaste({ title: 'Le chômage baisse', text: BODY.replace(/\n+/g, ' ') }));
    expect(a).not.toBe(b);
    expect(relaid).toBe(a);
  });
});

describe('pasteProblem', () => {
  const long = 'x'.repeat(MIN_TEXT_CHARS);

  it('accepts a whole article, with or without its address', () => {
    expect(pasteProblem({ title: '', source: '', text: long })).toBeNull();
    expect(pasteProblem({ title: 'T', source: 'https://presse.example/a', text: long })).toBeNull();
  });

  it('stops a paste the server would refuse, or that is no article at all', () => {
    expect(pasteProblem({ title: '', source: '', text: 'https://presse.example/a' })).toBe('too_short');
    expect(pasteProblem({ title: '', source: '', text: 'x'.repeat(MAX_ARTICLE_CHARS + 1) })).toBe('too_long');
    // The title is part of what the server counts.
    expect(pasteProblem({ title: '', source: '', text: 'x'.repeat(MAX_ARTICLE_CHARS) })).toBeNull();
    expect(pasteProblem({ title: 'Titre', source: '', text: 'x'.repeat(MAX_ARTICLE_CHARS) })).toBe('too_long');
    expect(pasteProblem({ title: '', source: '', text: 'ligne\n'.repeat(2_001) + long })).toBe('too_many_lines');
    expect(pasteProblem({ title: '', source: 'javascript:alert(1)', text: long })).toBe('bad_source');
    expect(pasteProblem({ title: '', source: 'presse.example/a', text: long })).toBe('bad_source');
  });

  it('reads only http(s) as an address', () => {
    expect(webAddress('https://presse.example/a')).toBe('https://presse.example/a');
    expect(webAddress('file:///etc/passwd')).toBeNull();
  });
});

describe('articleFromShare', () => {
  const share = (params: Record<string, string>) => articleFromShare(new URLSearchParams(params));

  it('ignores a visit that is not a share', () => {
    expect(share({})).toBeNull();
  });

  it('puts a shared text in the form', () => {
    expect(share({ title: 'Emploi', text: `${BODY}\nSuite.` })).toEqual({ title: 'Emploi', source: '', text: `${BODY}\nSuite.` });
  });

  it('puts an address shared alone in the source field, and leaves the text to paste', () => {
    // Chrome on Android shares a page as its title plus its address in `text`.
    expect(share({ title: 'Emploi : la baisse', text: 'https://presse.example/emploi' })).toEqual({
      title: 'Emploi : la baisse',
      source: 'https://presse.example/emploi',
      text: '',
    });
    expect(share({ url: 'https://presse.example/emploi' })).toEqual({ title: '', source: 'https://presse.example/emploi', text: '' });
  });

  it('reads "headline https://…" as a title and an address, not as an article', () => {
    expect(share({ text: 'Le chômage baisse encore https://presse.example/emploi' })).toEqual({
      title: 'Le chômage baisse encore',
      source: 'https://presse.example/emploi',
      text: '',
    });
  });

  it('drops a shared address that is not a web page', () => {
    expect(share({ url: 'javascript:alert(1)', text: 'Un texte.' })?.source).toBe('');
  });
});

describe('the bookmark’s fragment', () => {
  it('reaches the form as the iPhone shortcut’s does, whatever the text holds', () => {
    const text = `${BODY}\nUn « & », un « = », un « # » et 100 % de caractères à garder.`;
    const hash = favoriFragment({ title: 'Emploi & chômage', url: 'https://presse.example/emploi?utm_source=x', text });
    const params = sharedParams({ search: '', hash });
    expect(params.get('via')).toBe('favori');
    expect(articleFromShare(params)).toEqual({ title: 'Emploi & chômage', source: 'https://presse.example/emploi?utm_source=x', text });
  });
});

describe('appendPaste', () => {
  const P1 = 'Le gouvernement a présenté mardi son projet de budget pour l’année prochaine.';
  const P2 = 'Les économies prévues portent surtout sur les dépenses de fonctionnement des ministères.';
  const P3 = 'L’opposition dénonce un texte qui ne tient pas compte de la hausse des prix.';

  it('adds the next passage after the text', () => {
    expect(appendPaste(P1, P2)).toBe(`${P1}\n${P2}`);
  });

  it('drops what the new copy repeats of the last one', () => {
    expect(appendPaste(`${P1}\n${P2}`, `${P2}\n\n${P3}`)).toBe(`${P1}\n${P2}\n${P3}`);
  });

  it('completes the paragraph the last copy cut short', () => {
    const cut = P2.slice(0, 40);
    expect(appendPaste(`${P1}\n${cut}`, `${P2}\n${P3}`)).toBe(`${P1}\n${P2}\n${P3}`);
    // A copy that starts inside the paragraph the last one ended in.
    expect(appendPaste(`${P1}\n${P2.slice(0, 50)}`, `${P2.slice(25)}\n${P3}`)).toBe(`${P1}\n${P2}\n${P3}`);
  });

  it('drops a long line already in the text, never a short one that may well repeat', () => {
    expect(appendPaste(`${P1}\nPublicité\n${P2}`, `${P3}\nPublicité\n${P1}`)).toBe(`${P1}\nPublicité\n${P2}\n${P3}\nPublicité`);
  });

  it('starts from an empty text', () => {
    expect(appendPaste('', `${P1}\n\n${P2}`)).toBe(`${P1}\n${P2}`);
  });
});
