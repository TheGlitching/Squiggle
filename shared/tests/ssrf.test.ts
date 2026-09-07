/**
 * The server-side fetch is the one place in the engine where a string coming
 * from a hostile article becomes a network request made by OUR infrastructure.
 * `fetchPageText` (the browser path) needs none of this — a browser will not
 * route an extension's fetch to 127.0.0.1 — so these tests cover only
 * `assertPublicHost` and `safeFetchPageText`, the two additions that exist
 * purely because the same "read the cited source" step now also runs on the
 * hosted server.
 */
import { describe, expect, it, vi } from 'vitest';
import { MAX_PAGE_BYTES, SsrfBlockedError, SSRF_MAX_REDIRECTS, assertPublicHost, safeFetchPageText } from '../src/engine/sourceFetch';

function fakeResponse(status: number, headers: Record<string, string> = {}, body = '') {
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: '',
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  } as unknown as Response;
}

describe('assertPublicHost — hostname policy', () => {
  it.each([
    '127.0.0.1',
    '0.0.0.0',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '192.0.0.8',
    '255.255.255.255',
    '224.0.0.1',
  ])('rejects the private IPv4 literal %s', (host) => {
    expect(() => assertPublicHost(host)).toThrowError(SsrfBlockedError);
  });

  it.each([
    '[::1]',
    '[fe80::1]',
    '[fc00::1]',
    '[fd12:3456::1]',
    '[::ffff:192.168.0.1]',
    '[::ffff:127.0.0.1]',
  ])('rejects the private IPv6 literal %s', (host) => {
    expect(() => assertPublicHost(host)).toThrowError(SsrfBlockedError);
  });

  it.each([
    'localhost',
    'myapp.localhost',
    'printer.local',
    'api.internal',
    'db.lan',
    'internal',
    'sub.corp.internal',
  ])('rejects the internal hostname %s', (host) => {
    expect(() => assertPublicHost(host)).toThrowError(SsrfBlockedError);
  });

  it.each([
    // 2130706433 = 127.0.0.1, 3232235777 = 192.168.0.1, encoded as a single decimal integer
    ['2130706433', SsrfBlockedError],
    ['3232235777', SsrfBlockedError],
    // octal / hex / leading-zero encodings of an address: never canonical, always refuse
    ['0x7f.0.0.1', SsrfBlockedError],
    ['0177.0.0.1', SsrfBlockedError],
    ['192.168.001.1', SsrfBlockedError],
  ] as const)('rejects the non-canonical encoding %s', (host, expected) => {
    expect(() => assertPublicHost(host)).toThrowError(expected);
  });

  it.each([
    'example.com',
    'news.ycombinator.com',
    '93.184.216.34',
    '[2001:4860:4860::8888]',
    // "localhost" as a subdomain string of a genuine public domain is fine:
    // the policy anchors on the label boundary, not on substring matches.
    'my.localhost.example.com',
  ])('allows the public host %s', (host) => {
    expect(() => assertPublicHost(host)).not.toThrow();
  });
});

describe('safeFetchPageText — the guarded server fetch', () => {
  it('refuses a direct internal target before any request is made', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      safeFetchPageText('http://127.0.0.1/admin', 5000, { fetchImpl })
    ).rejects.toThrowError(SsrfBlockedError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a redirect to the cloud metadata endpoint after following a legitimate first hop', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(fakeResponse(302, { location: 'http://169.254.169.254/latest/meta-data/' }))
      .mockResolvedValueOnce(fakeResponse(200, { 'content-type': 'text/html' }, 'metadata'));
    await expect(
      safeFetchPageText('https://example.com/article', 5000, { fetchImpl })
    ).rejects.toThrowError(SsrfBlockedError);
    // The second hop was re-validated and refused: the fetcher never reached it.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('refuses a redirect to a non-http scheme', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(fakeResponse(302, { location: 'file:///etc/passwd' }));
    await expect(
      safeFetchPageText('https://example.com/article', 5000, { fetchImpl })
    ).rejects.toThrowError(SsrfBlockedError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('stops after the redirect budget instead of following a loop', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      fakeResponse(302, { location: 'https://example.com/again' })
    );
    await expect(
      safeFetchPageText('https://example.com/start', 5000, { fetchImpl })
    ).rejects.toThrow(/trop de redirections/);
    // one initial request + SSRF_MAX_REDIRECTS followed hops
    expect(fetchImpl).toHaveBeenCalledTimes(1 + SSRF_MAX_REDIRECTS);
  });

  it('follows a legitimate redirect chain and extracts the page text', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(fakeResponse(301, { location: '/moved' }))
      .mockResolvedValueOnce(fakeResponse(200, { 'content-type': 'text/html' }, '<html><body><h1>Salut</h1><p>le monde</p></body></html>'));
    const text = await safeFetchPageText('https://example.com/article', 5000, { fetchImpl });
    expect(text).toContain('Salut');
    expect(text).toContain('le monde');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][0]).toBe('https://example.com/moved');
  });

  it('still enforces the HTML content-type and byte cap', async () => {
    const json = vi.fn<typeof fetch>().mockResolvedValue(
      fakeResponse(200, { 'content-type': 'application/json' }, '{"a":1}')
    );
    await expect(safeFetchPageText('https://example.com/data', 5000, { fetchImpl: json })).rejects.toThrow(/type de contenu/);

    const huge = vi.fn<typeof fetch>().mockResolvedValue(
      fakeResponse(200, { 'content-type': 'text/html' }, 'a'.repeat(MAX_PAGE_BYTES + 1))
    );
    await expect(safeFetchPageText('https://example.com/huge', 5000, { fetchImpl: huge })).rejects.toThrow(/trop volumineuse/);
  });

  it('refuses a public-looking hostname whose DNS answer is an internal address when a lookup hook is given', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      safeFetchPageText('https://intranet.evil.example/page', 5000, {
        fetchImpl,
        lookup: async () => ['10.0.0.5'],
      })
    ).rejects.toThrowError(SsrfBlockedError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('proceeds when the lookup hook resolves only public addresses', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(fakeResponse(200, { 'content-type': 'text/html' }, '<p>ok</p>'));
    const text = await safeFetchPageText('https://example.com/article', 5000, {
      fetchImpl,
      lookup: async () => ['93.184.216.34'],
    });
    expect(text).toBe('ok');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
