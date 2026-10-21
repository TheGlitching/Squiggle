/**
 * The dark theme's AA contract, measured with the sRGB relative-luminance
 * method. The port shipped white-on-accent (4.06:1) and the demo's darker
 * severity fills as label text (critical 3.96, info 3.70); this pins the fixed
 * pairs so a later recolour cannot quietly drop them back below AA.
 */
import { describe, expect, it } from 'vitest';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { SEVERITY_COLORS } from '../src/demo';

// The tokens are the `--color-*` declarations of the Tailwind 4 `@theme` block.
const css = readFileSync(resolve(__dirname, '../src/index.css'), 'utf8');
const colors = Object.fromEntries(
  [...css.matchAll(/--color-(\w+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1], m[2]]),
);

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function hue(hex: string): number {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

function hueGap(a: string, b: string): number {
  const d = Math.abs(hue(a) - hue(b));
  return Math.min(d, 360 - d);
}

describe('text contrast on the dark theme (AA, 4.5:1)', () => {
  const grounds = ['background', 'surface'] as const;

  it.each(grounds)('keeps body/muted/faint text readable on %s', (ground) => {
    for (const ink of ['foreground', 'muted', 'faint']) {
      expect(contrast(colors[ink], colors[ground])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('puts dark ink on the accent, not white', () => {
    expect(contrast(colors.accentForeground, colors.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.accentForeground, colors.accentHover)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the accent-tinted hover text readable on its tint', () => {
    expect(contrast(colors.accentInk, colors.accentSoft)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(grounds)('keeps accent text (the 404, the sign-in code) readable on %s', (ground) => {
    expect(contrast(colors.accent, colors[ground])).toBeGreaterThanOrEqual(4.5);
  });

  // An error and a destructive action are critical, an unconfirmed notice is a
  // warning: they wear the severity tones, not the brand's.
  it.each([
    ['criticalInk', 'criticalSoft'],
    ['warningInk', 'warningSoft'],
  ])('keeps %s readable on %s', (ink, soft) => {
    expect(contrast(colors[ink], colors[soft])).toBeGreaterThanOrEqual(4.5);
    for (const ground of grounds) {
      expect(contrast(colors[ink], colors[ground])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('labels every demo severity with a readable tone on the panel', () => {
    for (const { text } of Object.values(SEVERITY_COLORS)) {
      expect(contrast(text, colors.surface)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('non-text contrast (AA, 3:1)', () => {
  it('outlines form fields against both grounds', () => {
    for (const ground of ['background', 'surface']) {
      expect(contrast(colors.borderControl, colors[ground])).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps the focus ring visible against both grounds', () => {
    for (const ground of ['background', 'surface']) {
      expect(contrast(colors.accent, colors[ground])).toBeGreaterThanOrEqual(3);
      expect(contrast(colors.accentHover, colors[ground])).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps the logo marks visible on the accent tile', () => {
    expect(contrast('#faf9f5', colors.accent)).toBeGreaterThanOrEqual(3);
  });
});

// Colour carries exactly one meaning, severity (AGENTS.md). The brand accent is a
// hue no severity uses, and the severity tokens the pages borrow are the demo's.
describe('the brand accent is not a severity hue', () => {
  const severityTones = Object.values(SEVERITY_COLORS).flatMap(({ color, text }) => [color, text]);

  it.each(['accent', 'accentHover', 'accentInk'])('keeps %s at least 30 degrees from every severity tone', (token) => {
    for (const tone of severityTones) {
      expect(hueGap(colors[token], tone)).toBeGreaterThanOrEqual(30);
    }
  });

  it('shares the critical and warning fills with the demo, so a finding reads the same', () => {
    expect(colors.critical).toBe(SEVERITY_COLORS.critical.color);
    expect(colors.warning).toBe(SEVERITY_COLORS.warning.color);
    expect(colors.criticalInk).not.toBe(colors.accentInk);
  });
});
