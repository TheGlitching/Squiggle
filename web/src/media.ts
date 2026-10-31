/**
 * A recording the reader imports or shares (a video they saved, a voice
 * message, a podcast episode), turned into the one sound format the server
 * transcribes (`shared/src/hosted/wav.ts`).
 *
 * Only the sound leaves the device, and only fifteen minutes of it at a
 * time: one part is one transcription and one analysis. The picture of a
 * video never does. The browser decodes the file itself, whatever its
 * container, and resamples it to the transcription's rate as it does.
 */
import { HOSTED_TRANSCRIPTION } from '../../shared/src/hosted/disclosure';
import { encodeWav } from '../../shared/src/hosted/wav';
import { videoTime } from '../../shared/src/extract/transcript';
import type { Segment } from './api';

/** One part: what one transcription, hence one analysis, covers. */
export const PART_SECONDS = HOSTED_TRANSCRIPTION.maxSeconds;

/**
 * The browser holds the whole decoded sound to cut a part out of it, so the
 * file is bounded: a phone runs out of memory well before a desktop does.
 */
// ponytail: the whole file is decoded at once; a long episode on a small phone may not fit. WebCodecs would decode one part only.
export const MAX_MEDIA_BYTES = 500 * 1024 * 1024;
export const MAX_MEDIA_SECONDS = 3 * 60 * 60;

export function isMedia(file: Blob): boolean {
  return file.type.startsWith('audio/') || file.type.startsWith('video/');
}

/**
 * The duration the file's own header gives, read without decoding it, or
 * null when it gives none (a recording still being written says Infinity).
 */
export function mediaDuration(file: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const element = document.createElement('video');
    const url = URL.createObjectURL(file);
    const done = (seconds: number | null) => {
      clearTimeout(timer);
      element.removeAttribute('src');
      URL.revokeObjectURL(url);
      resolve(seconds);
    };
    const timer = setTimeout(() => done(null), 10_000);
    element.preload = 'metadata';
    element.onloadedmetadata = () => done(Number.isFinite(element.duration) ? element.duration : null);
    element.onerror = () => done(null);
    element.src = url;
  });
}

export function partsOf(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / PART_SECONDS));
}

/** `0:00 à 15:00`: where a part starts and ends in the recording. */
export function partSpan(index: number, seconds: number): string {
  const start = index * PART_SECONDS;
  return `${videoTime(start)} à ${videoTime(Math.min(Math.floor(seconds), start + PART_SECONDS))}`;
}

/**
 * The sound of part `index`, mono, at the transcription's rate, and the
 * duration of the whole recording, which decoding tells exactly.
 * Rejects when the browser cannot decode the file.
 */
export async function soundPart(file: Blob, index: number): Promise<{ wav: Blob; seconds: number }> {
  const rate = HOSTED_TRANSCRIPTION.sampleRate;
  const context = new OfflineAudioContext(1, 1, rate);
  const sound = await context.decodeAudioData(await file.arrayBuffer());
  const start = Math.min(sound.length, index * PART_SECONDS * rate);
  const end = Math.min(sound.length, start + PART_SECONDS * rate);
  const mono = new Float32Array(end - start);
  for (let c = 0; c < sound.numberOfChannels; c++) {
    const channel = sound.getChannelData(c);
    for (let i = 0; i < mono.length; i++) mono[i] += channel[start + i] / sound.numberOfChannels;
  }
  return { wav: new Blob([encodeWav(mono)], { type: 'audio/wav' }), seconds: sound.duration };
}

/**
 * The transcription as the text field takes it: one timed line per segment,
 * at its time in the whole recording, which `readTranscript` reads back as a
 * transcript, so the report shows each passage's time. Without times, the
 * text alone.
 */
export function transcriptText(text: string, segments: Segment[], index: number): string {
  if (!segments.length) return text;
  const offset = index * PART_SECONDS;
  return segments.map((s) => `${videoTime(Math.floor(offset + s.start))} ${s.text}`).join('\n');
}

const SHARE_CACHE = 'squiggle-partage';
/** Where `sw.js` keeps a recording shared to the installed app. */
const SHARED_MEDIA = '/partage/media';

/** The recording shared to the installed app, once: it does not stay on the device. */
export async function takeSharedMedia(): Promise<Blob | null> {
  if (typeof caches === 'undefined') return null;
  try {
    const cache = await caches.open(SHARE_CACHE);
    const response = await cache.match(SHARED_MEDIA);
    await caches.delete(SHARE_CACHE);
    return response ? await response.blob() : null;
  } catch {
    return null;
  }
}
