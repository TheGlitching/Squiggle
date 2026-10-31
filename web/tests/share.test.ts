// @vitest-environment node
/**
 * The share images the build writes (`src/share.tsx`): the size every preview
 * expects, and small enough that no network gives up on fetching one.
 */
import { describe, expect, it } from 'vitest';

import { NOTIONS } from '../src/glossaire';
import { PUBLIC_PAGES } from '../src/seo';
import { SHARE_HEIGHT, SHARE_WIDTH, SLIDE_HEIGHT, SLIDE_WIDTH, SOCIAL_SOURCES, STORY_HEIGHT, shareImage, socialSlides, socialStory } from '../src/share';

const size = (png: Buffer) => [png.readUInt32BE(16), png.readUInt32BE(20)];

describe('share images', () => {
  it.each(['/enseignants', '/glossaire/correlation-causalite'])('draws %s as a 1200 x 630 PNG under 300 KB', async (path) => {
    const png = await shareImage(PUBLIC_PAGES.find((page) => page.path === path)!);
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(size(png)).toEqual([SHARE_WIDTH, SHARE_HEIGHT]);
    expect(png.length).toBeLessThan(300_000);
  });
});

describe('social carousels', () => {
  it('draws one carousel per notion and per published article, each under its own address', () => {
    expect(SOCIAL_SOURCES.length).toBeGreaterThan(NOTIONS.length);
    expect(new Set(SOCIAL_SOURCES.map((source) => source.slug)).size).toBe(SOCIAL_SOURCES.length);
  });

  // Laying a slide out fails when a word leaves its area or runs into another
  // at every size a phone can read, so drawing them all is the overflow check.
  it('draws every slide at 1080 x 1350, under 1 MB, with its alternative text', async () => {
    for (const source of SOCIAL_SOURCES) {
      const slides = await socialSlides(source);
      // A notion has five slides; an article, its example and one per list of steps.
      if ('nom' in source) expect(slides.length, source.slug).toBe(5);
      else expect(slides.length, source.slug).toBeGreaterThanOrEqual(3);
      for (const slide of slides) {
        expect(size(slide.png), source.slug).toEqual([SLIDE_WIDTH, SLIDE_HEIGHT]);
        expect(slide.png.length, source.slug).toBeLessThan(1_000_000);
        expect(slide.alt.length, source.slug).toBeGreaterThan(20);
      }
    }
  }, 180_000);

  it('takes its text word for word from the glossary', async () => {
    const item = NOTIONS[0];
    const slides = await socialSlides(item);
    expect(slides[2].alt).toContain(item.exemple.lecture);
    for (const sign of item.reperer) expect(slides[3].alt).toContain(sign);
    expect(slides[4].alt).toContain(item.question);
  });

  it('draws the same images on every build', async () => {
    const [first, second] = [await socialSlides(NOTIONS[3]), await socialSlides(NOTIONS[3])];
    second.forEach((slide, index) => expect(slide.png.equals(first[index].png)).toBe(true));
  });

  it('refuses a text that would not fit rather than cut it or shrink it out of reach', async () => {
    const long = { ...NOTIONS[0], question: NOTIONS[0].question.repeat(6) };
    await expect(socialSlides(long)).rejects.toThrow(/does not fit at any size a phone can read/);
    const word = { ...NOTIONS[0], exemple: { ...NOTIONS[0].exemple, texte: ['Anticonstitutionnellementanticonstitutionnellement'] } };
    await expect(socialSlides(word)).rejects.toThrow(/leaves its area/);
  });
});

describe('stories', () => {
  // Like the slides, drawing them all is the overflow check.
  it('draws one story per carousel at 1080 x 1920, under 1 MB, with its alternative text', async () => {
    for (const source of SOCIAL_SOURCES) {
      const story = await socialStory(source);
      expect(size(story.png), source.slug).toEqual([SLIDE_WIDTH, STORY_HEIGHT]);
      expect(story.png.length, source.slug).toBeLessThan(1_000_000);
      expect(story.alt, source.slug).toContain('lien dans la bio');
    }
  }, 180_000);

  it('hooks with the example’s own title, word for word', async () => {
    const item = NOTIONS[0];
    const title = item.exemple.titre.map((part) => (typeof part === 'string' ? part : part[0])).join('');
    expect((await socialStory(item)).alt).toContain(title);
  });

  it('refuses a hook that would not fit rather than cut it', async () => {
    const word = { ...NOTIONS[0], exemple: { ...NOTIONS[0].exemple, titre: ['Anticonstitutionnellementanticonstitutionnellement'] } };
    await expect(socialStory(word)).rejects.toThrow(/leaves its area/);
  });
});
