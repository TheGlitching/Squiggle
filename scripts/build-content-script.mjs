/**
 * Replace the bundler's dynamic-import content-script loader with a single
 * self-contained classic script.
 *
 * The default output is a tiny loader that runs
 * `import(chrome.runtime.getURL('assets/<chunk>.js'))` inside the content script.
 * That indirection is fragile in exactly the place it cannot afford to be: it
 * needs the chunk to stay web-accessible, it resolves a second network-style
 * fetch after injection, and it fails silently when a page or a browser build
 * refuses the dynamic import - the article page then looks like it has no
 * content script at all, and analysis fails with no way for the user to tell
 * why.
 *
 * A classic IIFE has none of those failure modes: whatever injects it, runs it.
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
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

await build({
  entryPoints: [join(root, 'src/content/index.ts')],
  bundle: true,
  format: 'iife',
  target: ['chrome111', 'firefox109'],
  outfile: join(distDir, outFile),
  legalComments: 'none',
  logLevel: 'error',
});

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const entries = manifest.content_scripts;
if (!Array.isArray(entries) || entries.length !== 1) {
  console.error(
    `build-content-script: expected exactly one content_scripts entry, found ${entries?.length ?? 0}. ` +
      'Refusing to guess which one to rewrite.'
  );
  process.exit(1);
}

const replaced = entries[0].js ?? [];
entries[0].js = [outFile];

// The loader and the chunk it imported are now unreachable. Drop them, but only
// after proving nothing else in the bundle references the chunk - sharing a
// chunk with another entry point is legitimate, and deleting it would break that
// entry instead.
const stale = [];
for (const rel of replaced) {
  const loaderPath = join(distDir, rel);
  if (!existsSync(loaderPath)) continue;
  const chunks = [...readFileSync(loaderPath, 'utf8').matchAll(/getURL\(\s*["']([^"']+)["']/g)].map(m => m[1]);
  stale.push(rel);
  for (const chunk of chunks) {
    // The manifest is excluded deliberately: its reference to this chunk is the
    // one being rewritten, so counting it would always report the chunk as live.
    const others = collectFiles(distDir).filter(
      f => f !== loaderPath && f !== join(distDir, chunk) && f !== manifestPath
    );
    const referenced = others.some(f => safeRead(f).includes(chunk.split('/').pop()));
    if (!referenced) stale.push(chunk);
  }
}

for (const rel of stale) {
  rmSync(join(distDir, rel), { force: true });
}

const staleSet = new Set(stale);
if (Array.isArray(manifest.web_accessible_resources)) {
  for (const group of manifest.web_accessible_resources) {
    if (Array.isArray(group.resources)) {
      group.resources = group.resources.filter(r => !staleSet.has(r));
    }
  }
  manifest.web_accessible_resources = manifest.web_accessible_resources.filter(
    g => Array.isArray(g.resources) && g.resources.length > 0
  );
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(
  `build-content-script: ${distDir}/${outFile} is now the content script` +
    (stale.length ? ` (removed ${stale.join(', ')})` : '')
);

function collectFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(p));
    else out.push(p);
  }
  return out;
}

function safeRead(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}
