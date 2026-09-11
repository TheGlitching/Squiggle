/**
 * The dark theme's AA contract, measured with the sRGB relative-luminance
 * method. The port shipped white-on-accent (4.06:1) and the demo's darker
 * severity fills as label text (critical 3.96, info 3.70); this pins the fixed
 * pairs so a later recolour cannot quietly drop them back below AA.
 */
import { describe, expect, it } from 'vitest';

import config from '../tailwind.config';
import { SEVERITY_COLORS } from '../src/demo';

const colors = config.theme.extend.colors as Record<string, string>;

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

  it('keeps the accent-tinted error text readable on its tint', () => {
    expect(contrast(colors.accentInk, colors.accentSoft)).toBeGreaterThanOrEqual(4.5);
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
      expect(contrast(colors.accentHover, colors[ground])).toBeGreaterThanOrEqual(3);
    }
  });
});
