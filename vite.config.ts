import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import manifestChrome from './src/manifest.chrome.json';
import manifestFirefox from './src/manifest.firefox.json';
import pkg from './package.json';
import { crx, type ManifestV3Export } from '@crxjs/vite-plugin';

const target = process.env.TARGET || 'chrome';

// The version a store sees comes from package.json alone. It used to be typed
// into three files, which a release cannot rely on: the stores reject a re-upload
// of a version already published, so one stale copy blocks the release, and two
// copies that disagree ship a Chrome build and a Firefox build claiming to be
// different versions of the same thing.
// The cast narrows the JSON-imported manifest to crxjs's own type: importing a
// .json widens `data_collection_permissions.required` to string[] where crxjs
// declares a literal union, so the assignment alone cannot typecheck.
const manifest = {
  ...(target === 'firefox' ? manifestFirefox : manifestChrome),
  version: pkg.version,
} as unknown as ManifestV3Export;

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
  ],
  // Compile-time target constant so the Firefox build can dead-code-eliminate
  // Chrome-only API calls (chrome.sidePanel) that AMO's linter would otherwise
  // flag even inside a runtime `typeof chrome` guard.
  define: {
    __TARGET__: JSON.stringify(target),
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    emptyOutDir: true,
    outDir: target === 'firefox' ? 'dist/firefox' : 'dist/chrome',
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'src/sidepanel/index.html'),
        welcome: resolve(__dirname, 'src/welcome/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/tree/**'],
  },
});