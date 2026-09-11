import type { Config } from 'tailwindcss';

/**
 * The web app's brand tokens. These values are the extension's own — see
 * `src/tokens/colors.ts`, `src/tokens/typography.ts` and `src/index.css` in
 * the extension workspace — copied rather than imported so the two builds stay
 * independent while reading as one product. Change them in both places
 * together.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#FBF9F5',
        surface: '#FFFFFF',
        muted: '#686259',
        faint: '#A8A29E',
        border: '#E3DDD2',
        foreground: '#1C1917',
        accent: '#9E2A2B',
        accentHover: '#872324',
        accentSoft: '#FDF2F2',
      },
      fontFamily: {
        display: ['Bricolage Grotesque', 'system-ui', 'sans-serif'],
        sans: ['Bricolage Grotesque', 'system-ui', 'sans-serif'],
        serif: ['Newsreader', 'Georgia', 'serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      maxWidth: {
        prose: '42rem',
      },
    },
  },
  plugins: [],
} satisfies Config;
