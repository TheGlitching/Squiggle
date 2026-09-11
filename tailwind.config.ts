import type { Config } from 'tailwindcss';

/**
 * Dark-only, colour-means-severity. The palette mirrors `src/ui/tokens/colors.ts`
 * (the one theme the extension ships) so Tailwind classes and inline token reads
 * cannot drift apart. Category identity is label + glyph, never a colour.
 */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ground: '#0a0a0b',
        panel: {
          DEFAULT: '#0f0f11',
          elevated: '#141417',
          hover: '#161619',
          muted: '#121215',
        },
        ink: '#ece9e3',
        muted: '#948f88',
        faint: '#938e86',
        line: {
          DEFAULT: '#2a2a2f',
          soft: '#1b1b1f',
          heavy: '#3a3a40',
        },
        stroke: '#4a4742',
        accent: {
          DEFAULT: '#e0483f',
          hover: '#ef7268',
          foreground: '#0a0a0b',
        },
        severity: {
          critical: { DEFAULT: '#dc2626', ink: '#f87171' },
          warning: { DEFAULT: '#d97706', ink: '#fbbf24' },
          info: { DEFAULT: '#2563eb', ink: '#60a5fa' },
          positive: { DEFAULT: '#059669', ink: '#34d399' },
        },
      },
      fontFamily: {
        display: ['Bricolage Grotesque', 'sans-serif'],
        serif: ['Newsreader', 'Georgia', 'serif'],
        mono: ['IBM Plex Mono', 'monospace'],
        sans: ['Bricolage Grotesque', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
