/**
 * The installed app's service worker: the app shell, and the share sheet.
 *
 * It answers three kinds of request: a page navigation, with the app's one
 * index.html (fresh from the network, or from its cache when offline), the
 * files of the build listed in SHELL, from its cache, and a "Partager vers
 * Squiggle" (manifest.webmanifest, `share_target`), which it keeps on the
 * device. Every other request goes to the network untouched and nothing it
 * returns is stored: an account, a report or an analysis stage is the
 * server's to answer, every time, and never one reader's copy on a shared
 * device.
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

/** Where the share sheet posts (`share_target.action`), and where shared files wait for the page. */
const SHARE_PATH = '/analyser';
const SHARE_CACHE = 'squiggle-partage';

/**
 * A share, read here and never sent on: the screenshots or the PDF, or a
 * recording, wait in SHARE_CACHE for the page to take them
 * (`takeSharedCaptures` in src/captures.ts, `takeSharedMedia` in
 * src/media.ts), and the
 * title, text and address go into the query string of the page it opens, as a
 * share by GET did, which the navigation below answers with the bare shell.
 */
async function receiveShare(request) {
  const form = await request.formData();
  const params = new URLSearchParams();
  for (const name of ['title', 'text', 'url']) {
    const value = form.get(name);
    if (typeof value === 'string' && value.trim()) params.set(name, value);
  }
  const files = form
    .getAll('captures')
    .filter(
      (file) =>
        typeof file !== 'string' &&
        (file.type.startsWith('image/') || file.type === 'application/pdf' || /\.pdf$/i.test(file.name)),
    );
  // A recording to transcribe (`takeSharedMedia` in src/media.ts): one file, alone.
  const media = form
    .getAll('media')
    .find((file) => typeof file !== 'string' && (file.type.startsWith('audio/') || file.type.startsWith('video/')));
  await caches.delete(SHARE_CACHE);
  if (media) {
    const cache = await caches.open(SHARE_CACHE);
    await cache.put('/partage/media', new Response(media, { headers: { 'content-type': media.type } }));
    params.set('media', '1');
  } else if (files.length) {
    const cache = await caches.open(SHARE_CACHE);
    await Promise.all(
      files.map((file, index) =>
        cache.put(`/partage/${index}`, new Response(file, { headers: { 'content-type': file.type || 'application/pdf' } })),
      ),
    );
    params.set('captures', String(files.length));
  }
  const query = params.toString();
  return Response.redirect(new URL(query ? `${SHARE_PATH}?${query}` : SHARE_PATH, self.location.origin).href, 303);
}

/**
 * A file the site serves as it is (sitemap.xml, robots.txt, /.well-known/…,
 * an image): opened as a page, it is still that file, never the app, which
 * has no route for it and would show its 404. The app's own addresses have no
 * extension.
 */
function isFile(pathname) {
  return pathname.startsWith('/.well-known/') || /\.[^/]+$/.test(pathname);
}

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
  const url = new URL(request.url);
  if (request.method === 'POST' && url.origin === self.location.origin && url.pathname === SHARE_PATH) {
    event.respondWith(receiveShare(request));
    return;
  }
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin || toServer(url.pathname)) return;

  if (request.mode === 'navigate' && !isFile(url.pathname)) {
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
