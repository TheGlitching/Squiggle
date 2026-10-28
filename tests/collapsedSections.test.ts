import { afterEach, describe, expect, it, vi } from 'vitest';
import { RangeTracker } from '../src/content/rangeTracker';
import { ShadowHighlightOverlay } from '../src/content/shadowOverlay';
import type { AnchoredHighlight } from '../src/content/types';

// Mobile Wikipedia collapses every section after the first with
// `hidden="until-found"`. A range in one still reports rectangles, at a place the
// text is not, so its highlight landed on the page footer and selecting the
// finding scrolled the reader there.
describe('a passage in a collapsed section', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  function collapsedPassage() {
    document.body.innerHTML =
      '<p>Visible lead.</p><div id="section" hidden="until-found"><p id="quote">Une fondation non nommée.</p></div>';
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('quote')!);
    // happy-dom lays nothing out: give the range the rectangle a browser reports.
    const bogus = { top: 749, left: 16, width: 366, height: 19 } as DOMRect;
    vi.spyOn(range, 'getClientRects').mockReturnValue([bogus] as unknown as DOMRectList);
    return range;
  }

  it('is not drawn where the browser misplaces it', () => {
    expect(new RangeTracker().computeRangeRects(collapsedPassage())).toEqual([]);
  });

  it('opens its section the way find-in-page does when the reader selects it', () => {
    const range = collapsedPassage();
    const section = document.getElementById('section')!;
    const beforematch = vi.fn();
    section.addEventListener('beforematch', beforematch);

    const highlight: AnchoredHighlight = {
      id: 'hl-f1',
      findingId: 'f1',
      target: {
        findingId: 'f1',
        quote: 'Une fondation non nommée.',
        severity: 'warning',
        category: 'unverified_source',
        title: 'Autorité anonyme',
        explanation: 'E.',
      },
      tier: 'exact-quote',
      confidence: 0.95,
      range,
      matchedText: 'Une fondation non nommée.',
      blockIndex: 1,
      rects: [],
      boundingBox: { top: 0, left: 0, width: 0, height: 0 },
    };
    const overlay = new ShadowHighlightOverlay();
    overlay.setHighlights([highlight]);
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    expect(overlay.scrollToHighlight('f1')).toBe(true);
    expect(beforematch).toHaveBeenCalledTimes(1);
    expect(section.hasAttribute('hidden')).toBe(false);
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: expect.any(Number) }));
    overlay.destroy();
  });
});
