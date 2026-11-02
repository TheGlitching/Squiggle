import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

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
 * The readers that work on the device, served from our own origin rather than
 * a CDN, and copied beside the build rather than bundled, so the service
 * worker's shell never carries their megabytes: they load on a first use only.
 *
 * Under `/ocr/`, the OCR that reads imported screenshots (`src/captures.ts`):
 * Tesseract's worker, its WebAssembly core in the three builds a browser may
 * pick (LSTM only, with SIMD, with relaxed SIMD), and the French model. Under
 * `/pdf/`, pdf.js, which reads an imported PDF (`src/pdf.ts`), its worker, and
 * the decoders of the images a scanned PDF is made of: its legacy build, which
 * an older phone's browser runs too (the modern one needs a Chrome from 2024),
 * with our own `pdf/compat.mjs` for what even that build takes for granted.
 */
const ON_DEVICE_FILES: Record<string, Record<string, string>> = {
  ocr: {
    'worker.min.js': 'tesseract.js/dist/worker.min.js',
    'tesseract-core-lstm.wasm.js': 'tesseract.js-core/tesseract-core-lstm.wasm.js',
    'tesseract-core-simd-lstm.wasm.js': 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
    'tesseract-core-relaxedsimd-lstm.wasm.js': 'tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js',
    'fra.traineddata.gz': '@tesseract.js-data/fra/4.0.0_best_int/fra.traineddata.gz',
  },
  pdf: {
    'pdf.min.mjs': 'pdfjs-dist/legacy/build/pdf.min.mjs',
    'pdf.worker.min.mjs': 'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
    'compat.mjs': './pdf/compat.mjs',
    'worker.mjs': './pdf/worker.mjs',
    'wasm/openjpeg.wasm': 'pdfjs-dist/wasm/openjpeg.wasm',
    'wasm/jbig2.wasm': 'pdfjs-dist/wasm/jbig2.wasm',
    'wasm/qcms_bg.wasm': 'pdfjs-dist/wasm/qcms_bg.wasm',
  },
};

const CONTENT_TYPES: Record<string, string> = {
  js: 'text/javascript',
  mjs: 'text/javascript',
  wasm: 'application/wasm',
  gz: 'application/gzip',
};

