// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { HOSTED_TRANSCRIPTION } from '../src/hosted/disclosure';
import { encodeWav, MAX_WAV_BYTES, wavSeconds } from '../src/hosted/wav';

const rate = HOSTED_TRANSCRIPTION.sampleRate;

describe('the transcription sound format', () => {
  it('reads back the duration of what the site writes', () => {
    expect(wavSeconds(encodeWav(new Float32Array(rate * 3)))).toBe(3);
  });

  it('caps a file at the most one transcription covers', () => {
    expect(MAX_WAV_BYTES).toBe(encodeWav(new Float32Array(rate * HOSTED_TRANSCRIPTION.maxSeconds)).length);
  });

  it('refuses a header that claims more or less than the bytes it carries', () => {
    const wav = encodeWav(new Float32Array(rate));
    expect(wavSeconds(wav.subarray(0, wav.length - 2))).toBeNull();
    const longer = new Uint8Array(wav.length + 2);
    longer.set(wav);
    expect(wavSeconds(longer)).toBeNull();
  });

  it('refuses any other rate or channel count', () => {
    const stereo = encodeWav(new Float32Array(rate));
    new DataView(stereo.buffer).setUint16(22, 2, true);
    expect(wavSeconds(stereo)).toBeNull();
    const fast = encodeWav(new Float32Array(rate));
    new DataView(fast.buffer).setUint32(24, 44_100, true);
    expect(wavSeconds(fast)).toBeNull();
    expect(wavSeconds(new TextEncoder().encode('ID3 not a wav at all, long enough to pass the size'))).toBeNull();
  });

  it('clips samples past full scale instead of wrapping them', () => {
    const view = new DataView(encodeWav(new Float32Array([2, -2])).buffer);
    expect(view.getInt16(44, true)).toBe(0x7fff);
    expect(view.getInt16(46, true)).toBe(-0x8000);
  });
});
