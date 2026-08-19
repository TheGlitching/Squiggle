import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BackgroundServiceWorker } from '../src/background';
import { TabStateManager } from '../src/background/tabStateManager';
import { TypedMessageBus } from '../src/messaging/messageBus';
import type { FcRpcMap } from '../src/messaging/protocol';

describe('BackgroundServiceWorker & TabStateManager', () => {
  let mockRuntimeListeners: Array<(msg: unknown, sender: unknown, sendResp: (r?: unknown) => void) => boolean | void>;
  let mockTabsOnRemoved: ((tabId: number) => void) | null = null;
  let mockTabsOnUpdated: ((tabId: number, changeInfo: { status?: string; url?: string }) => void) | null = null;
  let mockActionClicked: ((tab: { id?: number }) => void) | null = null;

  beforeEach(() => {
    mockRuntimeListeners = [];
    mockTabsOnRemoved = null;
    mockTabsOnUpdated = null;
    mockActionClicked = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: {
        sendMessage: vi.fn((msg: unknown, callback?: (resp: unknown) => void) => {
          let handledAsync = false;
          for (const listener of mockRuntimeListeners) {
            const res = listener(msg, { id: 'mock-sender' }, (resp) => {
              callback?.(resp);
            });
            if (res === true) handledAsync = true;
          }
          if (!handledAsync && callback) {
            callback(undefined);
          }
        }),
        onMessage: {
          addListener: vi.fn((listener) => {
            mockRuntimeListeners.push(listener);
          }),
          removeListener: vi.fn((listener) => {
            const idx = mockRuntimeListeners.indexOf(listener);
            if (idx >= 0) mockRuntimeListeners.splice(idx, 1);
          }),
        },
        getURL: vi.fn((path: string) => `chrome-extension://mock-id/${path}`),
        lastError: null,
      },
      tabs: {
        query: vi.fn((_queryInfo, callback) => {
          callback([{ id: 101, url: 'https://lemonde.fr/article-1', active: true }]);
        }),
        get: vi.fn().mockResolvedValue({ id: 101, windowId: 1 }),
        sendMessage: vi.fn((_tabId: number, msg: unknown, callback?: (resp: unknown) => void) => {
          if (callback) {
            // Mock content script extraction responses
            const msgObj = msg as { type?: string };
            if (msgObj?.type === 'FC_EXTRACT_CONTENT') {
              callback({
                success: true,
                data: {
                  title: 'Article Test',
                  fullText: 'Ceci est un article de test démontrant un biais d’ancrage et une affirmation sans preuve.',
                },
              });
            } else {
              callback({ success: true });
            }
          }
        }),
        onRemoved: {
          addListener: vi.fn((cb) => {
            mockTabsOnRemoved = cb;
          }),
        },
        onUpdated: {
          addListener: vi.fn((cb) => {
            mockTabsOnUpdated = cb;
          }),
        },
      },
      sidePanel: {
        setPanelBehavior: vi.fn().mockResolvedValue(undefined),
        open: vi.fn().mockResolvedValue(undefined),
      },
      action: {
        onClicked: {
          addListener: vi.fn((cb) => {
            mockActionClicked = cb;
          }),
        },
      },
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
          remove: vi.fn().mockResolvedValue(undefined),
        },
      },
    };
  });

  afterEach(() => {
    delete (globalThis as unknown as { chrome?: unknown }).chrome;
    delete (globalThis as unknown as { browser?: unknown }).browser;
  });

  describe('TabStateManager', () => {
    it('manages tab state lifecycle, creating and updating per-tab state', () => {
      const manager = new TabStateManager();

      const state1 = manager.getOrCreateTabState(101, { url: 'https://example.com/1' });
      expect(state1.tabId).toBe(101);
      expect(state1.status).toBe('idle');
      expect(state1.url).toBe('https://example.com/1');

      manager.updateTabState(101, { status: 'analyzing', progress: 45 });
      const updated = manager.getTabState(101);
      expect(updated?.status).toBe('analyzing');
      expect(updated?.progress).toBe(45);

      manager.removeTabState(101);
      expect(manager.getTabState(101)).toBeUndefined();
    });
  });

  describe('BackgroundServiceWorker', () => {
    it('initializes listeners and handles open sidepanel action', async () => {
      const sw = new BackgroundServiceWorker();
      sw.init();

      expect(mockActionClicked).toBeDefined();
      mockActionClicked?.({ id: 101 });

      const chromeObj = (globalThis as unknown as { chrome: { sidePanel: { open: ReturnType<typeof vi.fn> } } }).chrome;
      expect(chromeObj.sidePanel.open).toHaveBeenCalled();
      sw.destroy();
    });

    it('responds to GET_TAB_STATE and runs analysis lifecycle via demo mode pipeline', async () => {
      const busClient = new TypedMessageBus('sidepanel');
      const sw = new BackgroundServiceWorker();
      sw.init();

      // RPC GET_TAB_STATE
      const stateResp = await busClient.callRPC<'GET_TAB_STATE', FcRpcMap>('GET_TAB_STATE', { tabId: 101 });
      expect(stateResp.state).toBeDefined();
      expect(stateResp.state?.tabId).toBe(101);

      // Trigger analysis
      const analysisResp = await busClient.callRPC<'TRIGGER_ANALYSIS', FcRpcMap>('TRIGGER_ANALYSIS', {
        tabId: 101,
        articleText: 'Un texte de test suffisamment long pour une analyse critique complète avec arguments.',
        articleTitle: 'Titre Test',
      });

      expect(analysisResp.success).toBe(true);
      expect(analysisResp.result).toBeDefined();
      expect(analysisResp.result?.score).toBeGreaterThanOrEqual(0);

      const postState = sw.getStateManager().getTabState(101);
      // The pipeline emits 'completed'; the worker normalises it to the only
      // spelling PipelineStatus actually declares.
      expect(postState?.status).toBe('complete');
      expect(postState?.findings).toBeDefined();

      busClient.destroy();
      sw.destroy();
    });

    it('cleans up tab state when tab is removed or reloaded', () => {
      const sw = new BackgroundServiceWorker();
      sw.init();

      sw.getStateManager().updateTabState(101, { status: 'complete', progress: 100 });
      expect(sw.getStateManager().getTabState(101)?.status).toBe('complete');

      // Trigger tab reload navigation
      mockTabsOnUpdated?.(101, { status: 'loading', url: 'https://newurl.com' });
      expect(sw.getStateManager().getTabState(101)?.status).toBe('idle');
      expect(sw.getStateManager().getTabState(101)?.url).toBe('https://newurl.com');

      // Trigger tab remove
      mockTabsOnRemoved?.(101);
      expect(sw.getStateManager().getTabState(101)).toBeUndefined();

      sw.destroy();
    });
  });
});
