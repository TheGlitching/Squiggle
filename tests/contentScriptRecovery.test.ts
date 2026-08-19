import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BackgroundServiceWorker } from '../src/background';

/**
 * A manifest-declared content script is only injected into pages that load
 * after the extension does, so any tab already open when the extension is
 * installed has no receiver. Analysis on such a tab used to fail with
 * "Impossible de récupérer le contenu de l'article pour analyse.", which blamed
 * the article for a wiring problem and gave the user nothing to act on.
 */
describe('article extraction recovery', () => {
  const TAB = 101;
  let injected: Array<{ tabId: number; files: string[] }>;
  let extractCalls: number;
  /** Set to make the next sendMessage report "no receiver", as Chrome does. */
  let receiverMissing: boolean;
  /** What the content script answers once it is reachable. */
  let extraction: Record<string, unknown>;

  beforeEach(() => {
    injected = [];
    extractCalls = 0;
    receiverMissing = true;
    extraction = {
      fullText: 'Un article suffisamment long pour être analysé sérieusement.',
      cleanText: 'Un article suffisamment long pour être analysé sérieusement.',
      wordCount: 900,
      blocks: [],
      metadata: { title: 'Titre réel' },
    };

    const runtime = {
      sendMessage: vi.fn(),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      getURL: vi.fn((p: string) => `chrome-extension://mock/${p}`),
      getManifest: vi.fn(() => ({ content_scripts: [{ js: ['content-script.js'] }] })),
      lastError: null as { message: string } | null,
    };

    const chromeMock = {
      runtime,
      tabs: {
        query: vi.fn((_q: unknown, cb: (t: unknown[]) => void) => cb([{ id: TAB, active: true }])),
        get: vi.fn().mockResolvedValue({ id: TAB, windowId: 1 }),
        sendMessage: vi.fn((_tabId: number, msg: unknown, cb?: (r?: unknown) => void) => {
          const type = (msg && typeof msg === 'object' && 'type' in msg ? msg.type : undefined) as
            | string
            | undefined;
          if (type !== 'FC_EXTRACT_CONTENT') {
            cb?.({ success: true });
            return;
          }
          extractCalls++;
          if (receiverMissing) {
            runtime.lastError = { message: 'Could not establish connection. Receiving end does not exist.' };
            cb?.(undefined);
            runtime.lastError = null;
            return;
          }
          cb?.({ success: true, data: extraction });
        }),
        onRemoved: { addListener: vi.fn() },
        onUpdated: { addListener: vi.fn() },
      },
      scripting: {
        executeScript: vi.fn(async (details: { target: { tabId: number }; files: string[] }) => {
          injected.push({ tabId: details.target.tabId, files: details.files });
          // Injection is what makes the receiver appear.
          receiverMissing = false;
          return [{ result: null }];
        }),
      },
      action: { onClicked: { addListener: vi.fn() }, setTitle: vi.fn() },
      sidePanel: { setOptions: vi.fn().mockResolvedValue(undefined), open: vi.fn().mockResolvedValue(undefined) },
      storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) } },
    };

    (globalThis as unknown as { chrome: unknown }).chrome = chromeMock;
  });

  it('injects the content script and retries when the page has no receiver', async () => {
    const sw = new BackgroundServiceWorker();
    const res = await sw.runAnalysisForTab(TAB);

    expect(injected).toEqual([{ tabId: TAB, files: ['content-script.js'] }]);
    // Asked once before injecting, once after.
    expect(extractCalls).toBe(2);
    expect(res.error ?? '').not.toContain('Impossible de lire cette page');
  });

  it('reports the page as unreadable only when injection cannot rescue it', async () => {
    const chromeMock = (globalThis as unknown as { chrome: { scripting: { executeScript: unknown } } }).chrome;
    chromeMock.scripting.executeScript = vi.fn(async () => {
      throw new Error('Cannot access contents of the page');
    });

    const sw = new BackgroundServiceWorker();
    const res = await sw.runAnalysisForTab(TAB);

    expect(res.success).toBe(false);
    expect(res.error).toContain('rechargez la page');
  });

  it('declines a paywalled teaser instead of scoring it as the article', async () => {
    receiverMissing = false;
    extraction = {
      fullText: 'Par Jean-Marc Vittori. L’Etat français doit payer un taux d’intérêt de plus en plus élevé.',
      cleanText: 'Par Jean-Marc Vittori. L’Etat français doit payer un taux d’intérêt de plus en plus élevé.',
      // What a real Les Echos article yields behind the paywall.
      wordCount: 110,
      blocks: [],
      metadata: { title: 'Le cliquet diabolique de la dette française' },
    };

    const sw = new BackgroundServiceWorker();
    const res = await sw.runAnalysisForTab(TAB);

    expect(res.success).toBe(false);
    expect(res.error).toContain('110 mots');
    expect(res.error).toContain('abonnés');
  });

  it('analyses a full-length article without injecting anything', async () => {
    receiverMissing = false;

    const sw = new BackgroundServiceWorker();
    const res = await sw.runAnalysisForTab(TAB);

    expect(injected).toEqual([]);
    expect(res.error ?? '').not.toContain('abonnés');
    expect(res.error ?? '').not.toContain('Impossible de lire cette page');
  });

  /**
   * A social feed is read perfectly well and simply holds no article. Measured on
   * a live x.com profile: nine `<article>` elements, one `<p>` in the whole
   * document, and nothing the extractor collects - so it answers with empty text
   * rather than failing. That answer used to produce the unreachable-page message,
   * which told the reader to reload a page that had just been read successfully.
   */
  it('tells the reader a social feed holds no article, rather than to reload it', async () => {
    receiverMissing = false;
    extraction = {
      fullText: '',
      cleanText: '',
      wordCount: 0,
      blocks: [],
      metadata: { title: 'Watt The Duck (@sjowall69) / X' },
    };

    const sw = new BackgroundServiceWorker();
    const res = await sw.runAnalysisForTab(TAB);

    expect(res.success).toBe(false);
    expect(res.error).toContain('aucun article');
    // The page was reachable, so reloading it is not the advice.
    expect(res.error ?? '').not.toContain('rechargez');
  });
});
