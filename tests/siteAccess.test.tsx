/**
 * The optional "all sites" permission and the injected content script that
 * replaces the static one. Both are what lets the manifest ask for so little.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';

import { SiteAccessCard } from '../src/ui/components/SiteAccessCard';
import { ALL_SITES } from '../src/permissions/siteAccess';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type G = { chrome?: unknown };

const flush = async (): Promise<void> => {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
};

describe('SiteAccessCard', () => {
  let host: HTMLDivElement;
  let root: Root;
  let granted: boolean;
  let answer: boolean;
  const permissions = {
    contains: vi.fn(async () => granted),
    request: vi.fn(async () => {
      granted = answer;
      return answer;
    }),
    remove: vi.fn(async () => {
      granted = false;
      return true;
    }),
  };

  beforeEach(() => {
    granted = false;
    answer = true;
    vi.clearAllMocks();
    (globalThis as G).chrome = { permissions };
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    delete (globalThis as G).chrome;
  });

  const button = (label: string) =>
    [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(label));

  it('offers the grant when access is not held, and asks for exactly the manifest patterns', async () => {
    act(() => root.render(<SiteAccessCard />));
    await flush();

    expect(button('Autoriser tous les sites')).toBeDefined();
    await act(async () => button('Autoriser tous les sites')!.click());
    await flush();

    expect(permissions.request).toHaveBeenCalledWith({ origins: ALL_SITES });
    expect(host.textContent).toContain('Tous les sites autorisés');
  });

  it('says so and keeps working when the reader refuses', async () => {
    answer = false;
    act(() => root.render(<SiteAccessCard />));
    await flush();
    await act(async () => button('Autoriser tous les sites')!.click());
    await flush();

    expect(host.textContent).toContain('Autorisation refusée');
    expect(button('Autoriser tous les sites')).toBeDefined();
  });

  it('shows the current grant and lets the reader take it back', async () => {
    granted = true;
    act(() => root.render(<SiteAccessCard />));
    await flush();

    expect(host.textContent).toContain('Tous les sites autorisés');
    await act(async () => button('Retirer l’autorisation')!.click());
    await flush();

    expect(permissions.remove).toHaveBeenCalledWith({ origins: ALL_SITES });
    expect(button('Autoriser tous les sites')).toBeDefined();
  });
});

describe('content script injection', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__squiggleContentScript;
    delete (globalThis as G).chrome;
    vi.resetModules();
  });

  /**
   * The background re-injects after a read that timed out. Two controllers in one
   * tab would answer every message twice and mount two overlays.
   */
  it('registers its message listener once however often it is injected', async () => {
    const addListener = vi.fn();
    (globalThis as G).chrome = { runtime: { onMessage: { addListener } } };

    await import('../src/content/index');
    vi.resetModules();
    await import('../src/content/index');

    expect(addListener).toHaveBeenCalledTimes(1);
  });
});
