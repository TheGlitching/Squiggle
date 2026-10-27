import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { createServer } from 'vite';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** The files of `public/` the installed app needs offline, besides the build itself. */
const PUBLIC_SHELL = [
  '/manifest.webmanifest',
  '/favicon.svg',
  '/favicon-32.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
];

/**
 * Emits `sw.js` from `sw.js` at the workspace root, with this build's file list
 * and a version that changes whenever any of those files does, so a deploy
 * always replaces the installed app's shell.
 */
function serviceWorker(): Plugin {
  return {
    name: 'squiggle-service-worker',
    apply: 'build',
    // After Vite's own HTML plugin, so `index.html` is already in the bundle.
    enforce: 'post',
    generateBundle(_options, bundle) {
      const hash = createHash('sha256');
      const built: string[] = [];
      for (const name of Object.keys(bundle).sort()) {
        if (name.endsWith('.map')) continue;
        const item = bundle[name];
        hash.update(name).update(item.type === 'chunk' ? item.code : item.source);
        built.push(name === 'index.html' ? '/' : `/${name}`);
      }
      for (const path of PUBLIC_SHELL) hash.update(path).update(readFileSync(new URL(`./public${path}`, import.meta.url)));
      if (!built.includes('/')) this.error('index.html is missing from the bundle');

      const source = readFileSync(new URL('./sw.js', import.meta.url), 'utf8');
      const version = hash.digest('hex').slice(0, 16);
      const code = source
        .replace("const VERSION = 'dev';", `const VERSION = '${version}';`)
        .replace('const SHELL = [];', `const SHELL = ${JSON.stringify([...built, ...PUBLIC_SHELL])};`);
      if (code.includes("const VERSION = 'dev';") || code.includes('const SHELL = [];')) {
        this.error('sw.js no longer has the VERSION and SHELL lines this plugin fills in');
      }
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: code });
    },
  };
}

/** Where the built page lives: `/enseignants` is `enseignants.html`, which Cloudflare serves without a redirect. */
const pageFile = (path: string) => (path === '/' ? 'index.html' : `${path.slice(1)}.html`);

/**
 * Before the app loads, a page served for another address (the fallback `index.html` on
 * `/compte`, or the service worker's `/` on any page) empties itself rather than show
 * the wrong page until the app replaces it.
 */
const STALE_PAGE_GUARD =
  "<script>if (document.getElementById('root').dataset.path !== location.pathname) document.getElementById('root').replaceChildren();</script>";

/**
 * Writes every public page (`src/seo.ts`) as its own HTML file, with its own head and
 * its content rendered in, and `sitemap.xml` beside them. A crawler or a link preview
 * reads only the HTML and never runs the app. The browser then renders the app over
 * it with `createRoot`, not `hydrateRoot`: a page that reads the reader's device on
 * first render (a draft, the install hint) differs from the build's copy, and that
 * must not be an error.
 */
function prerender(): Plugin {
  type Entry = typeof import('./src/prerender');
  return {
    name: 'squiggle-prerender',
    // The dev server shows the home page's head on every page.
    transformIndexHtml: {
      order: 'pre',
      async handler(html, { server }) {
        if (!server) return html;
        const { PUBLIC_PAGES, headFor } = (await server.ssrLoadModule('/src/seo.ts')) as Entry;
        return html.replace('<!--page-head-->', headFor(PUBLIC_PAGES[0]));
      },
    },
    async closeBundle() {
      if (this.environment?.config.command !== 'build') return;
      const dist = (file: string) => new URL(`./dist/${file}`, import.meta.url);
      const template = readFileSync(dist('index.html'), 'utf8');
      if (!template.includes('<!--page-head-->') || !template.includes('<div id="root"></div>')) {
        this.error('index.html no longer has the <!--page-head--> and empty #root this plugin fills in');
      }
      const server = await createServer({
        configFile: false,
        root: new URL('.', import.meta.url).pathname,
        logLevel: 'error',
        server: { middlewareMode: true, hmr: false, ws: false },
        appType: 'custom',
      });
      try {
        const { APP_PATHS, NOT_FOUND_TITLE, PUBLIC_PAGES, appHeadFor, headFor, render, shareImage, shareImagePath, sitemap, titleFor } =
          (await server.ssrLoadModule('/src/prerender.tsx')) as Entry;
        const write = (file: string, content: string | Buffer) => {
          // `/classe/mode-emploi` lives in `classe/`, beside `classe.html`.
          mkdirSync(new URL('.', dist(file)), { recursive: true });
          writeFileSync(dist(file), content);
        };
        const page = (head: string, root: string) =>
          template.replace('<!--page-head-->', head).replace('<div id="root"></div>', root);
        const rendered = (path: string) =>
          `<div id="root" data-path="${path}">${render(path)}</div>\n    ${STALE_PAGE_GUARD}`;

        for (const item of PUBLIC_PAGES) {
          write(pageFile(item.path), page(headFor(item), rendered(item.path)));
          if (item.share) write(shareImagePath(item).slice(1), await shareImage(item));
        }
        // The pricing anchor is the home page, under its own address.
        write(pageFile('/tarifs'), page(headFor(PUBLIC_PAGES[0]), rendered('/tarifs')));
        // The app's own pages render in the browser, from an empty root, as they always have.
        for (const path of APP_PATHS) write(pageFile(path), page(appHeadFor(titleFor(path)), '<div id="root"></div>'));
        // Every other address: Cloudflare answers it with this page and a 404 status
        // (`not_found_handling` in server/wrangler.jsonc), so a mistyped link is not the home page.
        write('404.html', page(appHeadFor(NOT_FOUND_TITLE), `<div id="root">${render('/404')}</div>`));
        writeFileSync(dist('sitemap.xml'), sitemap());
      } finally {
        await server.close();
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker(), prerender()],
  // The API origin is same-origin in production. A local dev build points at
  // a local server with VITE_API_BASE_URL; it is never a secret.
  server: { port: 5174, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
