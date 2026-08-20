import { describe, it, expect, beforeEach } from 'vitest';
import { TabStateManager } from '../src/background/tabStateManager';

/**
 * An MV3 service worker is killed after a short idle period. Everything the analysis
 * produced lived in a Map, so returning to a tab after that showed an empty panel and
 * the report had to be bought a second time. The reported symptom was switching tabs;
 * the cause was the worker dying in between.
 */
describe('tab state survives the service worker', () => {
  let store: Record<string, unknown>;

  beforeEach(() => {
    store = {};
    (globalThis as unknown as { chrome: unknown }).chrome = {
      storage: {
        session: {
          get: async (keys: string[]) => {
            const out: Record<string, unknown> = {};
            for (const k of keys) if (k in store) out[k] = store[k];
            return out;
          },
          set: async (items: Record<string, unknown>) => {
            Object.assign(store, items);
          },
        },
      },
    };
  });

  /** What a finished analysis leaves behind, minus the parts tests do not need. */
  const finished = {
    url: 'https://news.example/article-a',
    title: 'Un titre réel',
    status: 'complete' as const,
    progress: 100,
    result: { score: 64, scoreBand: 'perfectible' } as never,
    findings: [{ blockId: 'b1', category: 'sophisme' }] as never,
  };

  it('gives the report back to a new worker instead of starting from idle', async () => {
    const dying = new TabStateManager();
    await dying.ready;
    dying.updateTabState(101, finished);

    // The worker is terminated; only what reached storage.session remains.
    const revived = new TabStateManager();
    await revived.ready;

    const state = revived.getTabState(101);
    expect(state?.status).toBe('complete');
    expect(state?.result).toEqual({ score: 64, scoreBand: 'perfectible' });
    expect(state?.url).toBe('https://news.example/article-a');
  });

  it('drops the extracted article rather than mirroring the page text', async () => {
    const sw = new TabStateManager();
    await sw.ready;
    sw.updateTabState(101, {
      ...finished,
      article: { fullText: 'le texte intégral de la page', wordCount: 900 } as never,
    });

    // Nothing reads the article after the analysis, and keeping the page's text is
    // exactly what the privacy policy says the extension does not do.
    expect(JSON.stringify(store)).not.toContain('le texte intégral de la page');

    const revived = new TabStateManager();
    await revived.ready;
    expect(revived.getTabState(101)?.article).toBeUndefined();
    expect(revived.getTabState(101)?.status).toBe('complete');
  });

  it('forgets a tab whose page changed, so a stale verdict cannot come back', async () => {
    const sw = new TabStateManager();
    await sw.ready;
    sw.updateTabState(101, finished);
    sw.removeTabState(101);

    const revived = new TabStateManager();
    await revived.ready;
    expect(revived.getTabState(101)).toBeUndefined();
  });

  it('keeps the most recent tabs only, so the quota cannot run away', async () => {
    const sw = new TabStateManager();
    await sw.ready;
    for (let tabId = 1; tabId <= 40; tabId += 1) {
      sw.updateTabState(tabId, { ...finished, url: `https://news.example/${tabId}` });
    }

    const revived = new TabStateManager();
    await revived.ready;
    const kept = revived.getAllStates();

    expect(kept.length).toBe(25);
    // The oldest went first: tab 40 was written last and must have survived.
    expect(revived.getTabState(40)).toBeDefined();
    expect(revived.getTabState(1)).toBeUndefined();
  });

  it('still works where the browser offers no session storage', async () => {
    (globalThis as unknown as { chrome: unknown }).chrome = { storage: {} };

    const sw = new TabStateManager();
    await sw.ready;
    sw.updateTabState(101, finished);

    // Degrades to the old behaviour rather than throwing: one lost report at worst.
    expect(sw.getTabState(101)?.status).toBe('complete');
  });
});
