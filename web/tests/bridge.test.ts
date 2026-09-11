/**
 * The bridge URL contract: the extension builds `…?ext=…&pub=…`, the web app
 * parses it and builds the `chrome-extension://…/squiggle-auth` navigation.
 * A byte that changes here changes what the extension must implement, so the
 * encoding is pinned.
 */
import { describe, expect, it } from 'vitest';

import { buildExtensionAuthUrl, parseBridgeJwk, parseBridgeQuery } from '../src/bridge';

const JWK = { kty: 'EC', crv: 'P-256', x: 'abc_DEF-123', y: '456' };

describe('parseBridgeQuery', () => {
  it('reads the extension id and the decoded public key', () => {
    const search = `?ext=abcdefghijklmnopabcdefghijklmnop&pub=${encodeURIComponent(JSON.stringify(JWK))}`;
    expect(parseBridgeQuery(search)).toEqual({
      ext: 'abcdefghijklmnopabcdefghijklmnop',
      pub: JSON.stringify(JWK),
    });
  });

  it('returns null when a parameter is missing', () => {
    expect(parseBridgeQuery('?ext=abc')).toBeNull();
    expect(parseBridgeQuery('?pub=%7B%7D')).toBeNull();
    expect(parseBridgeQuery('')).toBeNull();
  });
});

describe('parseBridgeJwk', () => {
  it('accepts a JSON object and refuses anything else', () => {
    expect(parseBridgeJwk(JSON.stringify(JWK))).toEqual(JWK);
    expect(parseBridgeJwk('not json')).toBeNull();
    expect(parseBridgeJwk('"a string"')).toBeNull();
    expect(parseBridgeJwk('null')).toBeNull();
  });
});

describe('buildExtensionAuthUrl', () => {
  it('percent-encodes the token, the key and the key id', () => {
    const url = buildExtensionAuthUrl('ext-id', 'tok/with+chars', JSON.stringify(JWK), 'key 1');
    expect(url.startsWith('chrome-extension://ext-id/squiggle-auth.html?')).toBe(true);
    const query = new URLSearchParams(url.slice(url.indexOf('?') + 1));
    expect(query.get('token')).toBe('tok/with+chars');
    expect(query.get('pub')).toBe(JSON.stringify(JWK));
    expect(query.get('keyId')).toBe('key 1');
    // The encoded bytes survive a round trip, so the extension can hash them.
    expect(parseBridgeQuery(`?ext=ext-id&pub=${query.get('pub')}`)?.pub).toBe(JSON.stringify(JWK));
  });
});
