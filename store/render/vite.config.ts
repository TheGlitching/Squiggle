import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * The store assets' render server (`scripts/build-store-assets.mjs`). It serves
 * the extension's real panel and content-script overlay beside the site's
 * drawings, so the listing images are rendered from the code they show.
 */
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  define: {
    __TARGET__: JSON.stringify('chrome'),
    __HOSTED_ORIGIN__: JSON.stringify('https://squiggle.fr'),
  },
  resolve: {
    alias: {
      '@squiggle/shared': resolve(__dirname, '../../shared/src'),
      '@': resolve(__dirname, '../../src'),
    },
  },
  server: { fs: { allow: [resolve(__dirname, '../..')] } },
  logLevel: 'warn',
});
