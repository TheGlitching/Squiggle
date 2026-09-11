import { describe, expect, it } from 'vitest';
import { secureEquals } from '../src/lib/secureCompare';

describe('secureEquals', () => {
  it('accepts only an exact match', async () => {
    expect(await secureEquals('Bearer admin-secret', 'Bearer admin-secret')).toBe(true);
    expect(await secureEquals('Bearer admin-secre', 'Bearer admin-secret')).toBe(false);
    expect(await secureEquals('Bearer admin-secretx', 'Bearer admin-secret')).toBe(false);
    expect(await secureEquals('', 'Bearer admin-secret')).toBe(false);
  });
});
