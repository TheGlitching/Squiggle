/**
 * Squiggle - Color Tokens
 *
 * The extension is dark-only, exactly like the landing. There is one theme, and
 * colour carries exactly one kind of meaning: severity. A finding category is
 * identified by its label and its glyph, never by a hue of its own, so the six
 * historical category colours are gone and the four severity tones below are the
 * only chromatic channel left.
 */

/** One severity tone, with the four forms the panel and the overlay both need. */
export interface SeverityTone {
  /** Saturated fill, as used by the in-page overlay's severity bars. */
  fill: string;
  /** Text/glyph tone lightened for AA contrast on the dark ground. */
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

  // The one accent
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
  borderFocus: '#e0483f',
  borderHeavy: '#3a3a40',

  text: '#ece9e3', // 16.3:1 on ground
  textMuted: '#948f88', //  6.2:1 on ground
  textFaint: '#938e86', //  6.1:1 on ground
  textInverted: '#0a0a0b',

  accent: '#e0483f',
  accentSubtle: 'rgba(224, 72, 63, 0.12)',
  accentHover: '#ef7268',
  accentForeground: '#0a0a0b', // 4.87:1 on the accent - AA

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

/** Alias documenting intent at call sites that just want "the theme". */
export const theme = darkTheme;
