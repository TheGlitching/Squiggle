import { sha256Hex } from '@squiggle/shared';

/**
 * Compare two strings without leaking, through timing, how much of one an
 * attacker guessed right.
 *
 * A plain `===` short-circuits at the first differing byte, so its duration is
 * a signal: an admin-token guess that matches one more character takes one step
 * longer, and the token can be recovered character by character. Both sides are
 * hashed to a fixed-length SHA-256 digest first, so the walk below always runs
 * over the same number of bytes and the XOR accumulation touches every one of
 * them regardless of where the values first differ.
 */
export async function secureEquals(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i += 1) {
    diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  }
  return diff === 0;
}
