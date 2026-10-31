/**
 * The speech-to-text call: one recording's sound, sent to OpenRouter on our
 * own key, pinned to the host the public pages name, and its zero-retention
 * endpoint (`zdr`). The file is in this process's memory for this one call
 * and nowhere else.
 *
 * The body is JSON with the sound in base64, because OpenRouter's multipart
 * upload stops at 25 MB and fifteen minutes of our format weigh 28.8. It is
 * streamed, a slice at a time, because a Worker has 128 MB: the file, its
 * base64, the JSON around it and that JSON's bytes held at once would not fit.
 */
import { HOSTED_TRANSCRIPTION } from '@squiggle/shared';

/** A stretch of speech and the second it starts at, in the file sent. */
export interface Segment {
  start: number;
  text: string;
}

/** The text, and its timed segments when the host returns them. */
export interface Transcript {
  text: string;
  segments: Segment[];
}

/** Turns a file in the format of `shared/src/hosted/wav.ts` into its text; throws `TranscriptionFailed`. */
export type Transcriber = (wav: Uint8Array) => Promise<Transcript>;

export class TranscriptionFailed extends Error {}

const ENDPOINT = 'https://openrouter.ai/api/v1/audio/transcriptions';
/** A multiple of 3, so that each slice's base64 joins the next without padding. */
const SLICE_BYTES = 3 * 64 * 1024;
/** Fifteen minutes of sound take well under a minute; past this the reader is better told to retry. */
const TIMEOUT_MS = 170_000;

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function body(fields: Record<string, unknown>, wav: Uint8Array): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const json = JSON.stringify({ ...fields, input_audio: { format: 'wav', data: '' } });
  const [head, tail] = json.split('"data":""');
  let offset = -1;
  return new ReadableStream({
    pull(controller) {
      if (offset < 0) {
        controller.enqueue(encoder.encode(`${head}"data":"`));
        offset = 0;
      } else if (offset < wav.length) {
        controller.enqueue(encoder.encode(base64(wav.subarray(offset, offset + SLICE_BYTES))));
        offset += SLICE_BYTES;
      } else {
        controller.enqueue(encoder.encode(`"${tail}`));
        controller.close();
      }
    },
  });
}

function segmentsOf(raw: unknown): Segment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (s): s is { start: number; text: string } =>
        typeof s?.start === 'number' && Number.isFinite(s.start) && typeof s?.text === 'string',
    )
    .map((s) => ({ start: Math.max(0, s.start), text: s.text.trim() }))
    .filter((s) => s.text);
}

export function openRouterTranscriber(apiKey: string, fetchImpl: typeof fetch = fetch): Transcriber {
  const call = (fields: Record<string, unknown>, wav: Uint8Array) =>
    fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: body(fields, wav),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Node's fetch refuses a stream body without it; the Workers runtime ignores it.
      duplex: 'half',
    } as RequestInit);

  return async (wav) => {
    const base = {
      model: HOSTED_TRANSCRIPTION.model,
      provider: {
        order: [HOSTED_TRANSCRIPTION.host.slug],
        only: [HOSTED_TRANSCRIPTION.host.slug],
        allow_fallbacks: false,
        zdr: true,
        data_collection: 'deny',
      },
    };
    let res: Response;
    try {
      // The times are asked for; a host that cannot give them answers 400,
      // which is not billed, and the text alone is asked for instead.
      res = await call({ ...base, response_format: 'verbose_json', timestamp_granularities: ['segment'] }, wav);
      if (res.status === 400) res = await call(base, wav);
    } catch {
      throw new TranscriptionFailed();
    }
    if (!res.ok) throw new TranscriptionFailed();
    let answer: { text?: unknown; segments?: unknown };
    try {
      answer = await res.json();
    } catch {
      throw new TranscriptionFailed();
    }
    const text = typeof answer.text === 'string' ? answer.text.trim() : '';
    return { text, segments: segmentsOf(answer.segments) };
  };
}
