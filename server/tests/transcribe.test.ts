/**
 * `POST /web/transcribe`: a recording's text, for a signed-in reader.
 *
 * What is pinned is what keeps transcription from costing more than it is
 * allowed to: nothing is sent for transcription before the format, the
 * duration, the account's remaining analyses and both daily allowances have
 * said yes, and a failed call gives its minutes back. The transcriber is a
 * stub; the OpenRouter call itself is pinned against a fake fetch below.
 */
import { describe, expect, it } from 'vitest';

import { encodeWav, HOSTED_TRANSCRIPTION } from '@squiggle/shared';

import { magicLogin, makeTestEnv, type TestEnv } from './helpers';
import { openRouterTranscriber, TranscriptionFailed, type Transcriber } from '../src/transcribe/openrouter';
import { ACCOUNT_TRANSCRIPTION_SECONDS_PER_DAY } from '../src/usage/limits';
import { collectLaunchMetrics } from '../src/metrics';

const RATE = HOSTED_TRANSCRIPTION.sampleRate;
const wav = (seconds: number) => encodeWav(new Float32Array(Math.round(RATE * seconds)));

function setUp(opts: { dailyMinutes?: number; transcriber?: Transcriber } = {}) {
  const env = makeTestEnv();
  const sent: number[] = [];
  env.services.transcriber =
    opts.transcriber ??
    (async (bytes) => {
      sent.push(bytes.length);
      return { text: 'Bonjour à tous.', segments: [{ start: 0, text: 'Bonjour à tous.' }] };
    });
  env.services.transcriptionDailyMinutes = opts.dailyMinutes ?? 600;
  return { env, sent };
}

function post(env: TestEnv, body: Uint8Array, cookie: string | null, origin: string | null = env.webAppOrigin) {
  const headers: Record<string, string> = { 'content-type': 'audio/wav' };
  if (cookie) headers.cookie = cookie;
  if (origin) headers.origin = origin;
  return env.handler(new Request(`${env.webAppOrigin}/web/transcribe`, { method: 'POST', headers, body }));
}

describe('POST /web/transcribe', () => {
  it('returns the text and its times, and counts the minutes for the owner', async () => {
    const { env, sent } = setUp();
    const { sessionCookie } = await magicLogin(env, 'lecteur@example.fr');
    const res = await post(env, wav(90.2), sessionCookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, text: 'Bonjour à tous.', seconds: 91, segments: [{ start: 0 }] });
    expect(sent).toHaveLength(1);
    const metrics = await collectLaunchMetrics(env.db, env.clock.now(), 1, undefined, 600);
    expect(metrics.transcription).toEqual({
      count: 1,
      failed: 0,
      minutes: 1.5,
      costUsd: Math.round((91 / 60) * HOSTED_TRANSCRIPTION.usdPerMinute * 10000) / 10000,
      dailyCapMinutes: 600,
    });
  });

  it('needs an account and the web app’s own origin', async () => {
    const { env, sent } = setUp();
    expect((await post(env, wav(5), null)).status).toBe(401);
    const { sessionCookie } = await magicLogin(env, 'lecteur@example.fr');
    expect((await post(env, wav(5), sessionCookie, null)).status).toBe(403);
    expect((await post(env, wav(5), sessionCookie, 'https://evil.example')).status).toBe(403);
    expect(sent).toHaveLength(0);
  });

  it('refuses before paying for anything but the one format, or past fifteen minutes', async () => {
    const { env, sent } = setUp();
    const { sessionCookie } = await magicLogin(env, 'lecteur@example.fr');
    const mp3 = new TextEncoder().encode('ID3'.padEnd(4096, 'x'));
    expect(await (await post(env, mp3, sessionCookie)).json()).toMatchObject({ error: 'media_unreadable' });
    expect(await (await post(env, wav(0.5), sessionCookie)).json()).toMatchObject({ error: 'media_unreadable' });
    const long = await post(env, wav(HOSTED_TRANSCRIPTION.maxSeconds + 1), sessionCookie);
    expect(long.status).toBe(413);
    expect(await long.json()).toMatchObject({ error: 'media_too_long' });
    expect((await post(env, wav(HOSTED_TRANSCRIPTION.maxSeconds), sessionCookie)).status).toBe(200);
    expect(sent).toHaveLength(1);
  });

  it('refuses an account with no analysis left, since the text could not be analysed', async () => {
    const { env, sent } = setUp();
    const { sessionCookie, user } = await magicLogin(env, 'lecteur@example.fr');
    await env.db.setPlan(user.id, 'none', null, env.clock.now());
    expect((await post(env, wav(5), sessionCookie)).status).toBe(402);
    expect(sent).toHaveLength(0);
  });

  it('stops an account at its daily minutes, and the next day lets it go on', async () => {
    const { env, sent } = setUp();
    const { sessionCookie } = await magicLogin(env, 'lecteur@example.fr');
    for (let i = 0; i < ACCOUNT_TRANSCRIPTION_SECONDS_PER_DAY / HOSTED_TRANSCRIPTION.maxSeconds; i++) {
      expect((await post(env, wav(HOSTED_TRANSCRIPTION.maxSeconds), sessionCookie)).status).toBe(200);
    }
    const refused = await post(env, wav(5), sessionCookie);
    expect(await refused.json()).toMatchObject({ error: 'transcription_limit' });
    // A refusal holds nothing back: the account is exactly at its allowance, not past it.
    env.clock.advance(24 * 60 * 60 * 1000);
    expect((await post(env, wav(HOSTED_TRANSCRIPTION.maxSeconds), sessionCookie)).status).toBe(200);
    expect(sent).toHaveLength(5);
  });

  it('never pays for more than the site’s daily minutes, all accounts together', async () => {
    const { env, sent } = setUp({ dailyMinutes: 20 });
    const a = await magicLogin(env, 'a@example.fr');
    const b = await magicLogin(env, 'b@example.fr');
    expect((await post(env, wav(15 * 60), a.sessionCookie)).status).toBe(200);
    const closed = await post(env, wav(6 * 60), b.sessionCookie);
    expect(await closed.json()).toMatchObject({ error: 'transcription_closed' });
    // What the refusal reserved went back: five minutes still fit.
    expect((await post(env, wav(5 * 60), b.sessionCookie)).status).toBe(200);
    expect(sent).toHaveLength(2);
    const metrics = await collectLaunchMetrics(env.db, env.clock.now(), 1);
    expect(metrics.funnel.refused.transcription_closed).toBe(1);
  });

  it('gives the minutes back when the call fails, and is closed without a cap', async () => {
    let calls = 0;
    const { env } = setUp({
      dailyMinutes: 15,
      transcriber: async () => {
        calls += 1;
        if (calls === 1) throw new TranscriptionFailed();
        return { text: 'ok', segments: [] };
      },
    });
    const { sessionCookie } = await magicLogin(env, 'lecteur@example.fr');
    expect(await (await post(env, wav(15 * 60), sessionCookie)).json()).toMatchObject({ error: 'provider_unavailable' });
    expect((await post(env, wav(15 * 60), sessionCookie)).status).toBe(200);
    expect((await collectLaunchMetrics(env.db, env.clock.now(), 1)).transcription.failed).toBe(1);

    env.services.transcriptionDailyMinutes = 0;
    expect((await post(env, wav(5), sessionCookie)).status).toBe(500);
    expect(calls).toBe(2);
  });
});

