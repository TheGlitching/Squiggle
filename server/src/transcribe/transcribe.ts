/**
 * `POST /web/transcribe`: the text of a recording a signed-in reader sent
 * from the site, for them to read over and analyse like a pasted text.
 *
 * Everything that can refuse is checked before anything is paid for: the
 * format and the duration, which the server reads from the bytes themselves
 * (`shared/src/hosted/wav.ts`), the account's remaining analyses, since a
 * transcript is only worth having to analyse it, then the account's daily
 * minutes and the site's. The two daily allowances are the spending cap:
 * whatever happens, the site never pays for more than `dailyMinutes` of
 * sound in a UTC day. Only then is the sound sent, and the minutes it took
 * are counted for the owner's page.
 *
 * Neither the file nor its text is kept: the file is in memory for the call,
 * the text goes back in the response, and no log line carries either.
 */
import { HOSTED_TRANSCRIPTION, MAX_WAV_BYTES, wavSeconds } from '@squiggle/shared';

import { entitlementOf, refusalFor } from '../billing/quota';
import type { Db, MetricName, UserRow } from '../db/types';
import type { Clock } from '../lib/clock';
import { apiError, type Outcome } from '../lib/errors';
import { logEvent } from '../lib/log';
import { countMetric } from '../metrics';
import { ACCOUNT_TRANSCRIPTION_SECONDS_PER_DAY, DAY_MS, TRANSCRIPTION_RATE_SCOPE_PREFIX } from '../usage/limits';
import { TranscriptionFailed, type Segment, type Transcriber } from './openrouter';

export interface TranscribeServices {
  db: Db;
  clock: Clock;
  transcriber?: Transcriber;
  /** The site's daily allowance, in minutes of sound; 0 closes transcription. */
  dailyMinutes: number;
  requestId: string;
}

const ACCOUNT_SCOPE = `${TRANSCRIPTION_RATE_SCOPE_PREFIX}user`;
const SITE_SCOPE = `${TRANSCRIPTION_RATE_SCOPE_PREFIX}all`;

export async function transcribeRecording(
  s: TranscribeServices,
  user: UserRow,
  req: Request,
): Promise<Outcome<{ text: string; segments: Segment[]; seconds: number }>> {
  const now = s.clock.now();
  const count = (name: MetricName) => countMetric(s.db, name, now, s.requestId);
  if (!s.transcriber || s.dailyMinutes <= 0) {
    return apiError('internal', 'La transcription n’est pas ouverte sur ce serveur.');
  }

  const tooLong = () =>
    apiError('media_too_long', `Un enregistrement de ${HOSTED_TRANSCRIPTION.maxSeconds / 60} minutes au plus par analyse.`);
  if (Number(req.headers.get('content-length') ?? 0) > MAX_WAV_BYTES) return tooLong();
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length > MAX_WAV_BYTES) return tooLong();
  const exact = wavSeconds(bytes);
  if (exact === null || exact < 1) return apiError('media_unreadable', 'Ce son n’a pas pu être lu.');
  const seconds = Math.ceil(exact);

  const refusal = refusalFor(await entitlementOf(s.db, user, now));
  if (refusal) return refusal;

  const account = { scope: ACCOUNT_SCOPE, key: user.id, windowMs: DAY_MS, now, amount: seconds };
  const site = { scope: SITE_SCOPE, key: 'all', windowMs: DAY_MS, now, amount: seconds };
  if (!(await s.db.recordAndCheckRate({ ...account, limit: ACCOUNT_TRANSCRIPTION_SECONDS_PER_DAY })).allowed) {
    await s.db.releaseRate(account);
    await count('refused_transcription_limit');
    return apiError(
      'transcription_limit',
      `Vous avez transcrit ${ACCOUNT_TRANSCRIPTION_SECONDS_PER_DAY / 60} minutes aujourd’hui, le plus qu’un compte peut en un jour. Reprenez demain.`,
    );
  }
  if (!(await s.db.recordAndCheckRate({ ...site, limit: s.dailyMinutes * 60 })).allowed) {
    await s.db.releaseRate(account);
    await s.db.releaseRate(site);
    await count('refused_transcription_closed');
    return apiError(
      'transcription_closed',
      'Squiggle a transcrit aujourd’hui tout ce qu’il peut en un jour. Reprenez demain, ou collez la transcription si vous l’avez.',
    );
  }

  try {
    const transcript = await s.transcriber(bytes);
    await count('transcription');
    await countMetric(s.db, 'transcription_seconds', now, s.requestId, seconds);
    return { ok: true, ...transcript, seconds };
  } catch (err) {
    if (!(err instanceof TranscriptionFailed)) throw err;
    // A failed call is not billed: the minutes go back to both allowances.
    // ponytail: pieces transcribed before one failed were billed and are not counted; a partial count if failures cost.
    await s.db.releaseRate(account);
    await s.db.releaseRate(site);
    await count('transcription_failed');
    logEvent({ event: 'provider_failed', requestId: s.requestId, userId: user.id, scope: 'transcription' });
    return apiError('provider_unavailable', 'La transcription n’a pas abouti. Réessayez dans quelques minutes.');
  }
}
