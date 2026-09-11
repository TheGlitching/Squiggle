/**
 * Human-typable codes: the login code and the manual extension-bridge code.
 *
 * Both are read off one screen and typed into another, so the alphabet drops
 * the characters people confuse (`I`, `O`, `0`, `1`) and normalization is
 * forgiving about case, spaces and dashes.
 *
 * Eight symbols of a 32-symbol alphabet is 40 bits. That is far weaker than a
 * 128-bit link token, which is why both callers pair it with a ten-minute TTL
 * and a per-IP rate limit; at the rates those enforce, guessing is not a
 * realistic attack. The raw code is only ever hashed in storage, exactly like
 * the link token it replaces.
 */
import { randomBytes } from '@squiggle/shared';

export const HUMAN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateHumanCode(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += HUMAN_CODE_ALPHABET[bytes[i] % HUMAN_CODE_ALPHABET.length];
  }
  return out;
}

export function normalizeHumanCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]/g, '');
}