/**
 * Fourches Caudines - Typography Tokens
 * Defines font families (Bricolage Grotesque, Newsreader, IBM Plex Mono),
 * size scale, weights, line heights, and letter spacings.
 */

export const typographyTokens = {
  fontFamilies: {
    sans: '"Bricolage Grotesque", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    serif: 'Newsreader, Georgia, "Times New Roman", serif',
    mono: '"IBM Plex Mono", "SF Mono", Menlo, Consolas, monospace',
  },
  fontWeights: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
  },
  fontSizes: {
    xs: '0.75rem',    // 12px
    sm: '0.8125rem',  // 13px
    base: '0.875rem', // 14px
    md: '0.9375rem',  // 15px
    lg: '1.0625rem',  // 17px
    xl: '1.25rem',    // 20px
    '2xl': '1.5rem',  // 24px
    '3xl': '1.875rem',// 30px
    '4xl': '2.25rem', // 36px
  },
  lineHeights: {
    tight: 1.15,
    snug: 1.3,
    normal: 1.5,
    relaxed: 1.65,
  },
  letterSpacings: {
    tighter: '-0.03em',
    tight: '-0.015em',
    normal: '0em',
    wide: '0.04em',
    wider: '0.08em',
    widest: '0.12em',
  },
  fontFaceImports: `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Newsreader:ital,opsz,wght@0,6..72,400..800;1,6..72,400..700&display=swap');
  `.trim(),
};

export const TYPOGRAPHY = {
  fonts: {
    heading: typographyTokens.fontFamilies.sans,
    body: typographyTokens.fontFamilies.serif,
    mono: typographyTokens.fontFamilies.mono,
  },
  weights: typographyTokens.fontWeights,
  sizes: typographyTokens.fontSizes,
  lineHeights: typographyTokens.lineHeights,
  tracking: typographyTokens.letterSpacings,
};

export const GOOGLE_FONTS_URL = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Newsreader:ital,opsz,wght@0,6..72,400..800;1,6..72,400..700&display=swap';
