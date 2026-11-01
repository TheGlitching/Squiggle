/**
 * A link to X on the site (`readXPost`): only X's hosts are asked of the server,
 * the text it returns becomes the form's article with the publication's address
 * as its source, and any failure says, in a sentence, to paste the text.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { isXLink, readXPost } from '../src/analysis';

afterEach(() => vi.unstubAllGlobals());

function server(body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body)));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('which links go to X', () => {
  it('is X’s hosts only', () => {
    expect(isXLink('https://x.com/alice/status/1')).toBe(true);
    expect(isXLink('https://www.twitter.com/alice/status/1')).toBe(true);
    expect(isXLink('https://x.com.evil.example/alice/status/1')).toBe(false);
    expect(isXLink('https://www.lemonde.fr/article.html')).toBe(false);
    expect(isXLink('pas un lien')).toBe(false);
  });
});

describe('reading a publication X', () => {
  it('asks the visitor endpoint without a cookie, and the account’s with one', async () => {
    const f = server({ ok: true, title: 'Publication X de @alice', url: 'https://x.com/alice/status/1', text: 'Le texte.', postsRead: 1 });
    const read = await readXPost('https://x.com/alice/status/1', false);
    expect(read).toEqual({
      kind: 'ok',
      article: { title: 'Publication X de @alice', source: 'https://x.com/alice/status/1', text: 'Le texte.' },
      postsRead: 1,
      partial: false,
    });
    expect(f.mock.calls[0]).toEqual([expect.stringContaining('/web/anon/x-post?url=https%3A%2F%2Fx.com%2Falice%2Fstatus%2F1'), { credentials: 'omit' }]);

    await readXPost('https://x.com/alice/status/1', true);
    expect(f.mock.calls[1]).toEqual([expect.stringContaining('/web/analyze/x-post'), { credentials: 'include' }]);
  });

  it('gives the server’s sentence when it cannot read it, and a sentence of its own when the server is out of reach', async () => {
    server({ error: 'x_cap', message: 'Reprenez demain, ou collez le texte.' });
    expect(await readXPost('https://x.com/alice/status/1', false)).toEqual({ kind: 'error', message: 'Reprenez demain, ou collez le texte.' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await readXPost('https://x.com/alice/status/1', false)).toMatchObject({ kind: 'error', message: expect.stringContaining('collez') });
  });
});
