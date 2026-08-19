import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SecureKeyStorage } from '../src/crypto/storage';
import { BackgroundServiceWorker } from '../src/background';
import { DEMO_FOURCHES_CAUDINES_REPORT } from '../src/engine/demoFixture';

/**
 * The question this answers: when a key is configured, does clicking analyse
 * send *the article in front of the user* to the provider, and return what the
 * provider said about it? The bundled sample used to be served instead, which
 * looked identical in the panel while describing a different article.
 */
describe('analysis with a configured key', () => {
  const TAB = 202;
  const ARTICLE =
    'Le gouvernement affirme que la dette baissera dès 2027, sans citer aucune source chiffrée, ' +
    'et attribue à ses opposants une position qu’ils n’ont jamais défendue. ' +
    'Cette assertion repose sur une corrélation présentée comme une causalité. '.repeat(12);

  let shared: Record<string, unknown>;
  let requests: Array<{ url: string; body: string }>;

  beforeEach(async () => {
    shared = {};
    requests = [];

    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: {
        sendMessage: vi.fn(),
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
        getURL: vi.fn((p: string) => `chrome-extension://mock/${p}`),
        getManifest: vi.fn(() => ({ content_scripts: [{ js: ['content-script.js'] }] })),
        lastError: null,
      },
      tabs: {
        query: vi.fn((_q: unknown, cb: (t: unknown[]) => void) => cb([{ id: TAB, active: true }])),
        get: vi.fn().mockResolvedValue({ id: TAB, windowId: 1 }),
        sendMessage: vi.fn((_t: number, _m: unknown, cb?: (r?: unknown) => void) => cb?.({ success: true })),
        onRemoved: { addListener: vi.fn() },
        onUpdated: { addListener: vi.fn() },
      },
      action: { onClicked: { addListener: vi.fn() }, setTitle: vi.fn() },
      sidePanel: { setOptions: vi.fn().mockResolvedValue(undefined) },
      storage: {
        local: {
          get: async (keys: string[]) => {
            const out: Record<string, unknown> = {};
            for (const k of keys) if (k in shared) out[k] = shared[k];
            return out;
          },
          set: async (items: Record<string, unknown>) => void Object.assign(shared, items),
        },
      },
    };

    // The user configures a key in the panel.
    await new SecureKeyStorage().saveProviderConfig({
      provider: 'anthropic',
      apiKey: 'sk-ant-test',
      model: 'claude-sonnet-4',
    });

    // Stand in for the provider, speaking the SSE protocol the client really
    // reads, and record exactly what was sent.
    const answer = {
      ...JSON.parse(JSON.stringify(DEMO_FOURCHES_CAUDINES_REPORT)),
      summary: 'Verdict portant sur l’article réellement transmis.',
    };
    const sse = (text: string): ReadableStream<Uint8Array> => {
      const encoder = new TextEncoder();
      const events = [
        { type: 'message_start', message: { usage: { input_tokens: 1200 } } },
        { type: 'content_block_delta', delta: { text } },
        { type: 'message_delta', usage: { output_tokens: 800 } },
      ];
      return new ReadableStream({
        start(controller) {
          for (const e of events) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: { body: string }) => {
        requests.push({ url, body: init.body });
        return {
          ok: true,
          status: 200,
          body: sse(JSON.stringify(answer)),
          json: async () => answer,
          text: async () => JSON.stringify(answer),
        };
      })
    );
  });

  it('sends the article to the provider and returns the provider’s verdict', async () => {
    const sw = new BackgroundServiceWorker();
    const res = await sw.runAnalysisForTab(TAB, {
      articleText: ARTICLE,
      articleTitle: 'La dette et ses promesses',
    });

    // The provider is called for research before the audit, so the audit is not
    // the first call. The audit is the last one, and it is the call that has to
    // carry the user's own article.
    expect(requests.length).toBeGreaterThan(1);
    const audit = requests[requests.length - 1];
    expect(audit.url).toContain('/messages');
    expect(audit.body).toContain('La dette et ses promesses');
    expect(audit.body).toContain('la dette baissera dès 2027');

    // And the answer came back from that call, not from the bundled sample.
    expect(res.success).toBe(true);
    expect(res.result?.summary).toBe('Verdict portant sur l’article réellement transmis.');
    expect(res.result?.meta.model).not.toContain('démonstration');
  });

  it('surfaces a provider failure instead of substituting a report', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'invalid x-api-key' } }),
        text: async () => 'invalid x-api-key',
      }))
    );

    const sw = new BackgroundServiceWorker();
    const res = await sw.runAnalysisForTab(TAB, { articleText: ARTICLE, articleTitle: 'Titre' });

    expect(res.success).toBe(false);
    expect(res.result).toBeUndefined();
  });
});