function onDevice(): Plugin {
  // A package's file, or one of ours (`./`, beside this config).
  const source = (dir: string, name: string) => {
    const file = ON_DEVICE_FILES[dir][name];
    return file.startsWith('./') ? new URL(file, import.meta.url).pathname : createRequire(import.meta.url).resolve(file);
  };
  return {
    name: 'squiggle-on-device',
    configureServer(server) {
      for (const dir of Object.keys(ON_DEVICE_FILES)) {
        server.middlewares.use(`/${dir}`, (request, response, next) => {
          const name = request.url?.split('?')[0].slice(1) ?? '';
          if (!Object.hasOwn(ON_DEVICE_FILES[dir], name)) return next();
          response.setHeader('content-type', CONTENT_TYPES[name.split('.').pop()!]);
          response.end(readFileSync(source(dir, name)));
        });
      }
    },
    writeBundle(options) {
      for (const [dir, files] of Object.entries(ON_DEVICE_FILES)) {
        for (const name of Object.keys(files)) {
          const target = `${options.dir}/${dir}/${name}`;
          mkdirSync(dirname(target), { recursive: true });
          copyFileSync(source(dir, name), target);
        }
      }
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

/**
 * What every build of the app is given. The blog's drafts (`src/blog.ts`) are never in
 * it: only the dev server shows them, to read one as it will look.
 */
const BUILD_DEFINE = { ...SHORTCUT_DEFINE, __BLOG_DRAFTS__: 'false' };

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
 * The pages whose first screen, on a phone or a computer, sets text in Newsreader. Every
 * other page leaves it out of its first paint (see `firstPaintReady`).
 */
const serifInFirstScreen = (path: string) =>
  path === '/transparence' ||
  path === '/enseignants/fiche-activite' ||
  path === '/enseignants/grille-lecture' ||
  path === '/enseignants/exercices' ||
  path.startsWith('/glossaire/');

/**
 * Lets a page paint from its HTML alone. The stylesheet is written into the page
 * rather than linked: on a slow phone connection its own request held the first paint
 * back by seconds. The faces of the page's first screen are preloaded: Bricolage
 * Grotesque, which sets every page's largest text, and Newsreader where the first
 * screen sets text in it. Elsewhere Newsreader is only declared once the page has
 * painted, so its two files do not take a slow connection's bandwidth from the first
 * screen; until then its text is set in a face of the same size (`index.css`). The
 * app's script, too, is only fetched once the page has painted: the page is already
 * there in the HTML. So is Cloudflare Web Analytics' script, when the build is given
 * the site's token (`SQUIGGLE_WEB_ANALYTICS_TOKEN`, see docs/DEPLOYING.md). The
 * stylesheet file is still emitted, and the service worker keeps it in the installed
 * app's shell.
 *
 * "Painted" is the browser's first-contentful-paint entry, which is stamped when the
 * frame reaches the screen. An animation frame is not enough: on a slow phone it runs
 * a second before that frame is shown, and whatever it fetches then is counted by
 * PageSpeed as holding the first paint back. A page with nothing to paint (an emptied
 * stale copy, see `STALE_PAGE_GUARD`) starts at once, and a page whose paint is never
 * reported starts after four seconds anyway.
 */
function firstPaintReady(
  html: string,
  read: (file: string) => string,
): ((serifFirst: boolean) => string) | { error: string } {
  const link = /<link rel="stylesheet" crossorigin href="\/(assets\/[^"]+\.css)">/.exec(html);
  if (!link) return { error: 'index.html no longer links the one stylesheet this plugin inlines' };
  const scripts = [...html.matchAll(/<script type="module" crossorigin src="(\/assets\/[^"]+\.js)"><\/script>/g)];
  if (scripts.length !== 1 || html.includes('modulepreload')) {
    return { error: 'index.html no longer has the one module script, and no other, that this plugin loads after the first paint' };
  }
  const css = read(link[1]);
  const fileOf = (rule: string) => /url\((\/assets\/[^)]+\.woff2)\)/.exec(rule)?.[1];
  const sans = css.match(/@font-face\{font-family:Bricolage Grotesque;[^}]*\}/g) ?? [];
  const serif = css.match(/@font-face\{font-family:Newsreader;[^}]*\}/g) ?? [];
  if (sans.length !== 1 || serif.length !== 2 || ![...sans, ...serif].every(fileOf)) {
    return { error: 'the stylesheet no longer has the one Bricolage Grotesque face and two Newsreader faces this plugin loads' };
  }
  const withoutSerif = serif.reduce((rest, rule) => rest.replace(rule, ''), css);
  const preload = (rules: string[]) =>
    rules.map((rule) => `<link rel="preload" as="font" type="font/woff2" crossorigin href="${fileOf(rule)}">`).join('\n    ');
  const [script, src] = scripts[0];
  const token = process.env.SQUIGGLE_WEB_ANALYTICS_TOKEN;
  const beacon = token
    ? `const beacon = document.createElement('script'); beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js'; beacon.dataset.cfBeacon = ${JSON.stringify(JSON.stringify({ token }))}; document.body.append(beacon); `
    : '';
  const after = (serifFirst: boolean) => {
    const declare = serifFirst
      ? ''
      : `const faces = document.createElement('style'); faces.textContent = ${JSON.stringify(serif.join(''))}; document.head.append(faces); `;
    const start = `let started = false; const start = () => { if (started) return; started = true; ${declare}${beacon}import('${src}'); };`;
    const onPaint =
      "new PerformanceObserver((list) => { if (list.getEntriesByName('first-contentful-paint').length) setTimeout(start); }).observe({ type: 'paint', buffered: true }); " +
      "addEventListener('DOMContentLoaded', () => { if (!document.getElementById('root').textContent.trim()) start(); }); setTimeout(start, 4000);";
    return `<script>{ ${start} if (window.PerformanceObserver?.supportedEntryTypes?.includes('paint')) { ${onPaint} } else requestAnimationFrame(() => setTimeout(start)); }</script>`;
  };
  return (serifFirst) =>
    html
      .replace(script, () => after(serifFirst))
      .replace(
        link[0],
        () => `${preload(serifFirst ? [...sans, ...serif] : sans)}\n    <style>${serifFirst ? css : withoutSerif}</style>`,
      );
}

