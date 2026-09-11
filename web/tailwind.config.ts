import type { Config } from 'tailwindcss';

/**
 * The web app's design tokens: the dark/tech system the captain approved in
 * `data/squiggle-landing-redesign/prototypes/index.html`. The extension keeps
 * its own palette; these are the web's. The animated demo's per-severity
 * colours live in `src/demo.ts` because they are copied from the extension's
 * `src/content/shadowOverlay.ts` and must stay in step with it.
 *
 * Change the ground/ink/accent here and in `src/index.css` together.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0b',
        surface: '#0f0f11',
        muted: '#948f88',
        faint: '#938e86',
        border: '#2a2a2f',
        borderControl: '#66666f',
        lineSoft: '#1b1b1f',
        foreground: '#ece9e3',
        accent: '#e0483f',
        accentForeground: '#0a0a0b',
        accentHover: '#ef7268',
        accentSoft: '#251010',
        accentInk: '#f08a80',
      },
      fontFamily: {
        display: ['Bricolage Grotesque', 'system-ui', 'sans-serif'],
        sans: ['Bricolage Grotesque', 'system-ui', 'sans-serif'],
        serif: ['Newsreader', 'Georgia', 'serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      maxWidth: {
        prose: '42rem',
        hero: '22.5rem',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.23, 1, 0.32, 1)',
      },
      borderRadius: {
        card: '14px',
        control: '10px',
      },
    },
  },
  plugins: [],
} satisfies Config;