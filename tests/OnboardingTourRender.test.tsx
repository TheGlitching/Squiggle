import { describe, it, expect, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { OnboardingTour } from '../src/ui/components/OnboardingTour';

// Lets React treat these `act` calls as a real test environment instead of
// warning on every commit.
declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The visit has to survive its own first mount.
 *
 * Its anchors belong to the panel around it, and React puts that markup in the
 * document only when it commits: a step list resolved while rendering sees an
 * empty document and keeps nothing but the anchorless opening step. These cases
 * mount the anchors and the visit in a single pass, exactly as the panel does.
 */

const FIRST_RUN_ANCHORS = ['settings', 'run-analysis'];
const REPORT_ANCHORS = [
  ...FIRST_RUN_ANCHORS,
  'score-gauges',
  'research-disclosure',
  'domain-scores',
  'category-filters',
  'finding-card',
];

function Host({ anchors }: { anchors: string[] }) {
  return (
    <div>
      {anchors.map((anchor) => (
        <div key={anchor} data-tour={anchor}>
          contenu
        </div>
      ))}
      <OnboardingTour isOpen theme="light" />
    </div>
  );
}

async function mountTour(anchors: string[]) {
  const root = createRoot(document.getElementById('root')!);
  await act(async () => {
    root.render(<Host anchors={anchors} />);
  });
  return root;
}

const card = () => document.querySelector('[data-testid="onboarding-tour-root"]');
/** The scrim ring that marks the anchored element. */
const highlights = () =>
  [...(card()?.querySelectorAll('div') ?? [])].filter((el) =>
    (el as HTMLElement).style.boxShadow?.includes('9999px')
  );
const stepCount = () => card()?.querySelectorAll('[aria-hidden="true"] > span').length ?? 0;
const advance = async () => {
  const next = [...(card()?.querySelectorAll('button') ?? [])].find((b) =>
    /Suivant|Commencer/.test(b.textContent ?? '')
  );
  await act(async () => {
    next?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

describe('the visit renders usable steps on a first run', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
  });

  it('walks several steps with no report on screen', async () => {
    await mountTour(FIRST_RUN_ANCHORS);

    expect(stepCount()).toBeGreaterThanOrEqual(3);

    const titles: string[] = [];
    for (let i = 0; i < stepCount(); i += 1) {
      titles.push(card()!.querySelector('h3')!.textContent ?? '');
      // Past the opening step, every step darkens the panel around something.
      expect(highlights()).toHaveLength(i === 0 ? 0 : 1);
      await advance();
    }

    expect(new Set(titles).size).toBe(titles.length);
    expect(titles.every((t) => t.length > 0)).toBe(true);
  });

  it('brings the result steps in once a report is rendered', async () => {
    await mountTour(REPORT_ANCHORS);
    const withReport = stepCount();

    document.body.innerHTML = '<div id="root"></div>';
    await mountTour(FIRST_RUN_ANCHORS);

    expect(withReport).toBeGreaterThan(stepCount());
  });
});
