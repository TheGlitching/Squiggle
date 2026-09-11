// Loaded by vite/vitest at runtime (Node context), so it may use Node builtins.
// It is intentionally NOT part of the server tsconfig "include": the worker
// source is typed against @cloudflare/workers-types (no DOM, no @types/node),
// and this config file is a build tool, not product code.
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Consume the shared package as TS source, exactly like the extension
      // does, so the request-signing protocol can never drift between the two.
      '@squiggle/shared': resolve(here, '../shared/src'),
    },
  },
  test: {
    // The auth code exercises real ECDSA via WebCrypto and must run on Node's
    // genuine crypto.subtle, not happy-dom's.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Every request writes a structured log line; printing them all buries
    // the results. A test that cares about a line spies on console.log.
    silent: true,
  },
});
