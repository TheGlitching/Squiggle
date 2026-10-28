// @vitest-environment node
/**
 * Real screenshots, read by the same OCR and model the site serves, then
 * stitched. The screenshots in `captures/` (see its README) are phone-sized
 * captures of a Wikipedia article, in light and dark mode, and of a YouTube
 * transcript panel, each taken once with the overlap a reader leaves when
 * scrolling and once with screens that only touch. What is pinned: every
 * sentence that crosses two screenshots comes out once and whole, no chrome is
 * left, a dark page reads as well as a light one, and a transcript comes out as
 * one the analysis reads as a transcript.
 */
import { resolve } from 'node:path';

import { createWorker, type Worker } from 'tesseract.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { linesOf, stitchCaptures } from '../src/captures';
import { pasteProblem } from '../src/paste';
import { readTranscript } from '../src/transcript';

const MODEL = resolve(__dirname, '../../node_modules/@tesseract.js-data/fra/4.0.0_best_int');

let worker: Worker;
beforeAll(async () => {
  worker = await createWorker('fra', 1, { langPath: MODEL, cacheMethod: 'none' });
}, 60_000);
afterAll(() => worker?.terminate());

async function stitched(name: string, count: number): Promise<string> {
  const captures = [];
  for (let i = 1; i <= count; i++) {
    const { data } = await worker.recognize(resolve(__dirname, 'captures', `${name}-${i}.png`), {}, { blocks: true });
    captures.push(linesOf(data));
  }
  return stitchCaptures(captures);
}

const times = (text: string, part: string) => text.split(part).length - 1;

/** The phone's and the app's chrome, which none of the results may keep. */
const CHROME = /\b4G\b|\d+ ?%|Accueil Rechercher|Synchroniser avec|Rechercher dans la transcription|Se connecter|\bYou[tl]ube\b/i;

describe('screenshots of an article', () => {
  it.each([
    ['with an overlap', 'wiki-overlap', 3],
    ['without an overlap', 'wiki-flush', 2],
  ])('stitches them %s, each sentence once and whole', async (_, name, count) => {
    const text = await stitched(name, count);
    expect(text).not.toMatch(CHROME);
    // Across the first and the second screenshot.
    expect(times(text, 'régimes libéraux ont aussi recours à ces')).toBe(1);
    // Where the screens only touch, the line under the edge is half read on each; the rest is whole.
    expect(times(text, "C'est depuis l'apparition d'Internet, et surtout dans")).toBe(1);
    expect(times(text, 'élections de Donald Trump et du Brexit), que le terme sera plus étroitement lié')).toBe(1);
    expect(text).toMatch(/\nAlors que Lippmann emploie l'expression fabrication du consentement, Bernays emploie le terme de propagande\.\n/);
    expect(pasteProblem({ title: '', source: '', text })).toBeNull();
  }, 60_000);

  it('drops only the chrome when the reader overlapped every screenshot, the second with the third too', async () => {
    const text = await stitched('wiki-overlap', 3);
    expect(text).toContain(
      "C'est depuis l'apparition d'Internet, et surtout dans un contexte électoral (notamment dans le cadre des élections de Donald Trump et du Brexit), que le terme sera plus étroitement lié à la question de l'information numérique.",
    );
    expect(times(text, 'Depuis les années 2020, la désinformation climatique se répend')).toBe(1);
    expect(times(text, 'En 2017, Caroline Jack publie')).toBe(1);
    expect(text).toMatch(/\nChez Lippmann, la désinformation est un simple transfert d'information/);
  }, 60_000);

  it('reads a page in dark mode, where the status bar shows on one screenshot only', async () => {
    const text = await stitched('wiki-dark', 2);
    expect(text).not.toMatch(CHROME);
    expect(text).not.toMatch(/^10:4\d/m);
    expect(times(text, 'souvent de propagande pour servir leurs intérêts')).toBe(1);
    expect(text).toContain(
      "L'utilisation de faux documents et/ou de faux témoignages, destinés à semer des doutes ou à accréditer une thèse, est l'une des méthodes de désinformation les plus répandues.",
    );
  }, 60_000);
});

describe('screenshots of a YouTube transcript', () => {
  it.each([
    ['with an overlap', 'yt-overlap', 3, 'cette veille extrêmement attentive que'],
    ['without an overlap', 'yt-flush', 2, 'pas démenti faire acte en quelque sorte'],
  ])('stitches them %s into a transcript, each passage once at its time', async (_, name, count, end) => {
    const text = await stitched(name, count);
    // The "Synchroniser avec la vidéo" pill is read on the last screenshot
    // only, so it is not known for chrome: it stays at the very end, after a
    // half-read line, where the reader sees it and deletes it.
    expect(text.replace(/\n.*Synchroniser avec la vidéo$/, '')).not.toMatch(CHROME);
    for (const time of ['0:03', '0:45', '0:54', '1:03', '1:12', '1:42']) expect(times(text, `\n${time} `)).toBe(1);
    expect(text).toContain(
      '0:54 des données fiables permettant justement la liberté d\'expression de toutes les opinions et de toutes les croyances donc ça c\'était le constat à partir de',
    );
    expect(text).toContain("1:03 Ce constat on a noté un certain nombre d'actions plus agressive d'acteurs non étatiques mais aussi étatique qui mérite");

    const transcript = readTranscript(text);
    expect(transcript).not.toBeNull();
    expect(transcript![0].at).toBe(0);
    for (const paragraph of transcript!) expect(paragraph.text).not.toMatch(/\d:\d\d/);
    expect(transcript!.at(-1)!.text).toContain(end);
  }, 60_000);
});
