/**
 * The signed-in card's quota meter: one track whatever the limit. A pip per
 * analysis overflowed the card at the monthly 60 and pushed the counter out of it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { HostedAccountCard } from '../src/ui/components/HostedAccountCard';
import type { HostedAccount } from '../src/hosted/session';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement;

function mount(plan: HostedAccount['plan'], remaining: number, limit: number) {
  const account: HostedAccount = {
    id: 'u1',
    email: null,
    plan,
    planExpiresAt: null,
    usage: { used: limit - remaining, limit, remaining, resetsAt: null },
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root!.render(
      <HostedAccountCard
        account={account}
        error={null}
        busy={false}
        showCode={false}
        onSignIn={() => {}}
        onRedeem={() => {}}
        onSignOut={() => {}}
      />
    )
  );
  return container.querySelector('[data-testid="quota-meter"]') as HTMLElement;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe('HostedAccountCard quota meter', () => {
  it('draws a monthly 60 as one track filled to what remains, with a counter that cannot wrap', () => {
    const meter = mount('active', 51, 60);
    const [track, counter] = [...meter.children] as HTMLElement[];
    expect(meter.children).toHaveLength(2);
    expect((track.firstElementChild as HTMLElement).style.width).toBe('85%');
    expect(counter.textContent).toBe('51 / 60');
    expect(counter.className).toContain('whitespace-nowrap');
    expect(counter.className).toContain('shrink-0');
  });

  it('keeps the same single track for the three-analysis trial', () => {
    const meter = mount('trial', 1, 3);
    expect(meter.children).toHaveLength(2);
    expect((meter.firstElementChild!.firstElementChild as HTMLElement).style.width).toMatch(/^33\.3+/);
  });

  it('empties the track when nothing remains, never below zero', () => {
    const meter = mount('active', -2, 60);
    expect((meter.firstElementChild!.firstElementChild as HTMLElement).style.width).toBe('0%');
  });
});
