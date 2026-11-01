// @vitest-environment node
/**
 * The short video of each notion (`src/reel.tsx`): its words are the glossary's,
 * it fits the screen of a phone, it lasts what a short video lasts, and the build
 * only publishes one that still shows what the glossary says (`reelSource`).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { NOTIONS, type Segments } from '../src/glossaire';
import { REEL_FPS, REEL_HEIGHT, REEL_WIDTH, reel, reelSource, reelText, timeline } from '../src/reel';

const plain = (segments: Segments) => segments.map((part) => (typeof part === 'string' ? part : part[0])).join('');
const folded = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ');

describe('the short video of a notion', () => {
  it('shows the example, then names the trap and says what it is, word for word', () => {
    for (const notion of NOTIONS) {
      const text = folded(reelText(notion));
      expect(text, notion.slug).toContain(folded(plain(notion.exemple.texte)));
      expect(text, notion.slug).toContain(folded(notion.resume));
      expect(text.indexOf(folded(plain(notion.exemple.texte))), notion.slug).toBeLessThan(text.indexOf(`Le piège : ${folded(notion.nom)}`));
    }
  });

  it('lasts 8 to 15 seconds, the example long enough to be read', () => {
    for (const notion of NOTIONS) {
      const { read, end } = timeline(notion);
      expect(read, notion.slug).toBeGreaterThanOrEqual(5);
      expect(end, notion.slug).toBeGreaterThanOrEqual(8);
      expect(end, notion.slug).toBeLessThanOrEqual(15);
    }
  });

  // Laying the last frame out fails when a word leaves the screen or runs into another
  // at every size a phone can read, so preparing every video is the overflow check.
  it('fits every notion on a 9:16 screen', async () => {
    for (const notion of NOTIONS) {
      const video = await reel(notion);
      expect(video.count, notion.slug).toBe(Math.round(timeline(notion).end * REEL_FPS));
    }
  }, 120_000);

  it('opens on the dark ground and ends on everything shown, each frame at full size', async () => {
    const frames: Buffer[] = [];
    for await (const frame of (await reel(NOTIONS[0])).frames()) frames.push(frame);
    expect(frames.every((frame) => frame.length === REEL_WIDTH * REEL_HEIGHT * 4)).toBe(true);
    // The first frame is the site's background, nothing come in yet: #0a0a0b.
    expect([...frames[0].subarray(0, 4)]).toEqual([10, 10, 11, 255]);
    expect(frames[0].equals(frames.at(-1)!)).toBe(false);
    // Holding still costs nothing: the reading time repeats one frame.
    expect(new Set(frames).size).toBeLessThan(frames.length / 2);
  }, 120_000);

  it('changes its fingerprint when the words it shows change, and only then', () => {
    const notion = NOTIONS[0];
    expect(reelSource({ ...notion })).toBe(reelSource(notion));
    expect(reelSource({ ...notion, resume: `${notion.resume} ` })).not.toBe(reelSource(notion));
    expect(reelSource({ ...notion, question: 'Autre chose ?' })).toBe(reelSource(notion));
  });

  it('has its video, its poster and its record for every rendered notion, and no other', () => {
    const dir = new URL('../reels/', import.meta.url);
    const files = readdirSync(dir);
    for (const record of files.filter((file) => file.endsWith('.json'))) {
      const slug = record.slice(0, -'.json'.length);
      expect(NOTIONS.some((notion) => notion.slug === slug), record).toBe(true);
      expect(existsSync(new URL(`${slug}.mp4`, dir)), slug).toBe(true);
      expect(existsSync(new URL(`${slug}.jpg`, dir)), slug).toBe(true);
      expect(Object.keys(JSON.parse(readFileSync(new URL(record, dir), 'utf8')))).toEqual(['source', 'seconds']);
    }
    expect(files.every((file) => /\.(mp4|jpg|json)$/.test(file))).toBe(true);
  });
});
