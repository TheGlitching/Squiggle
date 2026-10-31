import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { SecureKeyStorage } from '../src/crypto/storage';
import { BackgroundServiceWorker } from '../src/background';
import type { PodcastPage } from '../src/podcast/transcript';

/**
 * The background's half of a podcast episode's published transcript: the
 * page is probed in its own world, its feed and the transcript are read from
 * the reader's browser, and the transcript, not the page, is what the audit
 * reads. A feed the browser will not let the extension read is answered as
 * the site to ask the reader for, never as "no transcript".
 */

const TAB = 404;
const PAGE: PodcastPage = {
  url: 'https://podcast.exemple.fr/le-podcast/la-nuit-du-4-aout',
  title: 'La nuit du 4 août | Le podcast',
  feeds: ['https://feed.exemple.fr/le-podcast'],
  audio: ['https://audio.exemple.fr/ep.mp3'],
};
const FEED = `<rss xmlns:podcast="https://podcastindex.org/namespace/1.0"><channel><item>
  <title>La nuit du 4 août</title><link>${PAGE.url}</link>
  <podcast:transcript type="text/vtt" url="https://transcripts.exemple.fr/ep.vtt"/>
</item></channel></rss>`;
const SENTENCE = 'Le 4 août 1789, les députés votent l’abolition des privilèges, une décision prise dans la nuit et dans l’enthousiasme.';
const VTT =
  'WEBVTT\n\n' +
  Array.from({ length: 14 }, (_, i) => `${i + 1}\n00:00:${String(i * 4).padStart(2, '0')}.000 --> 00:00:${String(i * 4 + 3).padStart(2, '0')}.000\n${SENTENCE}\n`).join('\n');

describe('a podcast episode’s published transcript, in the background', () => {
  let shared: Record<string, unknown>;
  let requests: string[];
  let granted: boolean;
  let feedOpen: boolean;

  beforeEach(async () => {
    shared = {};
    requests = [];
    granted = false;
    feedOpen = true;
    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: {
        sendMessage: vi.fn(),
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
        getURL: vi.fn((p: string) => `chrome-extension://mock/${p}`),
        lastError: null,
      },
      tabs: {
        query: vi.fn((_q: unknown, cb: (t: unknown[]) => void) => cb([{ id: TAB, active: true }])),
        get: vi.fn().mockResolvedValue({ id: TAB, windowId: 1, url: PAGE.url }),
        sendMessage: vi.fn((_t: number, _m: unknown, cb?: (r?: unknown) => void) => cb?.({ success: true })),
        onRemoved: { addListener: vi.fn() },
        onUpdated: { addListener: vi.fn() },
      },
      scripting: { executeScript: vi.fn(async () => [{ result: PAGE }]) },
      permissions: { contains: vi.fn(async () => granted), request: vi.fn(), remove: vi.fn() },
      action: { onClicked: { addListener: vi.fn() }, setTitle: vi.fn() },
      sidePanel: { setOptions: vi.fn().mockResolvedValue(undefined) },
      storage: {
        local: {
          get: async (keys: string[]) => Object.fromEntries(keys.filter((k) => k in shared).map((k) => [k, shared[k]])),
          set: async (items: Record<string, unknown>) => void Object.assign(shared, items),
        },
      },
    };
    const keys = new SecureKeyStorage();
    await keys.saveProviderConfig({ provider: 'openrouter', apiKey: 'sk-or-test', model: 'deepseek/deepseek-v4.1-flash' });
    await keys.setActiveProvider('openrouter');

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: { body?: string }) => {
        if (url === PAGE.feeds[0]) {
          // A host that sends no CORS header: the browser refuses the extension until the reader allows the site.
          if (!feedOpen && !granted) throw new TypeError('Failed to fetch');
          return new Response(FEED);
        }
        if (url === 'https://transcripts.exemple.fr/ep.vtt') return new Response(VTT);
        requests.push(init?.body ?? '');
        return new Response('{}', { status: 500 });
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (globalThis as unknown as { chrome?: unknown }).chrome;
  });

  it('analyses the transcript the feed publishes, under the episode’s address, instead of the page', async () => {
    const sw = new BackgroundServiceWorker();
    const res = await sw.runAnalysisForTab(TAB, { podcast: true });
    // The stub provider fails the audit: what matters is what it was sent.
    expect(res.success).toBe(false);

    expect(requests.length).toBeGreaterThan(0);
    const prompt = requests[0];
    expect(prompt).toContain('abolition des privilèges');
    expect(prompt).toContain(PAGE.url);
    // The page itself was never read as an article.
    expect((globalThis as unknown as { chrome: { tabs: { sendMessage: ReturnType<typeof vi.fn> } } }).chrome.tabs.sendMessage.mock.calls.some(
      ([, m]) => (m as { type?: string }).type === 'FC_EXTRACT_CONTENT'
    )).toBe(false);
  });

  it('names the feed’s site to ask for when the browser will not let it be read', async () => {
    feedOpen = false;
    const sw = new BackgroundServiceWorker();
    const probe = (sw as unknown as { findPodcastTranscript(tab: number): Promise<unknown> }).findPodcastTranscript.bind(sw);
    expect(await probe(TAB)).toEqual({ locked: [PAGE.feeds[0]] });
    granted = true;
    expect(await probe(TAB)).toMatchObject({ transcript: { url: 'https://transcripts.exemple.fr/ep.vtt', title: 'La nuit du 4 août' } });
  });

  it('says so when the transcript cannot be read, and sends nothing to the model', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === PAGE.feeds[0] ? new Response(FEED) : new Response('', { status: 404 }))));
    const res = await new BackgroundServiceWorker().runAnalysisForTab(TAB, { podcast: true });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/La transcription de cet épisode n’a pas pu être lue/);
  });
});
