/**
 * The loading scene follows the engine's own stages: each event lands on one
 * of the three steps, the step under way carries the engine's live message,
 * and the scene drawn is that step's.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PipelineStage } from '@squiggle/shared';

import { RunProgress, runBarFill, runStepOf } from '../src/ui/components/RunScene';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function mount(stage: PipelineStage | undefined, message: string) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
  act(() => root!.render(<RunProgress stage={stage} message={message} />));
  container = el;
  return el;
}

afterEach(() => {
  vi.useRealTimers();
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

describe('RunProgress', () => {
  it('maps every engine stage to the step that does that work', () => {
    const steps: Array<[PipelineStage | undefined, string]> = [
      [undefined, 'lecture'],
      ['extracting', 'lecture'],
      ['preparing_prompt', 'lecture'],
      ['calling_provider', 'lecture'],
      ['parsing_response', 'recherche'],
      ['researching', 'recherche'],
      ['scoring', 'verification'],
      ['success', 'verification'],
    ];
    for (const [stage, step] of steps) expect(runStepOf(stage)).toBe(step);
  });

  it('marks the steps already run and gives the current one the live message', () => {
    const container = mount('researching', 'Vérification des constats factuels (2/3)...');
    const items = [...container.querySelectorAll('li')];
    expect(items.map((li) => li.getAttribute('aria-current'))).toEqual([null, 'step', null]);
    expect(items[0].textContent).toContain('fait');
    expect(items[1].textContent).toContain('Vérification des constats factuels (2/3)...');
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Vérification des constats factuels (2/3)...');
    // The research scene: the question travels to the two pages.
    expect(container.querySelectorAll('.run-flow')).toHaveLength(2);
  });

  it('fills the bar fast, then slowly, nearly full at 40 s, then full', () => {
    expect(runBarFill(0)).toBe(0);
    expect(runBarFill(10_000)).toBeGreaterThan(0.5);
    expect(runBarFill(39_999)).toBeGreaterThan(0.94);
    expect(runBarFill(39_999)).toBeLessThan(1);
    expect(runBarFill(40_000)).toBe(1);
    expect(runBarFill(90_000)).toBe(1);
  });

  it('runs the bar on time, names the stage instead of a percentage, and glows once full', () => {
    vi.useFakeTimers();
    const container = mount('calling_provider', 'Audit critique en cours...');
    const bar = container.querySelector('[role="progressbar"]')!;
    const fill = bar.firstElementChild as HTMLElement;
    expect(bar.getAttribute('aria-valuetext')).toBe('Étape 1 sur 3 : Lecture');
    expect(bar.hasAttribute('aria-valuenow')).toBe(false);
    act(() => vi.advanceTimersByTime(10_000));
    const early = parseFloat(fill.style.width);
    expect(early).toBeGreaterThan(50);
    expect(fill.classList.contains('run-bar-full')).toBe(false);
    // A finished stage moves it on a notch.
    act(() => root!.render(<RunProgress stage="researching" message="Recherche..." />));
    expect(parseFloat(fill.style.width)).toBeGreaterThan(early);
    expect(bar.getAttribute('aria-valuetext')).toBe('Étape 2 sur 3 : Recherche des sources');
    act(() => vi.advanceTimersByTime(40_000));
    expect(fill.style.width).toBe('100%');
    expect(fill.classList.contains('run-bar-full')).toBe(true);
  });
});
