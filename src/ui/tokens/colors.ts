/**
 * Squiggle - Color Tokens
 * Light and Dark themes for authentic editorial press aesthetic.
 */

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

  // Editorial Accent (Lead / Stamp tone)
  accent: string;
  accentSubtle: string;
  accentHover: string;
  accentForeground: string;

  // Category Findings (6 Fourches Caudines categories)
  sophisme: string;
  sophismeSubtle: string;
  sophismeBorder: string;
  
  unsupported: string;
  unsupportedSubtle: string;
  unsupportedBorder: string;

  overreach: string;
  overreachSubtle: string;
  overreachBorder: string;

  sourceAbsent: string;
  sourceAbsentSubtle: string;
  sourceAbsentBorder: string;

  framing: string;
  framingSubtle: string;
  framingBorder: string;

  strength: string;
  strengthSubtle: string;
  strengthBorder: string;

  // Score Gauge bands
  scoreSolide: string;
  scoreSolideBg: string;
  scorePerfectible: string;
  scorePerfectibleBg: string;
  scoreFragile: string;
  scoreFragileBg: string;
  scoreProblematique: string;
  scoreProblematiqueBg: string;
}

export const lightTheme: ThemeColors = {
  bg: '#FBF9F5', // Warm editorial newsprint parchment
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceHover: '#F5F2EB',
  surfaceMuted: '#F0EBE1',
  surfaceHighlight: '#FAF5EE',

  border: '#E3DDD2',
  borderSubtle: '#EDE8DF',
  borderFocus: '#2D3142',
  borderHeavy: '#C9C0B1',

  text: '#1C1917', // Deep charcoal ink
  textMuted: '#686259',
  textFaint: '#A8A29E',
  textInverted: '#FAFAF9',

  accent: '#9E2A2B', // Deep editorial crimson carmine
  accentSubtle: '#FDF2F2',
  accentHover: '#872324',
  accentForeground: '#FFFFFF',

  sophisme: '#DC2626', // Crimson Red
  sophismeSubtle: '#FEF2F2',
  sophismeBorder: '#FECACA',

  unsupported: '#D97706', // Amber Ochre
  unsupportedSubtle: '#FFFBEB',
  unsupportedBorder: '#FDE68A',

  overreach: '#7C3AED', // Violet / Purple
  overreachSubtle: '#F5F3FF',
  overreachBorder: '#DDD6FE',

  sourceAbsent: '#EA580C', // Rust Orange
  sourceAbsentSubtle: '#FFF7ED',
  sourceAbsentBorder: '#FFEDD5',

  framing: '#4F46E5', // Indigo Blue
  framingSubtle: '#EEF2FF',
  framingBorder: '#C7D2FE',

  strength: '#059669', // Forest Green
  strengthSubtle: '#ECFDF5',
  strengthBorder: '#A7F3D0',

  scoreSolide: '#059669',
  scoreSolideBg: '#ECFDF5',
  scorePerfectible: '#2563EB',
  scorePerfectibleBg: '#EFF6FF',
  scoreFragile: '#D97706',
  scoreFragileBg: '#FFFBEB',
  scoreProblematique: '#DC2626',
  scoreProblematiqueBg: '#FEF2F2',
};

export const darkTheme: ThemeColors = {
  bg: '#141416', // Dark matte slate newsroom
  surface: '#1E1E22',
  surfaceElevated: '#28282E',
  surfaceHover: '#2E2E36',
  surfaceMuted: '#24242A',
  surfaceHighlight: '#2A2A32',

  border: '#33333C',
  borderSubtle: '#26262E',
  borderFocus: '#E2E8F0',
  borderHeavy: '#474754',

  text: '#F5F5F4', // Warm white newsprint text
  textMuted: '#A8A29E',
  textFaint: '#666360',
  textInverted: '#1C1917',

  accent: '#E05759', // Luminous editorial crimson
  accentSubtle: '#331D1E',
  accentHover: '#E86E70',
  accentForeground: '#FFFFFF',

  sophisme: '#F87171',
  sophismeSubtle: '#3B1B1B',
  sophismeBorder: '#5C2222',

  unsupported: '#FBBF24',
  unsupportedSubtle: '#3B2A12',
  unsupportedBorder: '#614318',

  overreach: '#A78BFA',
  overreachSubtle: '#2D1B4E',
  overreachBorder: '#482B7D',

  sourceAbsent: '#FB923C',
  sourceAbsentSubtle: '#382012',
  sourceAbsentBorder: '#5C331B',

  framing: '#818CF8',
  framingSubtle: '#1C2046',
  framingBorder: '#2E3572',

  strength: '#34D399',
  strengthSubtle: '#102F24',
  strengthBorder: '#1A533E',

  scoreSolide: '#34D399',
  scoreSolideBg: '#064E3B',
  scorePerfectible: '#60A5FA',
  scorePerfectibleBg: '#1E3A8A',
  scoreFragile: '#FBBF24',
  scoreFragileBg: '#78350F',
  scoreProblematique: '#F87171',
  scoreProblematiqueBg: '#7F1D1D',
};
