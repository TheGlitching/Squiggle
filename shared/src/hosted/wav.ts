/**
 * The sound a recording sent from the site is transcribed from, as one fixed
 * format: a WAV file of 16-bit PCM, mono, at `HOSTED_TRANSCRIPTION.sampleRate`.
 *
 * The site decodes whatever file the reader picked (a video, a voice message,
 * an episode) and writes this; the server accepts nothing else. A fixed,
 * uncompressed format is what lets the server know the duration from the
 * byte count alone, before anything is paid for: a header could claim any
 * duration, the data it carries cannot. Both halves read this one file, so the
 * encoder and the check cannot drift apart.
 */
import { HOSTED_TRANSCRIPTION } from './disclosure';

const HEADER_BYTES = 44;
const BYTES_PER_SECOND = HOSTED_TRANSCRIPTION.sampleRate * 2;

function header(bytes: Uint8Array, dataBytes: number): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, HEADER_BYTES);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
  };
  ascii(0, 'RIFF');
  view.setUint32(4, dataBytes + HEADER_BYTES - 8, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, HOSTED_TRANSCRIPTION.sampleRate, true);
  view.setUint32(28, BYTES_PER_SECOND, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);
}

/** The WAV file of `samples` (mono, at the transcription rate, each in [-1, 1]). */
export function encodeWav(samples: Float32Array): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(HEADER_BYTES + samples.length * 2);
  const view = new DataView(bytes.buffer);
  header(bytes, samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(HEADER_BYTES + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytes;
}

/** The largest file the server accepts: `maxSeconds` of sound and its header. */
export const MAX_WAV_BYTES = HEADER_BYTES + HOSTED_TRANSCRIPTION.maxSeconds * BYTES_PER_SECOND;

/**
 * The duration of a file in exactly the format `encodeWav` writes, in seconds,
 * or null for anything else: another format, another rate, a header whose
 * sizes disagree with the bytes that follow it.
 */
export function wavSeconds(bytes: Uint8Array): number | null {
  if (bytes.length < HEADER_BYTES) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  const ok =
    ascii(0) === 'RIFF' &&
    view.getUint32(4, true) === bytes.length - 8 &&
    ascii(8) === 'WAVE' &&
    ascii(12) === 'fmt ' &&
    view.getUint32(16, true) === 16 &&
    view.getUint16(20, true) === 1 &&
    view.getUint16(22, true) === 1 &&
    view.getUint32(24, true) === HOSTED_TRANSCRIPTION.sampleRate &&
    view.getUint32(28, true) === BYTES_PER_SECOND &&
    view.getUint16(32, true) === 2 &&
    view.getUint16(34, true) === 16 &&
    ascii(36) === 'data' &&
    view.getUint32(40, true) === bytes.length - HEADER_BYTES;
  return ok ? (bytes.length - HEADER_BYTES) / BYTES_PER_SECOND : null;
}

/**
 * A file `wavSeconds` accepts, cut into files of `seconds` each (the last one
 * shorter), each in the same format, so that a long recording can be sent a
 * piece at a time. Lazy: a piece is copied out only when it is asked for.
 */
export function* splitWav(bytes: Uint8Array, seconds: number): Generator<Uint8Array<ArrayBuffer>> {
  const step = seconds * BYTES_PER_SECOND;
  for (let start = HEADER_BYTES; start < bytes.length; start += step) {
    const data = bytes.subarray(start, Math.min(bytes.length, start + step));
    const piece = new Uint8Array(HEADER_BYTES + data.length);
    header(piece, data.length);
    piece.set(data, HEADER_BYTES);
    yield piece;
  }
}
