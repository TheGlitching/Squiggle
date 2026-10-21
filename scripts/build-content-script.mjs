/**
 * Build the content script as a single self-contained classic script.
 *
 * The manifest declares no content script: the background injects this file into
 * the tab the reader asked about (`chrome.scripting.executeScript`, authorised by
 * `activeTab`). A static `<all_urls>` entry would run on every page the reader
 * opens and force broad host access onto the install, which is what the stores
 * review hardest. See docs/store-disclosure.md.
 *
 * A classic IIFE rather than a bundler chunk, because a chunk would be loaded by
 * a dynamic `import()` from inside the page: it needs to stay web-accessible,
 * costs a second fetch after injection, and fails silently when a page or a
 * browser build refuses the import. An injected IIFE has none of those modes.
 *
 * The file name is `CONTENT_SCRIPT_FILE` in src/messaging/runtime.ts.
 */
import { build } from 'esbuild';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const distDir = process.argv[2];
if (!distDir) {
  console.error('usage: build-content-script.mjs <dist-dir>');
  process.exit(1);
}

const root = resolve(import.meta.dirname, '..');
const outFile = 'content-script.js';
const manifestPath = join(distDir, 'manifest.json');

if (!existsSync(manifestPath)) {
  console.error(`build-content-script: no manifest at ${manifestPath}; run the bundler first`);
  process.exit(1);
}

// A static entry would shadow the injected file and bring back the broad access
// this build exists to avoid; refuse rather than ship it.
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.content_scripts?.length) {
  console.error(
    'build-content-script: the manifest declares content_scripts. The content script is injected on demand; remove the static entry.'
  );
  process.exit(1);
}

await build({
  entryPoints: [join(root, 'src/content/index.ts')],
  bundle: true,
  format: 'iife',
  target: ['chrome111', 'firefox109'],
  outfile: join(distDir, outFile),
  legalComments: 'none',
  logLevel: 'error',
});

console.log(`build-content-script: ${distDir}/${outFile} written`);
