import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { build as esbuild } from 'esbuild';
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

/** Written into the bookmark by /favori: the origin of the site that gave it. */
const FAVORI_ORIGIN = '__SQUIGGLE_ORIGIN__';

/**
 * `virtual:favori`: the bookmark "Analyser avec Squiggle" (`src/favori/favori.ts`)
 * as one `javascript:` address, bundled with the extractor it reads the page with.
 * Every character is percent-encoded, so the address survives a bookmark editor.
 */
function favori(): Plugin {
  const id = 'virtual:favori';
  return {
    name: 'squiggle-favori',
    resolveId: (source) => (source === id ? `\0${id}` : null),
    async load(resolved) {
      if (resolved !== `\0${id}`) return null;
      const result = await esbuild({
        entryPoints: [new URL('./src/favori/favori.ts', import.meta.url).pathname],
        bundle: true,
        minify: true,
        format: 'iife',
        target: ['chrome100', 'safari15'],
        define: { SQUIGGLE_ORIGIN: JSON.stringify(FAVORI_ORIGIN) },
        legalComments: 'none',
        metafile: true,
        write: false,
      });
      for (const input of Object.keys(result.metafile.inputs)) this.addWatchFile(resolve(input));
      const code = result.outputFiles[0].text.trim();
      return `export const BOOKMARKLET = ${JSON.stringify(`javascript:${encodeURIComponent(code)}`)};\nexport const FAVORI_ORIGIN = ${JSON.stringify(FAVORI_ORIGIN)};`;
    },
  };
}

/**
 * The OCR that reads imported screenshots (`src/captures.ts`), served from our
 * own origin under `/ocr/`: Tesseract's worker, its WebAssembly core in the
 * three builds a browser may pick (LSTM only, with SIMD, with relaxed SIMD),
 * and the French model. Left to its defaults it would fetch them from a CDN.
 * They are copied beside the build, not bundled, so the service worker's
 * shell never carries their dozen megabytes: they load on a first import only.
 */
const OCR_FILES: Record<string, string> = {
  'worker.min.js': 'tesseract.js/dist/worker.min.js',
  'tesseract-core-lstm.wasm.js': 'tesseract.js-core/tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js': 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js': 'tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js',
  'fra.traineddata.gz': '@tesseract.js-data/fra/4.0.0_best_int/fra.traineddata.gz',
};

function ocr(): Plugin {
  const source = (name: string) => createRequire(import.meta.url).resolve(OCR_FILES[name]);
  return {
    name: 'squiggle-ocr',
    configureServer(server) {
      server.middlewares.use('/ocr', (request, response, next) => {
        const name = request.url?.split('?')[0].slice(1) ?? '';
        if (!Object.hasOwn(OCR_FILES, name)) return next();
        response.setHeader('content-type', name.endsWith('.js') ? 'text/javascript' : 'application/gzip');
        response.end(readFileSync(source(name)));
      });
    },
    writeBundle(options) {
      const dir = `${options.dir}/ocr`;
      mkdirSync(dir, { recursive: true });
      for (const name of Object.keys(OCR_FILES)) copyFileSync(source(name), `${dir}/${name}`);
    },
  };
}

/**
 * Whether the signed iPhone shortcut (`shortcut/build.mjs`) is in `public/`. Only a Mac
 * signed into an Apple account can sign it; until it is committed, nothing links to it.
 */
const SHORTCUT_DEFINE = {
  __SHORTCUT_PUBLISHED__: JSON.stringify(existsSync(new URL('./public/raccourci/Analyser avec Squiggle.shortcut', import.meta.url))),
};

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
        plugins: [favori()],
        define: SHORTCUT_DEFINE,
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
  plugins: [react(), favori(), serviceWorker(), prerender(), ocr()],
  define: SHORTCUT_DEFINE,
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
