/**
 * A video's transcript, pasted in place of an article.
 *
 * YouTube's "Afficher la transcription" copies as a timestamp line then a line
 * of speech, sometimes with the timestamp spelled out again for screen readers
 * ("2 secondes"); other tools put the time at the start of the line, and
 * subtitle files (SRT, WebVTT) add a cue number and an end time. The times are
 * not speech: left in, they would be read and quoted as part of the text. So a
 * paste that looks like a transcript is read as passages, each with the time
 * it starts at, and only the speech goes to the analysis. The report shows the
 * time beside each passage, which is how a reader finds it again in the video.
 */

/** A stretch of speech and the second it starts at in the video. */
export interface Passage {
  at: number;
  text: string;
}

/** Where, in a paragraph's text, one of its passages starts, and when. */
export interface Start {
  offset: number;
  at: number;
}

/** Passages joined into a paragraph, each keeping its own time. */
export interface Paragraph extends Passage {
  starts: Start[];
}

/** `1:02:03`, `12:03` or `0:12`, with the milliseconds a subtitle file adds. */
const TIME = String.raw`(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,]\d{1,3})?`;
/** A time alone on its line, bare or in brackets. */
const TIME_LINE = new RegExp(String.raw`^[[(]?${TIME}[\])]?$`);
/** A time opening a line of speech: `0:12 bonjour`, `[00:12] bonjour`, `(0:12) - bonjour`. */
const TIME_LEAD = new RegExp(String.raw`^[[(]?${TIME}[\])]?\s*[-–:]?\s+(\S.*)$`);
/** A subtitle cue's timing: its start, an arrow, its end, maybe its settings. */
const CUE_LINE = new RegExp(String.raw`^${TIME}\s*-->\s*${TIME}`);
/** The timestamp a screen reader is given, which a copy picks up: `2 secondes`, `1 minute et 5 secondes`. */
const SPOKEN_TIME =
  /^\d+ (?:heures?|minutes?|secondes?|hours?|minutes?|seconds?)(?:,? (?:et |and )?\d+ (?:heures?|minutes?|secondes?|hours?|minutes?|seconds?))*$/i;
/** A subtitle file's own lines, which carry no speech. */
const SUBTITLE_NOISE = /^(?:WEBVTT\b.*|NOTE\b.*|Kind:.*|Language:.*|STYLE|REGION)$/;

/**
 * Speech this short is cut in mid-phrase (YouTube's segments are a few words):
 * passages are joined into paragraphs, timed by their first. A paragraph ends
 * after a sentence, so that a quote rarely straddles two of them and can still
 * be found in the text; automatic captions have no punctuation, so past a
 * longer length it ends anyway.
 */
const PARAGRAPH_CHARS = 300;
// ponytail: a hard cut on unpunctuated speech can split a quote; a quote found across two blocks would fix it.
const MAX_PARAGRAPH_CHARS = 1_200;
const SENTENCE_END = /[.!?…»"]$/;

function seconds(match: RegExpExecArray): number {
  const [, hours, minutes, secs] = match;
  return Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(secs);
}

/**
 * The passages of a pasted transcript, or `null` when the paste does not read
 * as one. It does when at least three times mark its lines, one for every two
 * lines of speech or more, and they never run backwards: an article that
 * mentions an hour, or a live blog listing its newest post first, stays an
 * article.
 */
export function readTranscript(text: string): Paragraph[] | null {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim());
  const passages: Passage[] = [];
  let marks = 0;
  let speech = 0;
  let afterTime = false;

  lines.forEach((line, index) => {
    if (!line || SUBTITLE_NOISE.test(line)) return;
    // A subtitle cue's number, just above its timing.
    if (/^\d+$/.test(line) && CUE_LINE.test(lines[index + 1] ?? '')) return;
    if (afterTime && SPOKEN_TIME.test(line)) return;

    const alone = TIME_LINE.exec(line) ?? CUE_LINE.exec(line);
    const lead = alone ? null : TIME_LEAD.exec(line);
    afterTime = alone !== null;
    if (alone || lead) {
      marks += 1;
      passages.push({ at: seconds((alone ?? lead)!), text: lead ? lead[4] : '' });
      if (lead) speech += 1;
      return;
    }
    speech += 1;
    // Speech before the first time (a title, a chapter heading) starts the video.
    if (passages.length === 0) passages.push({ at: 0, text: '' });
    const last = passages[passages.length - 1];
    last.text = last.text ? `${last.text} ${line}` : line;
  });

  if (marks < 3 || marks * 2 < speech) return null;
  if (passages.some((passage, i) => i > 0 && passage.at < passages[i - 1].at)) return null;

  const paragraphs: Paragraph[] = [];
  for (const passage of passages) {
    if (!passage.text) continue;
    const last = paragraphs[paragraphs.length - 1];
    const open =
      last &&
      last.text.length < MAX_PARAGRAPH_CHARS &&
      (last.text.length < PARAGRAPH_CHARS || !SENTENCE_END.test(last.text));
    if (open) {
      last.starts.push({ offset: last.text.length + 1, at: passage.at });
      last.text = `${last.text} ${passage.text}`;
    } else paragraphs.push({ ...passage, starts: [{ offset: 0, at: passage.at }] });
  }
  return paragraphs.length > 0 ? paragraphs : null;
}

/** The time of the passage that `offset` falls in. */
export function timeAt(starts: Start[], offset: number): number {
  let at = starts[0].at;
  for (const start of starts) if (start.offset <= offset) at = start.at;
  return at;
}

/** A time as the video player writes it: `0:12`, `12:03`, `1:02:03`. */
export function videoTime(at: number): string {
  const h = Math.floor(at / 3600);
  const m = Math.floor((at % 3600) / 60);
  const s = String(at % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
