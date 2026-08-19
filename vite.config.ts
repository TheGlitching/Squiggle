import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import { resolve } from 'path';
import manifestChrome from './src/manifest.chrome.json';
import manifestFirefox from './src/manifest.firefox.json';
import pkg from './package.json';

const target = process.env.TARGET || 'chrome';

// The version a store sees comes from package.json alone. It used to be typed
// into three files, which a release cannot rely on: the stores reject a re-upload
// of a version already published, so one stale copy blocks the release, and two
// copies that disagree ship a Chrome build and a Firefox build claiming to be
// different versions of the same thing.
const manifest = {
  ...(target === 'firefox' ? manifestFirefox : manifestChrome),
  version: pkg.version,
};

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
  ],
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
