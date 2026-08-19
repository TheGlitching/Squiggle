import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_EDITORIAL_TOUR_STEPS, DEFAULT_STORAGE_KEY, DEFAULT_STORAGE_VERSION, getTourCompletionStatus, setTourCompletionStatus, resetTourCompletionStatus } from '../src/ui/components/OnboardingTour';

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
