/**
 * Squiggle - Color Tokens
 *
 * Two themes, dark and warm paper, chosen by the device through
 * `prefers-color-scheme` in src/index.css; there is no manual switch. In both,
 * colour carries exactly one kind of meaning: severity. A finding category is
 * identified by its label and its glyph, never by a hue of its own, so the six
 * historical category colours are gone and the four severity tones below are the
 * only chromatic channel left.
 */

/** One severity tone, with the four forms the panel and the overlay both need. */
export interface SeverityTone {
  /** Saturated fill, as used by the in-page overlay's severity bars. */
  fill: string;
  /** Text/glyph tone adjusted for AA contrast on the theme's ground. */
  text: string;
  /** Translucent tint for card and chip backgrounds. */
  subtle: string;
  /** Translucent border matching the fill. */
  border: string;
}

export interface ThemeColors {
  // Backgrounds & Surfaces
  bg: string;
  surface: string;
  surfaceElevated: string;
  surfaceHover: string;
  surfaceMuted: string;
  surfaceHighlight: string;

  // Borders & Dividers
  border: string;
  borderSubtle: string;
  borderFocus: string;
  borderHeavy: string;

  // Text & Content
  text: string;
  textMuted: string;
  textFaint: string;
  textInverted: string;

  // The one accent: violet, a hue no severity tone uses, so the brand never reads as a verdict
  accent: string;
  accentSubtle: string;
  accentHover: string;
  accentForeground: string;

  // The only chromatic channel: severity. Categories use label + glyph instead.
  severity: {
    critical: SeverityTone;
    warning: SeverityTone;
    info: SeverityTone;
    positive: SeverityTone;
  };

  // Score Gauge bands, mapped onto the same four severity tones.
  scoreSolide: string;
  scoreSolideBg: string;
  scorePerfectible: string;
  scorePerfectibleBg: string;
  scoreFragile: string;
  scoreFragileBg: string;
  scoreProblematique: string;
  scoreProblematiqueBg: string;
}

export const darkTheme: ThemeColors = {
  bg: '#0a0a0b', // landing ground
  surface: '#0f0f11', // cards
  surfaceElevated: '#141417',
  surfaceHover: '#161619',
  surfaceMuted: '#121215',
  surfaceHighlight: '#161619',

  border: '#2a2a2f',
  borderSubtle: '#1b1b1f',
  borderFocus: '#9061f0',
  borderHeavy: '#3a3a40',

  text: '#ece9e3', // 16.3:1 on ground
  textMuted: '#948f88', //  6.2:1 on ground
  textFaint: '#938e86', //  6.1:1 on ground
  textInverted: '#0a0a0b',

  accent: '#9061f0',
  accentSubtle: 'rgba(144, 97, 240, 0.12)',
  accentHover: '#b196f7',
  accentForeground: '#0a0a0b', // 4.86:1 on the accent - AA

  severity: {
    critical: {
      fill: '#dc2626',
      text: '#f87171',
      subtle: 'rgba(220, 38, 38, 0.14)',
      border: 'rgba(220, 38, 38, 0.5)',
    },
    warning: {
      fill: '#d97706',
      text: '#fbbf24',
      subtle: 'rgba(217, 119, 6, 0.13)',
      border: 'rgba(217, 119, 6, 0.5)',
    },
    info: {
      fill: '#2563eb',
      text: '#60a5fa',
      subtle: 'rgba(37, 99, 235, 0.14)',
      border: 'rgba(37, 99, 235, 0.5)',
    },
    positive: {
      fill: '#059669',
      text: '#34d399',
      subtle: 'rgba(5, 150, 105, 0.13)',
      border: 'rgba(5, 150, 105, 0.5)',
    },
  },

  scoreSolide: '#059669',
  scoreSolideBg: 'rgba(5, 150, 105, 0.13)',
  scorePerfectible: '#2563eb',
  scorePerfectibleBg: 'rgba(37, 99, 235, 0.14)',
  scoreFragile: '#d97706',
  scoreFragileBg: 'rgba(217, 119, 6, 0.13)',
  scoreProblematique: '#dc2626',
  scoreProblematiqueBg: 'rgba(220, 38, 38, 0.14)',
};

