// Bundles the routine into one file Node runs without a TypeScript toolchain:
// `dist/contenu.mjs`. The VPS runs this after every `git pull`, so the routine
// always reads the glossary and the articles as they are on `main`.
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const blogDir = join(repo, 'web/src/blog');

// `src/articles.ts` reads the published articles with Vite's `import.meta.glob`,
// which is what the tests run under. esbuild has no glob, so the same list is
// written out as plain imports here: every `web/src/blog/*.ts` but the drafts.
const articles = {
  name: 'articles',
  setup(b) {
    b.onLoad({ filter: /contenu[\\/]src[\\/]articles\.ts$/ }, () => {
      const files = readdirSync(blogDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.brouillon.ts')).sort();
      const imports = files.map((f, i) => `import a${i} from ${JSON.stringify(join(blogDir, f))};`).join('\n');
      return { contents: `${imports}\nexport const ARTICLES = [${files.map((_, i) => `a${i}`).join(', ')}];\n`, loader: 'ts' };
    });
  },
};

await build({
  entryPoints: [join(here, 'src/main.ts')],
  outfile: join(here, 'dist/contenu.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  alias: { '@squiggle/shared': join(repo, 'shared') },
  plugins: [articles],
  logLevel: 'warning',
});
