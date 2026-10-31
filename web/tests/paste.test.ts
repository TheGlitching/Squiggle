/**
 * From a paste to the engine's blocks, and from a share to the form. What is
 * pinned is what the server and the reader rely on: blocks the server's own
 * limits accept, a fingerprint that covers the title, and a shared address
 * that only ever lands in the source field.
 */
import { describe, expect, it } from 'vitest';

import { MAX_ARTICLE_CHARS } from '../../shared/src/hosted/limits';
import { articleTextHash } from '../../shared/src/hosted/textHash';
import {
  appendPaste,
  articleFromShare,
  blocksFromPaste,
  MIN_TEXT_CHARS,
  pasteProblem,
  readCopied,
  sharedParams,
  textFromHtml,
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
    expect(pasteProblem({ title: '', source: '', text: 'Trop court.' })).toBe('too_short');
    // Long enough for a message, but an address says nothing, and nothing fetches it.
    expect(pasteProblem({ title: '', source: '', text: 'https://presse.example/a' })).toBe('only_address');
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

  it('reads a one-line text shared without a link as the message itself, not a title', () => {
    // A forwarded WhatsApp chain or a post: the words are what the reader wants checked.
    const rumour = 'URGENT ⚠️ à partir du 1er novembre la CAF supprime les APL pour les retraités propriétaires. Transférez à tous vos contacts !';
    const shared = share({ text: rumour })!;
    expect(shared).toEqual({ title: '', source: '', text: rumour });
    expect(pasteProblem({ title: '', source: '', ...shared, text: shared.text! })).toBeNull();
  });

  it('drops a shared address that is not a web page', () => {
    expect(share({ url: 'javascript:alert(1)', text: 'Un texte.' })?.source).toBe('');
  });
});

describe('the fragment of a bookmark saved before it brought the page', () => {
  it('reaches the form as the iPhone shortcut’s does, whatever the text holds', () => {
    const text = `${BODY}\nUn « & », un « = », un « # » et 100 % de caractères à garder.`;
    const title = 'Emploi & chômage';
    const hash = `#${new URLSearchParams({ title, url: 'https://presse.example/emploi?utm_source=x', text, via: 'favori' })}`;
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

describe('textFromHtml', () => {
  it('gives one line per paragraph, heading and list item, and nothing hidden', () => {
    const html =
      '<meta charset="utf-8"><style>p{color:red}</style><h1>Le titre</h1>' +
      '<p>Un <b>premier</b>\n   paragraphe.</p><script>track()</script>' +
      '<div><p>Le second.</p><ul><li>Un point</li><li>Un autre</li></ul></div>Ligne<br>coupée';
    expect(textFromHtml(html)).toBe(
      ['Le titre', 'Un premier paragraphe.', 'Le second.', 'Un point', 'Un autre', 'Ligne', 'coupée'].join('\n\n'),
    );
  });

  it('reads a copy with no text as empty', () => {
    expect(textFromHtml('<img src="photo.jpg"><script>x()</script>')).toBe('');
  });
});

describe('readCopied', () => {
  const item = (data: Record<string, string>) => ({
    types: Object.keys(data),
    getType: async (type: string) => new Blob([data[type]], { type }),
  });
  const clipboard = (value: Partial<Clipboard>) => value as Clipboard;

  it('prefers the plain text, and falls back to the markup when it is missing or blank', async () => {
    const both = clipboard({ read: async () => [item({ 'text/html': '<p>Riche</p>', 'text/plain': 'Simple' })] as never });
    expect(await readCopied(both)).toEqual({ kind: 'text', text: 'Simple' });

    const htmlOnly = clipboard({ read: async () => [item({ 'text/html': '<p>Un.</p><p>Deux.</p>' })] as never });
    expect(await readCopied(htmlOnly)).toEqual({ kind: 'text', text: 'Un.\n\nDeux.' });

    const blankPlain = clipboard({ read: async () => [item({ 'text/plain': '  ', 'text/html': '<p>Un.</p>' })] as never });
    expect(await readCopied(blankPlain)).toEqual({ kind: 'text', text: 'Un.' });
  });

  it('tells a clipboard with no text from one the page may not read', async () => {
    expect(await readCopied(clipboard({ read: async () => [item({ 'image/png': 'x' })] as never }))).toEqual({ kind: 'empty' });
    expect(await readCopied(clipboard({ readText: async () => ' ' }))).toEqual({ kind: 'empty' });
    const denied = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
    expect(await readCopied(clipboard({ read: denied }))).toEqual({ kind: 'refused' });
    expect(await readCopied(clipboard({ readText: denied }))).toEqual({ kind: 'refused' });
    expect(await readCopied(undefined)).toEqual({ kind: 'refused' });
  });

  it('reads the text alone where the browser has no rich read', async () => {
    expect(await readCopied(clipboard({ readText: async () => ' Un texte. ' }))).toEqual({ kind: 'text', text: 'Un texte.' });
  });
});
