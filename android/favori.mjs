/**
 * The bookmark "Analyser avec Squiggle" (`web/src/favori/favori.ts`) as the
 * script the app runs in a shared article's page: the same bundle /favori
 * hands out (`favori()` in `web/vite.config.ts`), pointed at squiggle.fr.
 * Run by the `favori` Gradle task; needs the repository's `npm ci`.
 */
import { build } from 'esbuild';

await build({
  entryPoints: [new URL('../web/src/favori/favori.ts', import.meta.url).pathname],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['chrome100'],
  define: { SQUIGGLE_ORIGIN: JSON.stringify('https://squiggle.fr') },
  legalComments: 'none',
  outfile: process.argv[2],
});
