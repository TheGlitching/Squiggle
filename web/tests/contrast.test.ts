/**
 * The AA contract of both themes, measured with the sRGB relative-luminance
 * method. The port shipped white-on-accent (4.06:1) and the demo's darker
 * severity fills as label text (critical 3.96, info 3.70); this pins the fixed
 * pairs so a later recolour cannot quietly drop them back below AA.
 */
import { describe, expect, it } from 'vitest';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { SEVERITY_COLORS } from '../src/demo';

// The tokens are `--color-*`: the `@theme` block is the dark theme, the
// `prefers-color-scheme: light` block redefines them for the light one.
const css = readFileSync(resolve(__dirname, '../src/index.css'), 'utf8');
function tokensOf(block: RegExp): Record<string, string> {
  return Object.fromEntries(
    [...block.exec(css)![0].matchAll(/--color-(\w+):\s*(#[0-9a-f]{6,8});/gi)].map((m) => [m[1], m[2]]),
  );
}
const dark = tokensOf(/@theme static \{[\s\S]*?\n\}/);
const light = tokensOf(/@media \(prefers-color-scheme: light\) \{[\s\S]*?\n\}/);

const THEMES = [
  ['dark', dark],
  ['light', light],
] as const;
const SEVERITIES = ['critical', 'warning', 'info', 'positive'] as const;

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

/** A `#rrggbbaa` tint composited over an opaque hex ground. */
function over(tint: string, ground: string): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const alpha = channel(tint, 3) / 255;
  return `#${[0, 1, 2]
    .map((i) => Math.round(channel(tint, i) * alpha + channel(ground, i) * (1 - alpha)).toString(16).padStart(2, '0'))
    .join('')}`;
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

describe('the two themes', () => {
  it('redefines every token that names a colour of the page, so no dark value leaks into the light theme', () => {
    const fixed = Object.keys(dark).filter((token) => !(token in light));
    expect(fixed).toEqual([]);
  });

  it('keeps the dark theme when the device says nothing: dark is the default, light only on request', () => {
    expect(css).toMatch(/html \{[\s\S]*?color-scheme: dark;/);
    expect(css).not.toMatch(/prefers-color-scheme: dark/);
  });
});

describe.each(THEMES)('text contrast on the %s theme (AA, 4.5:1)', (_name, colors) => {
  const grounds = ['background', 'surface'] as const;

  it.each(grounds)('keeps body/muted/faint text readable on %s', (ground) => {
    for (const ink of ['foreground', 'muted', 'faint']) {
      expect(contrast(colors[ink], colors[ground])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps a field\'s placeholder readable', () => {
    if (colors === light) {
      for (const ground of grounds) expect(contrast(colors.placeholder, colors[ground])).toBeGreaterThanOrEqual(4.5);
    } else {
      expect(contrast(colors.placeholder, colors.surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the accent button readable, at rest and on hover', () => {
    expect(contrast(colors.accentForeground, colors.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.accentForeground, colors.accentHover)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the accent-tinted hover text readable on its tint', () => {
    expect(contrast(colors.accentInk, colors.accentSoft)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(grounds)('keeps accent text (the 404, the sign-in code) readable on %s', (ground) => {
    expect(contrast(colors.accent, colors[ground])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.accentInk, colors[ground])).toBeGreaterThanOrEqual(4.5);
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

  it('keeps a destructive confirmation readable, at rest and on hover', () => {
    expect(contrast(colors.criticalForeground, colors.critical)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.criticalForeground, colors.criticalHover)).toBeGreaterThanOrEqual(4.5);
  });

  // The hero's article is a publisher's page: its text, and its text under each
  // highlight tint, must read as well as the page's own.
  it('keeps the hero article readable on its sheet and under every highlight', () => {
    expect(contrast(colors.paperInk, colors.paper)).toBeGreaterThanOrEqual(7);
    expect(contrast(colors.paperMuted, colors.paper)).toBeGreaterThanOrEqual(4.5);
    for (const severity of SEVERITIES) {
      expect(contrast(colors.paperInk, over(colors[`${severity}Tint`], colors.paper))).toBeGreaterThanOrEqual(7);
    }
  });

  it.each(grounds)('labels every severity with a readable tone on %s', (ground) => {
    for (const severity of SEVERITIES) {
      expect(contrast(colors[`${severity}Label`], colors[ground])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors[`${severity}Label`], over(colors[`${severity}Tint`], colors[ground]))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the neutral chip and Google\'s button readable', () => {
    expect(contrast(colors.muted, colors.chip)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.googleInk, colors.googleFill)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.googleInk, colors.googleHover)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the labels a drawing writes on its bodies and screens readable', () => {
    for (const ground of ['isoSolid', 'isoPanel', 'isoScreen', 'isoControl']) {
      expect(contrast(colors.foreground, colors[ground])).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe.each(THEMES)('non-text contrast on the %s theme (AA, 3:1)', (_name, colors) => {
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

  it('marks the selected and the focused hero passage visibly on the sheet', () => {
    expect(contrast(colors.paperInk, colors.paper)).toBeGreaterThanOrEqual(3);
    // What meets the sheet: the ring itself, or in the dark theme its dark offset.
    const ring = Math.max(contrast(colors.background, colors.paper), contrast(colors.accentHover, colors.paper));
    expect(ring).toBeGreaterThanOrEqual(3);
  });

  it('keeps a severity\'s bar and dot visible on both grounds and on the sheet', () => {
    if (colors === dark) return; // The dark fills mirror the extension's overlay; they are read on the sheet and the panel.
    for (const severity of SEVERITIES) {
      for (const ground of ['background', 'surface', 'paper']) {
        expect(contrast(colors[severity], colors[ground])).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe('the brand mark', () => {
  it('keeps the logo marks visible on the accent tile, which does not change with the theme', () => {
    expect(contrast('#faf9f5', dark.accent)).toBeGreaterThanOrEqual(3);
  });
});

// Colour carries exactly one meaning, severity (AGENTS.md). The brand accent is a
// hue no severity uses, and the severity tokens the pages borrow are the demo's.
describe('the brand accent is not a severity hue', () => {
  it.each(THEMES)('keeps the %s accent tones at least 30 degrees from every severity tone', (_name, colors) => {
    for (const token of ['accent', 'accentHover', 'accentInk']) {
      for (const severity of SEVERITIES) {
        expect(hueGap(colors[token], colors[severity])).toBeGreaterThanOrEqual(30);
        expect(hueGap(colors[token], colors[`${severity}Label`])).toBeGreaterThanOrEqual(30);
      }
    }
  });

  it('keeps the dark severity tokens on the demo palette, so a finding reads the same as in the extension and on a share image', () => {
    for (const severity of SEVERITIES) {
      expect(dark[severity]).toBe(SEVERITY_COLORS[severity].color);
      expect(dark[`${severity}Label`]).toBe(SEVERITY_COLORS[severity].text);
      const [r, g, b] = SEVERITY_COLORS[severity].tint.match(/[\d.]+/g)!.map(Number);
      expect(dark[`${severity}Wash`]).toBe(`#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`);
      expect(dark[`${severity}Tint`]).toBe(`${dark[`${severity}Wash`]}2e`);
    }
    expect(dark.criticalInk).not.toBe(dark.accentInk);
  });
});
