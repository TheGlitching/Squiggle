// @vitest-environment node
//
// These tests exercise real ECDSA P-256 via WebCrypto, so they run in the Node
// environment (Node 22 ships a full WebCrypto) rather than the repo-default
// happy-dom, whose subtle-crypto coverage of ECDSA is not guaranteed.
import { describe, it, expect } from 'vitest';
import {
  base64urlEncode,
  base64urlDecode,
  sha256Hex,
  randomBytes,
  randomToken,
  generateSigningKeyPair,
  exportP256Jwk,
  importP256Jwk,
  buildSigningInput,
  signRequest,
  verifyRequest,
  type P256Jwk,
} from '@squiggle/shared';

describe('base64url codec', () => {
  it('round-trips byte strings of every length mod 3', () => {
    for (const len of [0, 1, 2, 3, 4, 5, 31, 32, 33, 100]) {
      const bytes = randomBytes(len);
      const enc = base64urlEncode(bytes);
      expect(enc).not.toMatch(/[+/=]/);
      expect(base64urlDecode(enc)).toEqual(bytes);
    }
  });

  it('matches known base64url vectors (RFC 4648 §5, url-safe)', () => {
    // "foo" -> "Zm9v", "foobar" -> "Zm9vYmFy"
    expect(base64urlEncode(new TextEncoder().encode('foo'))).toBe('Zm9v');
    expect(base64urlEncode(new TextEncoder().encode('foobar'))).toBe('Zm9vYmFy');
  });
});

describe('sha256Hex', () => {
  it('hashes known vectors', async () => {
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('hashes binary input identically whether given as a view or an ArrayBuffer', async () => {
    const bytes = randomBytes(64);
    const fromView = await sha256Hex(bytes);
    // Same bytes in a fresh ArrayBuffer must hash identically.
    const ab = new ArrayBuffer(bytes.length);
    new Uint8Array(ab).set(bytes);
    expect(await sha256Hex(ab)).toBe(fromView);
  });
});

describe('randomToken / randomBytes', () => {
  it('produces the requested length and unique values', () => {
    expect(randomBytes(16)).toHaveLength(16);
    const t1 = randomToken(32);
    const t2 = randomToken(32);
    expect(t1).not.toBe(t2);
    expect(base64urlDecode(t1)).toHaveLength(32);
  });
});

describe('P-256 key export/import', () => {
  it('exports a minimal JWK and re-imports it for verification', async () => {
    const pair = await generateSigningKeyPair();
    expect(pair.privateKey.algorithm.name).toBe('ECDSA');
    const jwk = await exportP256Jwk(pair.publicKey);
    expect(jwk.kty).toBe('EC');
    expect(jwk.crv).toBe('P-256');
    expect(jwk.x).toBeTruthy();
    expect(jwk.y).toBeTruthy();
    const imported = await importP256Jwk(jwk);
    expect(imported.extractable).toBe(true);
    expect(imported.usages).toContain('verify');
  });

  it('rejects a malformed JWK', async () => {
    await expect(
      importP256Jwk({ kty: 'EC', crv: 'P-256', x: '!!not-base64url!!', y: '??' } as unknown as P256Jwk),
    ).rejects.toThrow();
  });
});

describe('sign / verify', () => {
  async function makePair() {
    const pair = await generateSigningKeyPair();
    const jwk = await exportP256Jwk(pair.publicKey);
    const verifyKey = await importP256Jwk(jwk);
    return { pair, verifyKey };
  }

  it('verifies a signature made by the matching key', async () => {
    const { pair, verifyKey } = await makePair();
    const input = 'POST\n/v1/analyze/audit\nnonce-123\n1700000000\ndeadbeef';
    const sig = await signRequest(pair.privateKey, input);
    expect(await verifyRequest(verifyKey, input, sig)).toBe(true);
  });

  it('rejects a signature checked against a different key', async () => {
    const a = await makePair();
    const b = await makePair();
    const input = 'GET\n/v1/account\nn\n1700000000\ne3b0';
    const sig = await signRequest(a.pair.privateKey, input);
    expect(await verifyRequest(b.verifyKey, input, sig)).toBe(false);
  });

  it('rejects a signature when the input is altered (tamper)', async () => {
    const { pair, verifyKey } = await makePair();
    const input = 'POST\n/v1/analyze/audit\nn\n1700000000\ndeadbeef';
    const sig = await signRequest(pair.privateKey, input);
    expect(await verifyRequest(verifyKey, input.replace('POST', 'PUT'), sig)).toBe(false);
  });

  it('rejects a malformed signature without throwing', async () => {
    const { verifyKey } = await makePair();
    expect(await verifyRequest(verifyKey, 'x', 'not-a-real-signature!!!')).toBe(false);
  });
});

describe('buildSigningInput', () => {
  it('builds the canonical string in the documented field order', async () => {
    const input = await buildSigningInput({
      method: 'get',
      path: '/v1/analyze/audit?x=1',
      nonce: 'nonce-abc',
      timestamp: 1700000000,
      body: null,
    });
    // Empty body hash is the SHA-256 of the empty string.
    expect(input).toBe(
      'GET\n/v1/analyze/audit?x=1\nnonce-abc\n1700000000\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('folds the body into the string via its SHA-256', async () => {
    const body = JSON.stringify({ a: 1 });
    const expectedHash = await sha256Hex(body);
    const input = await buildSigningInput({
      method: 'POST',
      path: '/v1/x',
      nonce: 'n',
      timestamp: 5,
      body,
    });
    expect(input.split('\n')[4]).toBe(expectedHash);
  });

  it('truncates a fractional timestamp to whole seconds', async () => {
    const input = await buildSigningInput({ method: 'GET', path: '/', nonce: 'n', timestamp: 5.9, body: null });
    expect(input.split('\n')[3]).toBe('5');
  });
});
