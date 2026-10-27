/**
 * "Signaler une erreur" in the panel: offered only when a handler is given
 * (hosted mode), a closed list of reasons, and two counters sent without any
 * credential, holding the category and the reason and nothing of the text.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Finding } from '@squiggle/shared';

import { FindingCard } from '../src/ui/components/FindingCard';
import { reportFinding } from '../src/hosted/flag';
import { COUNT_URL } from '../src/hosted/config';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const FINDING: Finding = {
  id: 'f1',
  blockId: 'b1',
  quote: 'la fréquentation aurait chuté de 30 %',
  category: 'affirmation-non-etayee',
  severity: 3,
  label: 'Chiffre sans source',
  explanation: 'Ni institut, ni date, ni méthode.',
  confidence: 0.9,
} as Finding;

let root: Root | null = null;
let container: HTMLDivElement;

function mount(props: Partial<React.ComponentProps<typeof FindingCard>>) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(<FindingCard finding={FINDING} {...props} />));
}

const button = (name: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent === name) as HTMLButtonElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe('FindingCard report', () => {
  it('is not offered without a handler: BYOK mode sends nothing to our server', () => {
    mount({});
    expect(button('Signaler une erreur')).toBeUndefined();
  });

  it('opens the closed list of reasons, sends the one picked, and never selects the finding', () => {
    const onReport = vi.fn();
    const onSelect = vi.fn();
    mount({ onReport, onSelect });
    act(() => button('Signaler une erreur')!.click());
    expect([...container.querySelectorAll('[role="group"] button')].map((b) => b.textContent)).toEqual([
      'Le passage ne dit pas cela',
      'L’article donne sa source',
      'Ce n’est pas ce procédé',
      'Trop sévère',
      'Autre raison',
      'Annuler',
    ]);
    act(() => button('Trop sévère')!.click());
    expect(onReport).toHaveBeenCalledWith('too_harsh');
    expect(onSelect).not.toHaveBeenCalled();
    expect(container.querySelector('[role="status"]')?.textContent).toMatch(/^Merci, c’est noté/);
    expect(button('Signaler une erreur')).toBeUndefined();
  });

  it('sends nothing when cancelled', () => {
    const onReport = vi.fn();
    mount({ onReport });
    act(() => button('Signaler une erreur')!.click());
    act(() => button('Annuler')!.click());
    expect(onReport).not.toHaveBeenCalled();
    expect(button('Signaler une erreur')).toBeDefined();
  });
});

describe('reportFinding', () => {
  it('sends the category and the reason as two names, without credentials, and swallows a failure', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('offline');
    });
    reportFinding('point-fort', 'other', fetchImpl as unknown as typeof fetch);
    expect(fetchImpl.mock.calls.map((call) => (call as unknown[])[0])).toEqual([COUNT_URL, COUNT_URL]);
    expect(fetchImpl.mock.calls.map((call) => JSON.parse(((call as unknown[])[1] as RequestInit).body as string))).toEqual([
      { name: 'flag_finding_point_fort' },
      { name: 'flag_reason_other' },
    ]);
    for (const call of fetchImpl.mock.calls) {
      expect(((call as unknown[])[1] as RequestInit).credentials).toBe('omit');
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
