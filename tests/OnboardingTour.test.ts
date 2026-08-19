import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_EDITORIAL_TOUR_STEPS, DEFAULT_STORAGE_KEY, DEFAULT_STORAGE_VERSION, getTourCompletionStatus, setTourCompletionStatus, resetTourCompletionStatus, computeTourPosition } from '../src/ui/components/OnboardingTour';

describe('OnboardingTour & Walkthrough Logic', () => {
  let mockStorage: Record<string, string> = {};
  const fakeLocalStorage = {
    getItem: (key: string) => mockStorage[key] || null,
    setItem: (key: string, value: string) => { mockStorage[key] = value; },
    removeItem: (key: string) => { delete mockStorage[key]; },
    clear: () => { mockStorage = {}; },
    length: 0,
    key: () => null,
  } as unknown as Storage;

  beforeEach(() => { mockStorage = {}; });

  it('returns completed: false by default', () => {
    expect(getTourCompletionStatus(DEFAULT_STORAGE_KEY, fakeLocalStorage).completed).toBe(false);
  });

  it('persists and resets tour completion', () => {
    setTourCompletionStatus(true, DEFAULT_STORAGE_KEY, DEFAULT_STORAGE_VERSION, fakeLocalStorage);
    expect(getTourCompletionStatus(DEFAULT_STORAGE_KEY, fakeLocalStorage).completed).toBe(true);
    resetTourCompletionStatus(DEFAULT_STORAGE_KEY, fakeLocalStorage);
    expect(getTourCompletionStatus(DEFAULT_STORAGE_KEY, fakeLocalStorage).completed).toBe(false);
  });

  it('contains essential editorial tour steps with methodology tips', () => {
    expect(DEFAULT_EDITORIAL_TOUR_STEPS.length).toBeGreaterThanOrEqual(6);
    for (const step of DEFAULT_EDITORIAL_TOUR_STEPS) {
      expect(step.title).toBeTruthy();
      expect(step.methodologyTip).toBeTruthy();
    }
  });
});

/**
 * The visit became unusable partway through: the card ran off the bottom of the
 * panel and took its controls with it, so there was no way to advance or leave.
 * Two causes, both reproduced here - the declared side was ignored, and the
 * clamp that was supposed to keep the card on screen assumed a fixed height
 * instead of measuring the one the panel's narrow column actually produces.
 */
describe('tour card placement keeps the controls on screen', () => {
  /** Chrome's side panel: a narrow column, so prose wraps tall. */
  const PANEL_HEIGHT = 600;

  const targetAt = (top: number, height: number) =>
    ({
      getBoundingClientRect: () => ({ top, bottom: top + height, left: 0, width: 380, height }),
    }) as unknown as HTMLElement;

  it('places a card above its target when the step asks for it', () => {
    const target = targetAt(400, 40);

    const { top } = computeTourPosition(target, 'top', 8, {
      viewportHeight: PANEL_HEIGHT,
      cardHeight: 200,
    });

    // Above means the card ends before the target starts, not below it.
    expect(top + 200).toBeLessThanOrEqual(400);
  });

  it('keeps a tall card fully on screen next to a target near the bottom', () => {
    const target = targetAt(500, 60);
    const cardHeight = 300;

    const { top } = computeTourPosition(target, 'bottom', 8, {
      viewportHeight: PANEL_HEIGHT,
      cardHeight,
    });

    expect(top).toBeGreaterThanOrEqual(0);
    expect(top + cardHeight).toBeLessThanOrEqual(PANEL_HEIGHT);
  });

  it('keeps the card on screen even when it is taller than the panel', () => {
    const { top } = computeTourPosition(targetAt(500, 60), 'bottom', 8, {
      viewportHeight: PANEL_HEIGHT,
      cardHeight: 900,
    });

    // It cannot fit, so it starts at the top edge and scrolls its own prose.
    expect(top).toBeGreaterThan(0);
    expect(top).toBeLessThan(40);
  });
});
