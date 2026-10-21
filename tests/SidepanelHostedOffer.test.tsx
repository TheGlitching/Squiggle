/**
 * The first screen a reader meets. A reader with no key used to land on
 * "Configurez votre clé pour commencer" with two filled primaries and a tour
 * that reopened on every open; this pins the replacement: the hosted offer with
 * one primary, the own-key path as a text link, and a tour shown once.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';

import { TypedMessageBus } from '../src/messaging/messageBus';
import { SecureKeyStorage } from '../src/crypto/storage';
import { DEFAULT_STORAGE_KEY } from '../src/ui/components/OnboardingTour';
import { SidepanelApp } from '../src/sidepanel/main';
import type { FcRpcMap } from '../src/messaging/protocol';
import { HostedAuthError, type HostedAccount } from '../src/hosted/session';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const hostedMock = vi.hoisted(() => ({
  fetchHostedAccount: vi.fn(),
  beginHostedSignIn: vi.fn(),
}));

// The network and the sign-in tab are out of reach here; everything else in the
// session module (the account wording) stays real.
vi.mock('../src/hosted/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/hosted/session')>();
  return {
    ...actual,
    fetchHostedAccount: hostedMock.fetchHostedAccount,
    beginHostedSignIn: hostedMock.beginHostedSignIn,
  };
});

const flush = async (ticks = 5): Promise<void> => {
  for (let i = 0; i < ticks; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
};

const account = (plan: HostedAccount['plan'], used: number, limit: number): HostedAccount => ({
  id: 'u1',
  email: 'lecteur@example.test',
  plan,
  planExpiresAt: null,
  usage: { used, limit, remaining: limit - used, resetsAt: null },
});

/** An in-memory `Storage`: the test environment's own `localStorage` is not usable. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

const NOT_SIGNED_IN = new HostedAuthError('not_signed_in', 'Connectez-vous.');
const TOUR_OPENING_TITLE = 'Ce que Squiggle regarde pour vous';

describe('sidepanel first screen', () => {
  let container: HTMLDivElement;
  let root: Root;
  let bgBus: TypedMessageBus;
  let storageData: Record<string, unknown>;
  let changedListeners: Array<(changes: Record<string, unknown>, area: string) => void>;

  const mount = async () => {
    await act(async () => {
      root.render(<SidepanelApp />);
    });
    await flush();
  };

  const buttons = () => Array.from(container.querySelectorAll('button'));
  const button = (label: string) => buttons().find((b) => b.textContent?.includes(label));
  /** The filled accent buttons: what the reader reads as "the" call to action. */
  const primaries = () => buttons().filter((b) => b.classList.contains('bg-accent'));

  beforeEach(() => {
    storageData = {};
    changedListeners = [];
    hostedMock.fetchHostedAccount.mockReset().mockRejectedValue(NOT_SIGNED_IN);
    hostedMock.beginHostedSignIn.mockReset().mockResolvedValue('https://app.example/bridge');
    vi.stubGlobal('localStorage', memoryStorage());
    // Tour already seen unless a case says otherwise, so its overlay stays out of the way.
    localStorage.setItem(DEFAULT_STORAGE_KEY, JSON.stringify({ completed: true, version: '1.0.0' }));

    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: {
        sendMessage: vi.fn(),
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
        getURL: vi.fn((path: string) => `chrome-extension://mock-id/${path}`),
        lastError: null,
      },
      tabs: {
        query: vi.fn((_q: unknown, cb: (tabs: unknown[]) => void) =>
          cb([{ id: 101, url: 'https://news.example/a', active: true, windowId: 1 }])
        ),
        onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
        onActivated: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      storage: {
        local: {
          get: vi.fn((keys?: string[]) => {
            const result: Record<string, unknown> = {};
            for (const k of keys ?? Object.keys(storageData)) if (k in storageData) result[k] = storageData[k];
            return Promise.resolve(result);
          }),
          set: vi.fn((items: Record<string, unknown>) => {
            Object.assign(storageData, items);
            return Promise.resolve();
          }),
          remove: vi.fn(() => Promise.resolve()),
        },
        onChanged: {
          addListener: vi.fn((cb) => changedListeners.push(cb)),
          removeListener: vi.fn((cb) => {
            changedListeners.splice(changedListeners.indexOf(cb), 1);
          }),
        },
      },
    };

    bgBus = new TypedMessageBus('background');
    bgBus.registerRPC<'GET_TAB_STATE', FcRpcMap>('GET_TAB_STATE', () => ({ state: null }));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    bgBus.destroy();
    vi.unstubAllGlobals();
    delete (globalThis as unknown as { chrome?: unknown }).chrome;
  });

  describe('signed out', () => {
    it('offers the free analyses with one primary and the own key as a text link', async () => {
      await new SecureKeyStorage().setMode('hosted');
      await mount();

      expect(container.textContent).toContain('3 analyses offertes');
      expect(container.textContent).not.toContain('Configurez votre clé');
      expect(primaries().map((b) => b.textContent)).toEqual(['Se connecter']);
      expect(button('Utiliser plutôt ma propre clé API')).toBeDefined();
      expect(button('Lancer l’analyse critique')!.disabled).toBe(true);
    });

    it('gives a reader with no key and no stored choice the same offer, and signing in picks hosted', async () => {
      await mount();

      expect(container.textContent).toContain('3 analyses offertes');
      expect(container.textContent).not.toContain('Configurez votre clé');
      expect(primaries().map((b) => b.textContent)).toEqual(['Se connecter']);

      await act(async () => {
        button('Se connecter')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await flush();

      expect(hostedMock.beginHostedSignIn).toHaveBeenCalledTimes(1);
      expect(await new SecureKeyStorage().getMode()).toBe('hosted');
    });

    it('opens the settings on the own-key section from the text link', async () => {
      await mount();

      await act(async () => {
        button('Utiliser plutôt ma propre clé API')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await flush();

      const dialog = container.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();
      expect(dialog!.querySelector('details')!.open).toBe(true);
    });
  });

  describe('signed in', () => {
    beforeEach(async () => {
      await new SecureKeyStorage().setMode('hosted');
    });

    it('trial: states the remaining analyses and makes the run button the one primary', async () => {
      hostedMock.fetchHostedAccount.mockResolvedValue(account('trial', 1, 3));
      await mount();

      expect(container.textContent).toContain('Analyse d’essai');
      expect(container.textContent).toContain('Il vous reste 2 analyses offertes.');
      expect(container.textContent).not.toContain('3 analyses offertes');
      expect(button('Se connecter')).toBeUndefined();
      expect(primaries().map((b) => b.textContent)).toEqual(['Lancer l’analyse critique']);
      expect(button('Lancer l’analyse critique')!.disabled).toBe(false);
    });

    it('active: states the subscription and lets the reader run', async () => {
      hostedMock.fetchHostedAccount.mockResolvedValue(account('active', 2, 10));
      await mount();

      expect(container.textContent).toContain('Abonnement actif');
      expect(container.textContent).toContain('Il vous reste 8 analyses aujourd’hui.');
      expect(primaries().map((b) => b.textContent)).toEqual(['Lancer l’analyse critique']);
      expect(button('Lancer l’analyse critique')!.disabled).toBe(false);
    });
  });

  describe('BYOK with a key', () => {
    beforeEach(async () => {
      const keys = new SecureKeyStorage();
      await keys.saveProviderConfig({ provider: 'openai', apiKey: 'test-key', model: 'gpt-4o' });
      await keys.setActiveProvider('openai');
    });

    it('shows no hosted offer, runs from the one primary, and keeps jargon out of the footer', async () => {
      await mount();

      expect(container.textContent).not.toContain('3 analyses offertes');
      expect(container.textContent).not.toContain('Configurez votre clé');
      expect(primaries().map((b) => b.textContent)).toEqual(['Lancer l’analyse critique']);
      expect(button('Lancer l’analyse critique')!.disabled).toBe(false);
      expect(container.querySelector('footer')!.textContent).toBe('Analyse assistée par IA');
      expect(container.textContent).not.toContain('MV3');
    });
  });

  describe('visit', () => {
    it('opens on a first run', async () => {
      localStorage.clear();
      await mount();

      expect(container.textContent).toContain(TOUR_OPENING_TITLE);
    });

    it('does not reopen once completed, for a reader who still has no key', async () => {
      await mount();
      expect(container.textContent).not.toContain(TOUR_OPENING_TITLE);

      // Every refresh that used to re-arm the visit: focus, a storage change.
      await act(async () => {
        window.dispatchEvent(new Event('focus'));
        for (const cb of [...changedListeners]) cb({ squiggle_byok_config: {} }, 'local');
      });
      await flush();

      expect(container.textContent).not.toContain(TOUR_OPENING_TITLE);
    });

    it('is still reachable from the help button', async () => {
      await mount();

      await act(async () => {
        container
          .querySelector('[aria-label="Revoir la visite guidée"]')!
          .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await flush();

      expect(container.textContent).toContain(TOUR_OPENING_TITLE);
    });
  });

  describe('refresh', () => {
    it('notices a sign-in completed elsewhere as soon as the stored config changes', async () => {
      await new SecureKeyStorage().setMode('hosted');
      await mount();
      expect(container.textContent).toContain('3 analyses offertes');

      hostedMock.fetchHostedAccount.mockResolvedValue(account('trial', 1, 3));
      await act(async () => {
        for (const cb of [...changedListeners]) cb({ squiggle_byok_config: {} }, 'local');
      });
      await flush();

      expect(container.textContent).toContain('Analyse d’essai');
      expect(button('Se connecter')).toBeUndefined();
    });

    it('ignores changes to other keys and other areas, and unsubscribes on unmount', async () => {
      await new SecureKeyStorage().setMode('hosted');
      await mount();
      const calls = hostedMock.fetchHostedAccount.mock.calls.length;

      await act(async () => {
        for (const cb of [...changedListeners]) {
          cb({ something_else: {} }, 'local');
          cb({ squiggle_byok_config: {} }, 'sync');
        }
      });
      await flush();
      expect(hostedMock.fetchHostedAccount.mock.calls.length).toBe(calls);

      act(() => root.unmount());
      expect(changedListeners).toHaveLength(0);
      root = createRoot(container);
    });
  });
});
