/**
 * The installed app's service worker: the app shell, and nothing else.
 *
 * It answers two kinds of request: a page navigation, with the app's one
 * index.html (fresh from the network, or from its cache when offline), and the
 * files of the build listed in SHELL, from its cache. Every other request goes
 * to the network untouched and nothing it returns is stored: an account, a
 * report or an analysis stage is the server's to answer, every time, and never
 * one reader's copy on a shared device.
 *
 * `vite.config.ts` writes VERSION and SHELL in at build time. A new build is a
 * new VERSION, so the browser installs this worker again and drops the old
 * shell. Nothing registers it outside a production build.
 */
const VERSION = 'dev';
const SHELL = [];
const CACHE = `squiggle-shell-${VERSION}`;

/** The paths the Worker answers (`assets.run_worker_first` in server/wrangler.jsonc). */
const SERVER_PATHS = ['/health', '/auth/*', '/v1/*', '/web/*', '/webhooks/*', '/admin/*'];

function toServer(pathname) {
  return SERVER_PATHS.some((p) => (p.endsWith('/*') ? pathname.startsWith(p.slice(0, -1)) : pathname === p));
}

function fromShell(path) {
  return caches.open(CACHE).then((cache) => cache.match(path));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL.map((path) => new Request(path, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith('squiggle-shell-') && key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || toServer(url.pathname)) return;

  if (request.mode === 'navigate') {
    // Always `/`, never the page's own address: a shared article arrives in
    // the query string ("Partager vers Squiggle"), and this way the shared
    // text never leaves the device. Fresh first, so a deploy shows at once.
    event.respondWith(fetch('/').catch(() => fromShell('/')));
    return;
  }

  if (SHELL.includes(url.pathname)) {
    event.respondWith(fromShell(url.pathname).then((hit) => hit || fetch(request)));
  }
});
