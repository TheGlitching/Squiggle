/**
 * The speech-to-text call: one recording's sound, sent to OpenRouter on our
 * own key, pinned to the host the public pages name, and its zero-retention
 * endpoint (`zdr`). The file is in this process's memory for this one call
 * and nowhere else.
 *
 * The sound goes in pieces of `PIECE_SECONDS`, one after the other, and their
 * texts are joined back with each segment at its time in the whole. Sent
 * whole, fifteen minutes (28.8 MB) never came back, nor did four: measured on
 * 31 October 2026, past about three and a half minutes of sound OpenRouter
 * answers 504 after three minutes, while a minute comes back in two seconds.
 * Even small pieces now and then hang or are refused (429, without a
 * Retry-After), so each is given a short deadline and a few attempts; a
 * refused or abandoned request is not billed.
 */
import { HOSTED_TRANSCRIPTION, splitWav } from '@squiggle/shared';

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
// ponytail: a piece is cut on the second, not on a silence; a word across two pieces may be misheard.
export const PIECE_SECONDS = 60;
/** A minute of sound takes about two seconds: past this deadline the attempt is abandoned. */
const TIMEOUT_MS = 25_000;
/** Attempts per piece, the next after `RETRY_MS`, then twice, then four times that. */
const ATTEMPTS = 4;
const RETRY_MS = 2_500;

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
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

export function openRouterTranscriber(apiKey: string, fetchImpl: typeof fetch = fetch, retryMs = RETRY_MS): Transcriber {
  const call = (fields: Record<string, unknown>) =>
    fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(fields),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

  const piece = async (wav: Uint8Array): Promise<Transcript> => {
    const base = {
      model: HOSTED_TRANSCRIPTION.model,
      provider: {
        order: [HOSTED_TRANSCRIPTION.host.slug],
        only: [HOSTED_TRANSCRIPTION.host.slug],
        allow_fallbacks: false,
        zdr: true,
        data_collection: 'deny',
      },
      input_audio: { format: 'wav', data: base64(wav) },
    };
    let res: Response;
    try {
      // The times are asked for; a host that cannot give them answers 400,
      // which is not billed, and the text alone is asked for instead.
      res = await call({ ...base, response_format: 'verbose_json', timestamp_granularities: ['segment'] });
      if (res.status === 400) res = await call(base);
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

  return async (wav) => {
    const results: Transcript[] = [];
    // One piece at a time: the host answers 429 to a few at once.
    for (const sound of splitWav(wav, PIECE_SECONDS)) results.push(await withRetries(() => piece(sound), retryMs));
    return {
      text: results.map((r) => r.text).filter(Boolean).join(' '),
      segments: results.flatMap((r, i) => r.segments.map((s) => ({ ...s, start: s.start + i * PIECE_SECONDS }))),
    };
  };
}

async function withRetries<T>(attempt: () => Promise<T>, retryMs: number): Promise<T> {
  for (let n = 1; ; n++) {
    try {
      return await attempt();
    } catch (err) {
      if (n >= ATTEMPTS) throw err;
      await new Promise((resolve) => setTimeout(resolve, retryMs * 2 ** (n - 1)));
    }
  }
}
