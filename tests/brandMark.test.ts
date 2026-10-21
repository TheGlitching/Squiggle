/**
 * The mark exists in five places: the raster icons and the two SVGs that
 * `scripts/build-icon.py` writes, and the two inline badges the panel and the
 * website render. `web/` may not import from `src/`, so the badges are copies;
 * this is what stops one of them from drifting, and what ties every copy to the
 * accent token.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { darkTheme } from '../src/ui/tokens/colors';

const read = (path: string) => readFileSync(resolve(__dirname, '..', path), 'utf8');

/** Every drawing attribute of a mark, whether it is written as SVG or as JSX. */
function shapes(source: string) {
  const norm = source.replace(/strokeWidth/g, 'stroke-width').replace(/strokeLinecap/g, 'stroke-linecap');
  return {
    viewBox: norm.match(/viewBox="([^"]+)"/)?.[1],
    rects: [...norm.matchAll(/<rect\s+([^>]*?)\/?>/g)].map((m) =>
      [...m[1].matchAll(/(\w+)="([^"]+)"/g)].map((a) => `${a[1]}=${a[2].toLowerCase()}`).sort().join(' '),
    ),
    path: norm.match(/<path[^>]*\sd="([^"]+)"/)?.[1],
    strokeWidth: norm.match(/stroke-width="([^"]+)"/)?.[1],
  };
}

const vector = shapes(read('src/assets/icon.svg'));

describe('the Squiggle mark', () => {
  it.each([
    ['web/public/favicon.svg'],
    ['src/ui/components/SquiggleBadge.tsx'],
    ['web/src/components/Brand.tsx'],
  ])('is drawn identically in %s and in the packaged icon', (file) => {
    const copy = shapes(read(file));
    expect(copy.viewBox).toBe(vector.viewBox);
    expect(copy.rects).toEqual(vector.rects);
    expect(copy.path).toBe(vector.path);
    expect(copy.strokeWidth).toBe(vector.strokeWidth);
  });

  it('puts the accent token on the tile, in every copy and in the icon script', () => {
    const accent = darkTheme.accent.toLowerCase();
    for (const file of [
      'src/assets/icon.svg',
      'web/public/favicon.svg',
      'src/ui/components/SquiggleBadge.tsx',
      'web/src/components/Brand.tsx',
    ]) {
      expect(read(file).toLowerCase()).toContain(`fill="${accent}"`);
    }

    const [r, g, b] = read('scripts/build-icon.py').match(/^ACCENT = \((\d+), (\d+), (\d+)\)/m)!.slice(1).map(Number);
    expect('#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')).toBe(accent);
  });

  it('keeps the website tokens on the extension accent', () => {
    const css = (file: string) => read(file);
    for (const [token, value] of [
      ['--color-accent', darkTheme.accent],
      ['--color-accentHover', darkTheme.accentHover],
    ]) {
      expect(css('web/src/index.css')).toContain(`${token}: ${value};`);
    }
    expect(css('src/index.css')).toContain(`--color-accent: ${darkTheme.accent};`);
    expect(css('src/index.css')).toContain(`--color-accent-hover: ${darkTheme.accentHover};`);
    expect(css('src/index.css')).toContain(`--accent: ${darkTheme.accent};`);
  });
});
