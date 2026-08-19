import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#FAF9F5',
        foreground: '#141413',
        muted: '#828179',
        border: '#E6E4DD',
        canvas: '#FFFFFF',
        accent: '#D97706',
        severity: {
          critical: '#DC2626',
          major: '#EA580C',
          minor: '#CA8A04',
          info: '#2563EB',
        },
      },
      fontFamily: {
        display: ['Bricolage Grotesque', 'sans-serif'],
        serif: ['Newsreader', 'Georgia', 'serif'],
        mono: ['IBM Plex Mono', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