/** Warm paper and dark ink, mirrored by the light block of src/index.css. */
export const lightTheme: ThemeColors = {
  bg: '#f6f3ec',
  surface: '#fbf9f4',
  surfaceElevated: '#fffdf8',
  surfaceHover: '#efebe2',
  surfaceMuted: '#f1ede4',
  surfaceHighlight: '#efebe2',

  border: '#d8d2c6',
  borderSubtle: '#e7e2d8',
  borderFocus: '#6d3fd6',
  borderHeavy: '#b9b2a4',

  text: '#1c1917',
  textMuted: '#57534e',
  textFaint: '#68625a',
  textInverted: '#f6f3ec',

  accent: '#6d3fd6',
  accentSubtle: 'rgba(109, 63, 214, 0.1)',
  accentHover: '#5a30bd',
  accentForeground: '#fdfcf9', // light ink here: a dark label fails AA on this deeper violet

  severity: {
    critical: {
      fill: '#dc2626',
      text: '#991b1b',
      subtle: 'rgba(220, 38, 38, 0.1)',
      border: 'rgba(220, 38, 38, 0.45)',
    },
    warning: {
      fill: '#b45309',
      text: '#92400e',
      subtle: 'rgba(180, 83, 9, 0.1)',
      border: 'rgba(180, 83, 9, 0.45)',
    },
    info: {
      fill: '#2563eb',
      text: '#1e40af',
      subtle: 'rgba(37, 99, 235, 0.1)',
      border: 'rgba(37, 99, 235, 0.45)',
    },
    positive: {
      fill: '#047857',
      text: '#065f46',
      subtle: 'rgba(4, 120, 87, 0.1)',
      border: 'rgba(4, 120, 87, 0.45)',
    },
  },

  scoreSolide: '#047857',
  scoreSolideBg: 'rgba(4, 120, 87, 0.1)',
  scorePerfectible: '#2563eb',
  scorePerfectibleBg: 'rgba(37, 99, 235, 0.1)',
  scoreFragile: '#b45309',
  scoreFragileBg: 'rgba(180, 83, 9, 0.1)',
  scoreProblematique: '#dc2626',
  scoreProblematiqueBg: 'rgba(220, 38, 38, 0.1)',
};

const tint = (color: string, percent: number) => `color-mix(in srgb, ${color} ${percent}%, transparent)`;

const severityVars = (name: string): SeverityTone => ({
  fill: `var(--color-severity-${name})`,
  text: `var(--color-severity-${name}-ink)`,
  subtle: tint(`var(--color-severity-${name})`, 12),
  border: tint(`var(--color-severity-${name})`, 50),
});

/**
 * What rendered UI reads: the live CSS variables, so an inline style follows the
 * device like a utility class does. `darkTheme` and `lightTheme` are the values.
 * These are not hex strings, so tint with `color-mix`, never by appending alpha.
 */
export const themeVars: ThemeColors = {
  bg: 'var(--color-ground)',
  surface: 'var(--color-panel)',
  surfaceElevated: 'var(--color-panel-elevated)',
  surfaceHover: 'var(--color-panel-hover)',
  surfaceMuted: 'var(--color-panel-muted)',
  surfaceHighlight: 'var(--color-panel-hover)',

  border: 'var(--color-line)',
  borderSubtle: 'var(--color-line-soft)',
  borderFocus: 'var(--color-accent)',
  borderHeavy: 'var(--color-line-heavy)',

  text: 'var(--color-ink)',
  textMuted: 'var(--color-muted)',
  textFaint: 'var(--color-faint)',
  textInverted: 'var(--color-ground)',

  accent: 'var(--color-accent)',
  accentSubtle: tint('var(--color-accent)', 12),
  accentHover: 'var(--color-accent-hover)',
  accentForeground: 'var(--color-accent-foreground)',

  severity: {
    critical: severityVars('critical'),
    warning: severityVars('warning'),
    info: severityVars('info'),
    positive: severityVars('positive'),
  },

  scoreSolide: 'var(--color-severity-positive)',
  scoreSolideBg: tint('var(--color-severity-positive)', 13),
  scorePerfectible: 'var(--color-severity-info)',
  scorePerfectibleBg: tint('var(--color-severity-info)', 14),
  scoreFragile: 'var(--color-severity-warning)',
  scoreFragileBg: tint('var(--color-severity-warning)', 13),
  scoreProblematique: 'var(--color-severity-critical)',
  scoreProblematiqueBg: tint('var(--color-severity-critical)', 14),
};
