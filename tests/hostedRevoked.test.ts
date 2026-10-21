import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BackgroundServiceWorker } from '../src/background';
import { SecureKeyStorage } from '../src/crypto/storage';

/**
 * An install revoked from the account page (or whose account was deleted) gets
 * `invalid_token` on its next signed call. During an analysis that used to
 * surface the server's English refusal and leave the dead session in place, so
 * every later analysis failed the same way. It now ends in the same
 * "connexion expirée" state the panel already shows on an account read.
 */
describe('hosted analysis with a revoked install', () => {
  const TAB = 7;
  let map: Record<string, string>;
  let area: Record<string, unknown>;

  beforeEach(() => {
    map = {};
    area = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => map[k] ?? null,
      setItem: (k: string, v: string) => {
        map[k] = v;
      },
      removeItem: (k: string) => {
        delete map[k];
      },
    });
    const text = 'Un article suffisamment long pour être analysé sérieusement.';
    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: {
        sendMessage: vi.fn(),
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
        getURL: vi.fn((p: string) => `chrome-extension://mock/${p}`),
        lastError: null,
      },
      tabs: {
        query: vi.fn((_q: unknown, cb: (t: unknown[]) => void) => cb([{ id: TAB, active: true }])),
        get: vi.fn().mockResolvedValue({ id: TAB, windowId: 1 }),
        sendMessage: vi.fn((_tabId: number, msg: { type?: string }, cb?: (r?: unknown) => void) => {
          if (msg.type === 'FC_EXTRACT_CONTENT') {
            cb?.({
              success: true,
              data: { fullText: text, cleanText: text, wordCount: 900, blocks: [], metadata: { title: 'T' } },
            });
            return;
          }
          cb?.({ success: true });
        }),
        onRemoved: { addListener: vi.fn() },
        onUpdated: { addListener: vi.fn() },
      },
      scripting: { executeScript: vi.fn() },
      action: { onClicked: { addListener: vi.fn() }, setTitle: vi.fn() },
      sidePanel: { setOptions: vi.fn().mockResolvedValue(undefined), open: vi.fn().mockResolvedValue(undefined) },
      // A storage that remembers: the mode and the session are read back.
      storage: {
        local: {
          get: vi.fn(async (keys?: string | string[] | null) => {
            const names = keys == null ? Object.keys(area) : Array.isArray(keys) ? keys : [keys];
            return Object.fromEntries(names.filter((k) => k in area).map((k) => [k, area[k]]));
          }),
          set: vi.fn(async (items: Record<string, unknown>) => {
            Object.assign(area, items);
          }),
          remove: vi.fn(async (keys: string | string[]) => {
            for (const k of Array.isArray(keys) ? keys : [keys]) delete area[k];
          }),
        },
      },
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('forgets the dead session and asks the reader to sign in again', async () => {
    const storage = new SecureKeyStorage('passphrase');
    await storage.getOrCreateHostedKeyPair();
    await storage.saveHostedSession({ token: 'revoked', keyId: 'kid' });
    await storage.setMode('hosted');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'invalid_token', message: 'This token is not valid.' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        })
      )
    );

    const sw = new BackgroundServiceWorker({ keyStorage: storage });
    const res = await sw.runAnalysisForTab(TAB);

    expect(res.success).toBe(false);
    expect(res.error).toBe('Votre connexion a expiré. Reconnectez-vous depuis les réglages.');
    expect(await storage.getHostedSession()).toBeNull();
    // The BYOK key is untouched: only the hosted session was forgotten.
    expect(await storage.getMode()).toBe('hosted');
  });
});