/**
 * What the site's pages may load, for `_headers`. Every script is our own, but for
 * Cloudflare Web Analytics' beacon, and every inline one is allowed by its hash: the
 * build writes them (the first-paint loader, the stale-page guard, `index.html`'s two)
 * and no reader's text ever becomes one. pdf.js and the OCR compile WebAssembly, and
 * the OCR starts its worker from a blob. Styles stay inline-able: the page's stylesheet
 * is written into it, and a rendered element carries its severity tint as a `style`.
 * The API is this origin; Stripe and Google sign-in are pages the reader is sent to,
 * not resources a page loads.
 */
function contentSecurityPolicy(pages: readonly string[]): string {
  const inline = new Set(pages.flatMap((html) => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1])));
  const hashes = [...inline].map((script) => `'sha256-${createHash('sha256').update(script).digest('base64')}'`);
  return [
    "default-src 'self'",
    `script-src 'self' 'wasm-unsafe-eval' https://static.cloudflareinsights.com ${hashes.sort().join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "connect-src 'self' https://cloudflareinsights.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * The date of the last commit touching any of `files` (relative to `web/`), or nothing
 * when the history is not there to say it: outside a git checkout, or a file not yet
 * committed. A shallow clone dates every page to its one commit, which only CI builds.
 */
function lastCommitDate(files: string[] | undefined): string | undefined {
  if (!files) return undefined;
  try {
    const date = execFileSync('git', ['log', '-1', '--format=%cs', '--', ...files], {
      cwd: new URL('.', import.meta.url).pathname,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Writes every public page (`src/seo.ts`) as its own HTML file, with its own head and
 * its content rendered in, and `sitemap.xml` beside them. A crawler or a link preview
 * reads only the HTML and never runs the app. The browser then hydrates it
 * (`src/main.tsx`), so a page's first render must match the build's: what depends on
 * the reader's device (the user agent) is read after it, never during it. The pages
 * whose first render is the reader's own (`rendersReaderState` in `src/App.tsx`) are
 * rendered afresh instead.
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
      const built = readFileSync(dist('index.html'), 'utf8');
      if (!built.includes('<!--page-head-->') || !built.includes('<div id="root"></div>')) {
        this.error('index.html no longer has the <!--page-head--> and empty #root this plugin fills in');
      }
      const template = firstPaintReady(built, (file) => readFileSync(dist(file), 'utf8'));
      if (typeof template !== 'function') this.error(template.error);
      const server = await createServer({
        configFile: false,
        root: new URL('.', import.meta.url).pathname,
        plugins: [favori()],
        define: BUILD_DEFINE,
        logLevel: 'error',
        server: { middlewareMode: true, hmr: false, ws: false },
        appType: 'custom',
      });
      try {
        const { APP_PATHS, BLOG_OPEN, FEED_PATH, NOTIONS, NOT_FOUND_TITLE, PUBLIC_PAGES, SOCIAL_SOURCES, appHeadFor, feed, headFor, pageSources, posterPath, redirects, reelPath, reelSource, reelText, render, shareImage, shareImagePath, sitemap, socialPath, socialSlides, socialStory, spokenPath, spokenSource, storyPath, titleFor } =
          (await server.ssrLoadModule('/src/prerender.tsx')) as Entry;
        const pages: string[] = [];
        const write = (file: string, content: string | Buffer) => {
          if (file.endsWith('.html')) pages.push(content.toString());
          // `/classe/mode-emploi` lives in `classe/`, beside `classe.html`.
          mkdirSync(new URL('.', dist(file)), { recursive: true });
          writeFileSync(dist(file), content);
        };
        const page = (head: string, root: string, path?: string) =>
          template(path !== undefined && serifInFirstScreen(path))
            .replace('<!--page-head-->', head)
            .replace('<div id="root"></div>', root);
        const rendered = (path: string) =>
          `<div id="root" data-path="${path}">${render(path)}</div>\n    ${STALE_PAGE_GUARD}`;

        for (const item of PUBLIC_PAGES) {
          write(pageFile(item.path), page(headFor(item), rendered(item.path), item.path));
          if (item.share) write(shareImagePath(item).slice(1), await shareImage(item));
        }
        // The social carousels, fetched by their address when a post is scheduled; `slides.json` gives each image its text.
        for (const source of SOCIAL_SOURCES) {
          const dir = socialPath(source).slice(1);
          const slides = await socialSlides(source);
          slides.forEach((slide, index) => write(`${dir}/${index + 1}.png`, slide.png));
          write(`${dir}/slides.json`, JSON.stringify(slides.map((slide, index) => ({ image: `/${dir}/${index + 1}.png`, alt: slide.alt })), null, 2));
          // The story that goes with a post on Instagram and Facebook, and its text.
          const story = await socialStory(source);
          write(storyPath(source).slice(1), story.png);
          write(`${dir}/story.json`, JSON.stringify({ image: storyPath(source), alt: story.alt }, null, 2));
        }
        // A notion's short video, rendered once and committed (`reels.mjs`), published while
        // the glossary still says what it shows, and its spoken version while it also says
        // what it is meant to; `video.json` gives them their text.
        for (const notion of NOTIONS) {
          const meta = new URL(`./reels/${notion.slug}.json`, import.meta.url);
          if (!existsSync(meta)) continue;
          if ((JSON.parse(readFileSync(meta, 'utf8')) as { source: string }).source !== reelSource(notion)) {
            this.warn(`reels/${notion.slug}.mp4 shows older words than the glossary's, so it is not published: npm run reels -w @squiggle/web`);
            continue;
          }
          write(reelPath(notion).slice(1), readFileSync(new URL(`./reels/${notion.slug}.mp4`, import.meta.url)));
          write(posterPath(notion).slice(1), readFileSync(new URL(`./reels/${notion.slug}.jpg`, import.meta.url)));
          const spoken = new URL(`./reels/${notion.slug}.voix.json`, import.meta.url);
          const voiced = existsSync(spoken) && (JSON.parse(readFileSync(spoken, 'utf8')) as { source: string }).source === spokenSource(notion);
          if (voiced) write(spokenPath(notion).slice(1), readFileSync(new URL(`./reels/${notion.slug}.voix.mp4`, import.meta.url)));
          else this.warn(`reels/${notion.slug}.voix.mp4 is missing or out of date, so only the silent video is published: npm run reels -w @squiggle/web`);
          write(
            `${socialPath(notion).slice(1)}/video.json`,
            JSON.stringify({ video: reelPath(notion), poster: posterPath(notion), alt: reelText(notion), ...(voiced ? { voix: spokenPath(notion) } : {}) }, null, 2),
          );
        }
        // The pricing anchor is the home page, under its own address.
        write(pageFile('/tarifs'), page(headFor(PUBLIC_PAGES[0]), rendered('/tarifs')));
        // The app's own pages render in the browser, from an empty root, as they always have.
        for (const path of APP_PATHS) write(pageFile(path), page(appHeadFor(titleFor(path)), '<div id="root"></div>'));
        // Every other address: Cloudflare answers it with this page and a 404 status
        // (`not_found_handling` in server/wrangler.jsonc), so a mistyped link is not the home page.
        write('404.html', page(appHeadFor(NOT_FOUND_TITLE), `<div id="root">${render('/404')}</div>`));
        // A blog article carries its own date; every other page, its source files' last commit.
        const dated = PUBLIC_PAGES.map((item) => (item.lastmod ? item : { ...item, lastmod: lastCommitDate(pageSources(item.path)) }));
        writeFileSync(dist('sitemap.xml'), sitemap(dated));
        writeFileSync(dist('_redirects'), redirects());
        if (BLOG_OPEN) write(FEED_PATH.slice(1), feed());
        const headers = readFileSync(dist('_headers'), 'utf8');
        if (!headers.includes('__CONTENT_SECURITY_POLICY__')) this.error('_headers no longer has the content policy this plugin fills in');
        writeFileSync(dist('_headers'), headers.replace('__CONTENT_SECURITY_POLICY__', contentSecurityPolicy(pages)));
      } finally {
        await server.close();
      }
    },
  };
}

export default defineConfig(({ command, mode }) => ({
  plugins: [react(), favori(), serviceWorker(), prerender(), onDevice()],
  define: { ...BUILD_DEFINE, __BLOG_DRAFTS__: JSON.stringify(command === 'serve' && mode === 'development') },
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
}));
