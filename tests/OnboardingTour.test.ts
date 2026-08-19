import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_EDITORIAL_TOUR_STEPS,
  DEFAULT_STORAGE_KEY,
  DEFAULT_STORAGE_VERSION,
  getTourCompletionStatus,
  setTourCompletionStatus,
  resetTourCompletionStatus,
  computeTourPosition,
  selectAvailableSteps,
} from '../src/ui/components/OnboardingTour';
import { SCORE_DOMAINS } from '../src/engine/types';
import { determineScoreBand } from '../src/engine/scoring';

/** Everything the panel renders before an analysis has ever been run. */
const FIRST_RUN_ANCHORS = ['[data-tour="settings"]', '[data-tour="run-analysis"]'];

const stepText = (step: { title: string; content: string; methodologyTip?: string }) =>
  `${step.title} ${step.content} ${step.methodologyTip ?? ''}`;

const TOUR_PROSE = DEFAULT_EDITORIAL_TOUR_STEPS.map(stepText).join(' ');

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

  it('gives every step a title, a body and a methodology note', () => {
    expect(DEFAULT_EDITORIAL_TOUR_STEPS.length).toBeGreaterThanOrEqual(6);
    for (const step of DEFAULT_EDITORIAL_TOUR_STEPS) {
      expect(step.title).toBeTruthy();
      expect(step.content).toBeTruthy();
      expect(step.methodologyTip).toBeTruthy();
    }
  });
});

/**
 * The visit used to be useless at the only moment it was needed: with no key and
 * no analysis, every step past the first pointed at an element that appears only
 * once a report is on screen, so the panel went dark and nothing was highlighted.
 */
describe('the visit stands on its own before any analysis', () => {
  const availableOnFirstRun = () =>
    selectAvailableSteps(DEFAULT_EDITORIAL_TOUR_STEPS, (selector) =>
      FIRST_RUN_ANCHORS.includes(selector)
    );

  it('keeps enough steps to explain the product with an empty panel', () => {
    const steps = availableOnFirstRun();

    expect(steps.length).toBeGreaterThanOrEqual(3);
    // What it does, and why it needs a key, are exactly the first-run questions.
    expect(steps[0].targetSelector).toBeUndefined();
    expect(steps.map((s) => s.id)).toContain('your-own-key');
    expect(steps.map((s) => s.id)).toContain('run-analysis');
  });

  it('drops the steps whose anchor is not on screen rather than highlighting nothing', () => {
    const first = availableOnFirstRun();

    expect(first.map((s) => s.id)).not.toContain('finding-cards');
    for (const step of first) {
      if (step.targetSelector) expect(FIRST_RUN_ANCHORS).toContain(step.targetSelector);
    }
  });

  it('restores the result steps once a report is rendered', () => {
    const withReport = selectAvailableSteps(DEFAULT_EDITORIAL_TOUR_STEPS, () => true);

    expect(withReport).toHaveLength(DEFAULT_EDITORIAL_TOUR_STEPS.length);
    expect(withReport.map((s) => s.id)).toContain('finding-cards');
  });
});

/**
 * The copy shipped for a long time describing features that had been deleted or
 * never existed, and quoting a passing score the engine disagreed with. What the
 * reader is told has to be checkable against the code that does the work.
 */
describe('the visit only describes what the product does', () => {
  it('promises no export and no replacement wording', () => {
    expect(DEFAULT_EDITORIAL_TOUR_STEPS.map((s) => s.id)).not.toContain('export-canvas');
    for (const pattern of [/export/i, /retina/i, /formulation de remplacement/i, /partag/i]) {
      expect(TOUR_PROSE).not.toMatch(pattern);
    }
  });

  it('never addresses the article’s author', () => {
    for (const pattern of [/corrig/i, /révision/i, /rédacteur en chef/i, /avant publication/i, /relecture/i]) {
      expect(TOUR_PROSE).not.toMatch(pattern);
    }
  });

  it('names the domains the engine actually scores, with their weights', () => {
    const step = DEFAULT_EDITORIAL_TOUR_STEPS.find((s) => s.id === 'weighted-domains');
    expect(step).toBeDefined();

    for (const domain of Object.values(SCORE_DOMAINS)) {
      expect(step!.content).toContain(domain.label);
      expect(step!.content).toContain(String(domain.weight));
    }
  });

  it('quotes no score threshold the engine does not use as a band boundary', () => {
    const step = DEFAULT_EDITORIAL_TOUR_STEPS.find((s) => s.id === 'global-score');
    expect(step).toBeDefined();

    const quoted = [...step!.content.matchAll(/(\d+)\/100/g)].map((m) => Number(m[1]));
    expect(quoted.length).toBeGreaterThan(0);
    for (const score of quoted) {
      // A boundary is a score whose band differs from the one just below it.
      expect(determineScoreBand(score)).not.toBe(determineScoreBand(score - 1));
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
