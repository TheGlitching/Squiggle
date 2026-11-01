import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BackgroundServiceWorker } from '../src/background';
import { SecureKeyStorage } from '../src/crypto/storage';

/**
 * Firefox ends an event page after ~30 s without an extension API call, and a
 * model call can outlast that: the analysis then dies mid-flight. The
 * background makes a cheap API call every 20 s while a run is in flight, and
 * stops when the run ends.
 */
describe('analysis keeps the background page alive', () => {
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
        getPlatformInfo: vi.fn().mockResolvedValue({ os: 'mac' }),
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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('ticks an extension API call every 20 s while the model call is pending, then stops', async () => {
    const storage = new SecureKeyStorage('passphrase');
    await storage.getOrCreateHostedKeyPair();
    await storage.saveHostedSession({ token: 't', keyId: 'kid' });
    await storage.setMode('hosted');

    let fail!: () => void;
    const fetchMock = vi.fn(() => new Promise<Response>((_, reject) => (fail = () => reject(new Error('network down')))));
    vi.stubGlobal('fetch', fetchMock);
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    const sw = new BackgroundServiceWorker({ keyStorage: storage });
    const run = sw.runAnalysisForTab(TAB);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    // The call is pending: the keep-alive is armed.
    const tick = setIntervalSpy.mock.calls.find(([, ms]) => ms === 20_000);
    expect(tick).toBeDefined();
    const id = setIntervalSpy.mock.results[setIntervalSpy.mock.calls.indexOf(tick!)].value;
    expect(clearIntervalSpy).not.toHaveBeenCalledWith(id);

    fail();
    await run;
    expect(clearIntervalSpy).toHaveBeenCalledWith(id);

    // What the tick does: an API call that resets Firefox's idle timer.
    const platformInfo = (globalThis as unknown as { chrome: { runtime: { getPlatformInfo: ReturnType<typeof vi.fn> } } })
      .chrome.runtime.getPlatformInfo;
    (tick![0] as () => void)();
    expect(platformInfo).toHaveBeenCalled();
  });
});
