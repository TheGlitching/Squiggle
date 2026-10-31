/**
 * The installed app: its manifest, its icons and its service worker.
 *
 * The worker is run here against an in-memory Cache Storage, and the test
 * pins what it is allowed to answer: page navigations and the build's own
 * files, from its cache. An API, account or analysis request must reach the
 * network untouched every time, and a shared text in a navigation's query
 * string must never be sent anywhere.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(__dirname, '..', path));
const ORIGIN = 'https://squiggle.fr';
const SHELL = ['/', '/assets/index-abc.js', '/assets/index-abc.css', '/manifest.webmanifest'];

type Listener = (event: Record<string, unknown>) => void;

/** `sw.js` as the build emits it, run in a worker scope made of maps. */
function loadWorker(version = 'v1') {
  const source = read('sw.js')
    .toString('utf8')
    .replace("const VERSION = 'dev';", `const VERSION = '${version}';`)
    .replace('const SHELL = [];', `const SHELL = ${JSON.stringify(SHELL)};`);
  const stores = new Map<string, Map<string, string>>();
  const network: string[] = [];
  const listeners: Record<string, Listener> = {};
  const caches = {
    open: async (name: string) => {
      const store = stores.get(name) ?? new Map<string, string>();
      stores.set(name, store);
      return {
        match: async (path: string) => store.get(path),
        put: async (path: string, response: Response) => {
          store.set(path, `${response.headers.get('content-type')} ${await response.text()}`);
        },
        addAll: async (requests: Request[]) => {
          for (const request of requests) store.set(new URL(request.url, ORIGIN).pathname, `cached ${request.url}`);
        },
      };
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };
  const self = {
    location: new URL(ORIGIN),
    addEventListener: (type: string, listener: Listener) => (listeners[type] = listener),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  const state = { online: true };
  const fetch = async (input: string | Request) => {
    network.push(typeof input === 'string' ? input : input.url);
    if (!state.online) throw new TypeError('Failed to fetch');
    return `network ${typeof input === 'string' ? input : input.url}`;
  };
  // Relative requests resolve against the worker's origin, as they do in a worker.
  const RequestAt = class extends Request {
    constructor(input: string, init?: RequestInit) {
      super(new URL(input, ORIGIN), init);
    }
  };
  new Function('self', 'caches', 'fetch', 'Request', source)(self, caches, fetch, RequestAt);

  async function lifecycle(type: 'install' | 'activate') {
    let done: Promise<unknown> = Promise.resolve();
    listeners[type]({ waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
  }

  /** What the worker answers for this request, or `undefined` when it lets it through. */
  async function request(url: string, init: { method?: string; mode?: string; form?: FormData } = {}) {
    let answer: Promise<unknown> | undefined;
    listeners.fetch({
      request: {
        url: new URL(url, ORIGIN).toString(),
        method: init.method ?? 'GET',
        mode: init.mode ?? 'cors',
        formData: async () => init.form,
      },
      respondWith: (p: Promise<unknown>) => (answer = p),
    });
    return answer ? await answer : undefined;
  }

  return { lifecycle, request, stores, network, state };
}

describe('the service worker', () => {
  it('caches the shell on install, and answers a navigation with the fresh one, or the cached one offline', async () => {
    const worker = loadWorker();
    await worker.lifecycle('install');
    expect([...(worker.stores.get('squiggle-shell-v1')?.keys() ?? [])]).toEqual(SHELL);
    expect(await worker.request('/compte', { mode: 'navigate' })).toBe('network /');
    expect(await worker.request('/assets/index-abc.js')).toBe('cached https://squiggle.fr/assets/index-abc.js');
    worker.state.online = false;
    expect(await worker.request('/compte', { mode: 'navigate' })).toBe('cached https://squiggle.fr/');
  });

  it('keeps a shared text on the device: a navigation only ever asks for the bare shell', async () => {
    const worker = loadWorker();
    await worker.lifecycle('install');
    const before = worker.network.length;
    const shared = `/analyser?${new URLSearchParams({ text: 'Le texte de l’article partagé.' })}`;
    expect(await worker.request(shared, { mode: 'navigate' })).toBe('network /');
    expect(worker.network.slice(before)).toEqual(['/']);
  });

  it.each([
    ['/web/analyze/check?text=abc', 'cors'],
    ['/web/account', 'cors'],
    ['/v1/analyze/audit', 'cors'],
    ['/auth/google', 'navigate'],
    ['/auth/google/callback?code=x&state=y', 'navigate'],
    ['/health', 'cors'],
    ['/landing/rapport.png', 'no-cors'],
    // A real file opened as a page is that file, not the app's 404.
    ['/sitemap.xml', 'navigate'],
    ['/robots.txt', 'navigate'],
    ['/.well-known/assetlinks.json', 'navigate'],
    ['/og/accueil.png', 'navigate'],
  ])('lets %s through to the network, uncached', async (url, mode) => {
    const worker = loadWorker();
    await worker.lifecycle('install');
    expect(await worker.request(url, { mode })).toBeUndefined();
  });

  it('keeps a share on the device: screenshots and a PDF wait in its cache, the text goes to the page’s address', async () => {
    const worker = loadWorker();
    await worker.lifecycle('install');
    const before = worker.network.length;
    const form = new FormData();
    form.set('title', 'Un article');
    form.set('text', '');
    form.append('captures', new File(['première'], 'capture-1.png', { type: 'image/png' }));
    form.append('captures', new File(['seconde'], 'capture-2.jpg', { type: 'image/jpeg' }));
    form.append('captures', new File(['%PDF'], 'rapport.pdf', { type: 'application/pdf' }));
    form.append('captures', new File(['notes'], 'notes.txt', { type: 'text/plain' }));

    const answer = (await worker.request('/analyser', { method: 'POST', mode: 'navigate', form })) as Response;
    expect(answer.status).toBe(303);
    expect(answer.headers.get('location')).toBe('https://squiggle.fr/analyser?title=Un+article&captures=3');
    expect([...(worker.stores.get('squiggle-partage') ?? new Map()).entries()]).toEqual([
      ['/partage/0', 'image/png première'],
      ['/partage/1', 'image/jpeg seconde'],
      ['/partage/2', 'application/pdf %PDF'],
    ]);
    expect(worker.network.slice(before)).toEqual([]);
  });

  it('turns a shared text into the page’s address, as a share by GET did', async () => {
    const worker = loadWorker();
    const form = new FormData();
    form.set('text', 'Le texte partagé https://exemple.fr/article');
    const answer = (await worker.request('/analyser', { method: 'POST', mode: 'navigate', form })) as Response;
    expect(answer.headers.get('location')).toBe(
      `https://squiggle.fr/analyser?${new URLSearchParams({ text: 'Le texte partagé https://exemple.fr/article' })}`,
    );
    expect(worker.stores.has('squiggle-partage')).toBe(false);
  });

  it('never touches a write, or another origin', async () => {
    const worker = loadWorker();
    await worker.lifecycle('install');
    expect(await worker.request('/web/analyze/audit', { method: 'POST' })).toBeUndefined();
    expect(await worker.request('/', { method: 'POST', mode: 'navigate' })).toBeUndefined();
    expect(await worker.request('https://fonts.googleapis.com/css2?family=x')).toBeUndefined();
  });

  it('drops the previous build’s shell when the new one activates', async () => {
    const worker = loadWorker('v2');
    worker.stores.set('squiggle-shell-v1', new Map([['/', 'old']]));
    worker.stores.set('another-cache', new Map());
    await worker.lifecycle('install');
    await worker.lifecycle('activate');
    expect([...worker.stores.keys()].sort()).toEqual(['another-cache', 'squiggle-shell-v2']);
  });
});

describe('the manifest', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest').toString('utf8'));

  /** Width and height from a PNG's IHDR chunk. */
  function pngSize(path: string): [number, number] {
    const png = read(`public${path}`);
    return [png.readUInt32BE(16), png.readUInt32BE(20)];
  }

  it('opens the installed app on the analysis page, in the dark theme', () => {
    expect(manifest).toMatchObject({
      lang: 'fr',
      start_url: '/analyser',
      scope: '/',
      display: 'standalone',
      background_color: '#0a0a0b',
      theme_color: '#0a0a0b',
    });
    expect(read('index.html').toString('utf8')).toContain('<meta name="theme-color" content="#0a0a0b" />');
  });

  it('ships a 192 and a 512 icon, and a maskable one, at their declared sizes', () => {
    const icons = manifest.icons as Array<{ src: string; sizes: string; purpose: string }>;
    expect(icons.map((i) => [i.sizes, i.purpose])).toEqual([
      ['192x192', 'any'],
      ['512x512', 'any'],
      ['512x512', 'maskable'],
    ]);
    for (const icon of icons) expect(pngSize(icon.src).join('x')).toBe(icon.sizes);
    expect(pngSize('/icons/apple-touch-icon.png')).toEqual([180, 180]);
  });

  it('receives a share on the analysis page, screenshots and PDF included, by a POST the worker keeps on the device', () => {
    expect(manifest.share_target).toEqual({
      action: '/analyser',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: { title: 'title', text: 'text', url: 'url', files: [{ name: 'captures', accept: ['image/*', 'application/pdf', '.pdf'] }] },
    });
  });

  it('is announced to Android and iOS', () => {
    const html = read('index.html').toString('utf8');
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Squiggle" />');
  });
});
