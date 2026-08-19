/**
 * The side panel is one long-lived surface that many different pages pass
 * through. The reported defect: with a report open for one article, navigate
 * the tab to a different one and press analyse - the extension re-analyses,
 * or keeps displaying, the article that is no longer on screen.
 *
 * Root cause traced by reading the code: the panel resolved its tracked tab
 * exactly once, on mount, and never subscribed to any tab-lifecycle event, so
 * neither a tab switch nor a same-tab navigation (including a client-side
 * route change that never enters a loading phase) ever cleared the displayed
 * report or invalidated a request already in flight. On the background side,
 * `setupTabListeners` reached for `chrome.tabs` directly, so this whole
 * mechanism was a silent no-op on Firefox, and its navigation reset never
 * aborted a running pipeline, leaving it free to overwrite a freshly reset
 * tab state with a result computed for the page the reader had already left.
 *
 * This file covers both halves of the fix: the background worker's tab
 * tracking and pipeline abort (BackgroundServiceWorker), and the panel's own
 * page-identity tracking and stale-response guarding (SidepanelApp).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';

import { BackgroundServiceWorker } from '../src/background';
import { TypedMessageBus } from '../src/messaging/messageBus';
import { SecureKeyStorage } from '../src/crypto/storage';
import { SidepanelApp } from '../src/sidepanel/main';
import type { FcRpcMap, AnalysisOutcome } from '../src/messaging/protocol';
import type { AnalysisResult } from '../src/engine/types';
import type { PipelineProgressEvent } from '../src/engine/pipeline';

declare global {
  /** React reads this to accept act() as a genuine test boundary. */
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// The background layer tests exercise the real BackgroundServiceWorker end to
// end, so its pipeline must be replaced with something the test can drive by
// hand: real analysis needs network calls, an abort race needs a promise the
// test controls, and none of that is available in this environment.
interface FakePipelineCall {
  text: string;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}
const pipelineState = vi.hoisted(() => ({
  calls: [] as FakePipelineCall[],
  aborted: [] as string[],
}));

vi.mock('../src/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/engine')>();
  class FakeAnalysisPipeline {
    private lastText = '';
    constructor(private options: { onProgress?: (evt: PipelineProgressEvent) => void } = {}) {}
    abort(): void {
      pipelineState.aborted.push(this.lastText);
    }
    analyze(input: { text: string }): Promise<unknown> {
      this.lastText = input.text;
      this.options.onProgress?.({
        status: 'analyzing',
        stage: 'calling_provider',
        message: 'Analyse en cours…',
        progress: 40,
      });
      return new Promise((resolve, reject) => {
        pipelineState.calls.push({ text: input.text, resolve, reject });
      });
    }
  }
  return { ...actual, AnalysisPipeline: FakeAnalysisPipeline };
});

vi.mock('../src/client/factory', () => ({
  LLMClientFactory: { createClient: vi.fn(() => ({})) },
}));