describe('openRouterTranscriber', () => {
  async function bodyOf(init: RequestInit | undefined): Promise<Record<string, any>> {
    return JSON.parse(await new Response(init?.body as ReadableStream).text());
  }

  it('sends the sound whole, to the named host’s zero-retention endpoint only, and reads the times', async () => {
    const sound = encodeWav(Float32Array.from({ length: RATE * 2 }, (_, i) => Math.sin(i / 7)));
    const seen: Array<Record<string, any>> = [];
    const transcribe = openRouterTranscriber('key', (async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://openrouter.ai/api/v1/audio/transcriptions');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer key');
      seen.push(await bodyOf(init));
      return Response.json({
        text: ' Un. Deux. ',
        segments: [
          { start: 0, end: 1, text: ' Un.' },
          { start: 1.4, end: 2, text: 'Deux.' },
          { start: 'x', text: 'ignoré' },
        ],
      });
    }) as typeof fetch);
    expect(await transcribe(sound)).toEqual({
      text: 'Un. Deux.',
      segments: [
        { start: 0, text: 'Un.' },
        { start: 1.4, text: 'Deux.' },
      ],
    });
    const [body] = seen;
    expect(body.model).toBe(HOSTED_TRANSCRIPTION.model);
    expect(body.provider).toEqual({
      order: ['mistral'],
      only: ['mistral'],
      allow_fallbacks: false,
      zdr: true,
      data_collection: 'deny',
    });
    expect(body.input_audio.format).toBe('wav');
    expect(Buffer.from(body.input_audio.data, 'base64').equals(Buffer.from(sound))).toBe(true);
  });

  it('asks for the text alone when the host cannot give times, and fails on anything else', async () => {
    const formats: unknown[] = [];
    const transcribe = openRouterTranscriber('key', (async (_url: string, init?: RequestInit) => {
      const body = await bodyOf(init);
      formats.push(body.response_format);
      return body.response_format ? new Response('{}', { status: 400 }) : Response.json({ text: 'Texte seul.' });
    }) as typeof fetch);
    expect(await transcribe(wav(1))).toEqual({ text: 'Texte seul.', segments: [] });
    expect(formats).toEqual(['verbose_json', undefined]);

    const failing = openRouterTranscriber('key', (async () => new Response('', { status: 502 })) as typeof fetch);
    await expect(failing(wav(1))).rejects.toBeInstanceOf(TranscriptionFailed);
  });
});
