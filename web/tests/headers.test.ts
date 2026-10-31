/**
 * The headers Cloudflare sends with every page (`_headers`), as the build writes them:
 * the content policy must allow each inline script the build put in a page, or that
 * page stops loading its app. Reads web/dist, so build the web app first.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, it } from 'vitest';

const DIST = join(__dirname, '../dist');
const headers = readFileSync(join(DIST, '_headers'), 'utf8');
const policy = headers.match(/^ {2}Content-Security-Policy: (.+)$/m)?.[1] ?? '';
const directive = (name: string) => policy.split('; ').find((item) => item.startsWith(`${name} `))?.split(' ').slice(1);

it('sends the security headers with every page', () => {
  const block = headers.slice(headers.indexOf('\n/*\n'));
  expect(block).toContain('  X-Content-Type-Options: nosniff\n');
  expect(block).toContain('  Referrer-Policy: strict-origin-when-cross-origin\n');
  expect(block).toContain('  X-Frame-Options: DENY\n');
  expect(directive('frame-ancestors')).toEqual(["'none'"]);
  expect(directive('object-src')).toEqual(["'none'"]);
  expect(directive('script-src')).not.toContain("'unsafe-inline'");
});

it('allows every inline script the build wrote, by its hash', () => {
  const pages = readdirSync(DIST, { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.html'));
  expect(pages.length).toBeGreaterThan(30);
  for (const file of pages) {
    const html = readFileSync(join(DIST, file), 'utf8');
    // A script with a type of its own is data (JSON-LD), and with a source it is our own file.
    for (const script of html.matchAll(/<script(?![^>]*\b(?:type="application\/ld\+json"|src=))[^>]*>([\s\S]*?)<\/script>/g)) {
      const hash = `'sha256-${createHash('sha256').update(script[1]).digest('base64')}'`;
      expect(directive('script-src'), file).toContain(hash);
    }
  }
});