const flush = async (ticks = 5): Promise<void> => {
  for (let i = 0; i < ticks; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
};

const fakeReport = (marker: string): AnalysisResult => ({
  schemaVersion: 1,
  score: 70,
  scoreBand: 'perfectible',
  summary: `Résumé du rapport ${marker}`,
  categories: [],
  findings: [],
  claims: [],
  research: { performed: false, queries: [], withdrawn: [] },
  meta: { model: 'test-model', promptVersion: '1', analyzedAt: new Date().toISOString(), durationMs: 1200 },
});

function buildArticleText(marker: string): string {
  return Array.from(
    { length: 40 },
    () =>
      `Ce paragraphe de test appartient à l’article ${marker} et développe un argument ` +
      'suffisamment long pour dépasser le seuil minimal de mots requis par ' +
      'l’extension avant d’accepter de lancer une analyse critique complète.'
  ).join(' ');
}

function makeFakeKeyStorage(): SecureKeyStorage {
  return {
    getActiveProvider: vi.fn().mockResolvedValue('openai'),
    getProviderConfig: vi.fn().mockResolvedValue({ provider: 'openai', apiKey: 'test-key', model: 'gpt-4o' }),
  } as unknown as SecureKeyStorage;
}

describe('page-change invalidation', () => {
  let runtimeListeners: Array<(msg: unknown, sender: unknown, sendResp: (r?: unknown) => void) => boolean | void>;
  let onRemovedListeners: Array<(tabId: number) => void>;
  let onUpdatedListeners: Array<
    (tabId: number, changeInfo: { status?: string; url?: string }, tab: unknown) => void
  >;
  let onActivatedListeners: Array<(info: { tabId: number; windowId?: number }) => void>;
  let activeTab: { id: number; url: string; active: boolean; windowId: number };
  let currentArticle: { title: string; fullText: string };
  let storageData: Record<string, unknown>;

  const navigateTab = (url: string, opts: { status?: string } = {}): void => {
    activeTab = { ...activeTab, url };
    for (const cb of [...onUpdatedListeners]) cb(activeTab.id, { status: opts.status, url }, { ...activeTab });
  };

  beforeEach(() => {
    runtimeListeners = [];
    onRemovedListeners = [];
    onUpdatedListeners = [];
    onActivatedListeners = [];
    activeTab = { id: 101, url: 'https://news.example/article-a', active: true, windowId: 1 };
    currentArticle = { title: 'Article A', fullText: buildArticleText('A') };
    storageData = {};

    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: {
        sendMessage: vi.fn((msg: unknown, callback?: (resp: unknown) => void) => {
          let handledAsync = false;
          for (const listener of runtimeListeners) {
            const res = listener(msg, { id: 'mock-sender' }, (resp) => callback?.(resp));
            if (res === true) handledAsync = true;
          }
          if (!handledAsync && callback) callback(undefined);
        }),
        onMessage: {
          addListener: vi.fn((listener) => runtimeListeners.push(listener)),
          removeListener: vi.fn((listener) => {
            const idx = runtimeListeners.indexOf(listener);
            if (idx >= 0) runtimeListeners.splice(idx, 1);
          }),
        },
        getURL: vi.fn((path: string) => `chrome-extension://mock-id/${path}`),
        getManifest: vi.fn(() => ({ content_scripts: [{ js: ['content.js'] }] })),
        lastError: null,
      },
      tabs: {
        query: vi.fn((_queryInfo: unknown, callback: (tabs: unknown[]) => void) => {
          callback([{ ...activeTab }]);
        }),
        get: vi.fn().mockResolvedValue({ windowId: 1 }),
        sendMessage: vi.fn((_tabId: number, msg: unknown, callback?: (resp: unknown) => void) => {
          const msgObj = msg as { type?: string };
          if (msgObj?.type === 'FC_EXTRACT_CONTENT') {
            callback?.({
              success: true,
              data: {
                metadata: { title: currentArticle.title },
                fullText: currentArticle.fullText,
                cleanText: currentArticle.fullText,
                wordCount: currentArticle.fullText.split(/\s+/).length,
                blocks: [],
                detectionMethod: 'semantic-article',
                extractionConfidence: 0.9,
                rootContainerSelector: 'article',
                citedSources: [],
              },
            });
          } else {
            callback?.({ success: true });
          }
        }),
        onRemoved: {
          addListener: vi.fn((cb) => onRemovedListeners.push(cb)),
          removeListener: vi.fn((cb) => {
            const idx = onRemovedListeners.indexOf(cb);
            if (idx >= 0) onRemovedListeners.splice(idx, 1);
          }),
        },
        onUpdated: {
          addListener: vi.fn((cb) => onUpdatedListeners.push(cb)),
          removeListener: vi.fn((cb) => {
            const idx = onUpdatedListeners.indexOf(cb);
            if (idx >= 0) onUpdatedListeners.splice(idx, 1);
          }),
        },
        onActivated: {
          addListener: vi.fn((cb) => onActivatedListeners.push(cb)),
          removeListener: vi.fn((cb) => {
            const idx = onActivatedListeners.indexOf(cb);
            if (idx >= 0) onActivatedListeners.splice(idx, 1);
          }),
        },
      },
      scripting: {
        executeScript: vi.fn().mockResolvedValue(undefined),
      },
      sidePanel: {
        setPanelBehavior: vi.fn().mockResolvedValue(undefined),
        open: vi.fn().mockResolvedValue(undefined),
      },
      action: {
        onClicked: { addListener: vi.fn() },
      },
      storage: {
        local: {
          get: vi.fn((keys?: string[]) => {
            if (!keys) return Promise.resolve({ ...storageData });
            const result: Record<string, unknown> = {};
            for (const k of keys) if (k in storageData) result[k] = storageData[k];
            return Promise.resolve(result);
          }),
          set: vi.fn((items: Record<string, unknown>) => {
            Object.assign(storageData, items);
            return Promise.resolve();
          }),
          remove: vi.fn(() => Promise.resolve()),
        },
      },
    };

    pipelineState.calls = [];
    pipelineState.aborted = [];
  });

  afterEach(() => {
    delete (globalThis as unknown as { chrome?: unknown }).chrome;
  });

  describe('BackgroundServiceWorker: page identity across navigation', () => {
    it('analyzes whatever document is live on the tab, so a same-tab navigation is reflected in the next trigger', async () => {
      const sw = new BackgroundServiceWorker({ keyStorage: makeFakeKeyStorage() });
      sw.init();
      const busClient = new TypedMessageBus('sidepanel');

      const respAPromise = busClient.callRPC<'TRIGGER_ANALYSIS', FcRpcMap>('TRIGGER_ANALYSIS', { tabId: 101 });
      await vi.waitFor(() => expect(pipelineState.calls.length).toBe(1));
      expect(pipelineState.calls[0].text).toContain('article A');
      pipelineState.calls[0].resolve(fakeReport('A'));
      const respA = await respAPromise;
      expect(respA.success).toBe(true);

      // The reader clicks a link to a different article; the tab stays the
      // same, so nothing about `tabId` changes.
      currentArticle = { title: 'Article B', fullText: buildArticleText('B') };
      navigateTab('https://news.example/article-b', { status: 'loading' });

      const respBPromise = busClient.callRPC<'TRIGGER_ANALYSIS', FcRpcMap>('TRIGGER_ANALYSIS', { tabId: 101 });
      await vi.waitFor(() => expect(pipelineState.calls.length).toBe(2));
      expect(pipelineState.calls[1].text).toContain('article B');
      expect(pipelineState.calls[1].text).not.toContain('article A');
      pipelineState.calls[1].resolve(fakeReport('B'));
      await respBPromise;

      busClient.destroy();
      sw.destroy();
    });

    it('resets stored tab state on a same-tab route change that never reports a loading phase', () => {
      const sw = new BackgroundServiceWorker({ keyStorage: makeFakeKeyStorage() });
      sw.init();

      sw.getStateManager().updateTabState(101, { status: 'complete', progress: 100, result: fakeReport('A') });
      expect(sw.getStateManager().getTabState(101)?.status).toBe('complete');

      // A client-side route change (history.pushState) reports the new URL
      // without ever entering a 'loading' status.
      navigateTab('https://news.example/article-b');

      const state = sw.getStateManager().getTabState(101);
      expect(state?.status).toBe('idle');
      expect(state?.result).toBeUndefined();
      expect(state?.url).toBe('https://news.example/article-b');

      sw.destroy();
    });

    it('aborts a running pipeline on navigation without reporting an error for the page the reader already left', async () => {
      const sw = new BackgroundServiceWorker({ keyStorage: makeFakeKeyStorage() });
      sw.init();
      const busClient = new TypedMessageBus('sidepanel');
      const seenErrors: unknown[] = [];
      busClient.on('ANALYSIS_ERROR', (payload) => seenErrors.push(payload));

      const respPromise = busClient.callRPC<'TRIGGER_ANALYSIS', FcRpcMap>('TRIGGER_ANALYSIS', { tabId: 101 });
      await vi.waitFor(() => expect(pipelineState.calls.length).toBe(1));

      navigateTab('https://news.example/article-b', { status: 'loading' });
      expect(pipelineState.aborted).toHaveLength(1);

      // What abort() actually causes downstream: the in-flight analyze()
      // rejects.
      pipelineState.calls[0].reject(new DOMException('Aborted', 'AbortError'));
      const resp = await respPromise;

      expect(resp.success).toBe(false);
      const state = sw.getStateManager().getTabState(101);
      expect(state?.status).toBe('idle');
      expect(state?.error).toBeUndefined();
      expect(seenErrors).toHaveLength(0);

      busClient.destroy();
      sw.destroy();
    });
  });

  describe('SidepanelApp: page-change invalidation', () => {
    let container: HTMLDivElement;
    let root: Root;
    let bgBus: TypedMessageBus;

    beforeEach(() => {
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
    });

    it('clears a displayed report when the tracked tab navigates to a different document in the same tab', async () => {
      await act(async () => {
        root.render(<SidepanelApp />);
      });
      await flush();

      await act(async () => {
        await bgBus.dispatch('ANALYSIS_COMPLETE', { tabId: 101, result: fakeReport('A') });
      });
      await flush();

      expect(container.textContent).toContain('Résumé du rapport A');
      expect(container.textContent).toContain('Relancer l’analyse');

      act(() => {
        for (const cb of [...onUpdatedListeners]) {
          cb(101, { url: 'https://news.example/article-b' }, { ...activeTab, url: 'https://news.example/article-b' });
        }
      });
      await flush();

      expect(container.textContent).not.toContain('Résumé du rapport A');
      expect(container.textContent).toContain('Lancer l’analyse critique');
    });

    it('discards a stale analysis response that resolves after the reader has navigated away, same tab', async () => {
      const keyStorage = new SecureKeyStorage();
      await keyStorage.saveProviderConfig({ provider: 'openai', apiKey: 'test-key', model: 'gpt-4o' });
      await keyStorage.setActiveProvider('openai');

      let resolveTrigger!: (v: AnalysisOutcome) => void;
      const triggerPromise = new Promise<AnalysisOutcome>((resolve) => {
        resolveTrigger = resolve;
      });
      bgBus.registerRPC<'TRIGGER_ANALYSIS', FcRpcMap>('TRIGGER_ANALYSIS', () => triggerPromise);

      await act(async () => {
        root.render(<SidepanelApp />);
      });
      await flush();

      const button = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Lancer l’analyse critique')
      );
      expect(button).toBeDefined();

      act(() => {
        button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await flush();

      expect(container.textContent).toContain('Analyse en cours');

      // The reader navigates to a different article while the request for
      // the first one is still pending.
      act(() => {
        for (const cb of [...onUpdatedListeners]) {
          cb(101, { url: 'https://news.example/article-b' }, { ...activeTab, url: 'https://news.example/article-b' });
        }
      });
      await flush();

      expect(container.textContent).not.toContain('Analyse en cours');
      expect(container.textContent).toContain('Lancer l’analyse critique');

      // The stale request for the first article finally resolves.
      await act(async () => {
        resolveTrigger({ success: true, result: fakeReport('A') });
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      });
      await flush();

      expect(container.textContent).not.toContain('Résumé du rapport A');
      expect(container.textContent).toContain('Lancer l’analyse critique');
    });
  });
});
