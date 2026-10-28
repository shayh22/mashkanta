/** @type {import('tailwindcss').Config} */

/** A colour token backed by a CSS variable of space-separated RGB channels, so opacity modifiers work. */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // The theme is chosen explicitly (system preference is only the default), so dark mode keys off
  // a class on <html> rather than the media query.
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        // Heebo and Rubik are the Israeli web standard; the system stack keeps the page
        // readable in Hebrew before the webfont lands.
        sans: ['Heebo', 'Rubik', 'system-ui', '-apple-system', 'Segoe UI', 'Arial', 'sans-serif'],
      },
      colors: {
        canvas: token('canvas'),
        surface: {
          DEFAULT: token('surface'),
          muted: token('surface-muted'),
          sunken: token('surface-sunken'),
        },
        line: {
          DEFAULT: token('line'),
          strong: token('line-strong'),
        },
        ink: {
          DEFAULT: token('ink'),
          muted: token('ink-muted'),
          soft: token('ink-soft'),
        },
        positive: token('positive'),
        negative: token('negative'),
        caution: token('caution'),
        brand: {
          50: token('brand-50'),
          100: token('brand-100'),
          200: token('brand-200'),
          400: token('brand-400'),
          500: token('brand-500'),
          600: token('brand-600'),
          700: token('brand-700'),
          800: token('brand-800'),
        },
        'on-brand': token('on-brand'),
        flow: {
          ground: token('flow-ground'),
          card: token('flow-card'),
          ink: token('flow-ink'),
          muted: token('flow-muted'),
          line: token('flow-line'),
          pick: token('flow-pick'),
          strong: token('flow-strong'),
          'on-strong': token('flow-on-strong'),
          accent: token('flow-accent'),
        },
      },
      boxShadow: {
        // Quiet surfaces: a hairline does the work, the shadow only lifts a card off the canvas.
        card: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
        glow: '0 1px 2px 0 rgb(0 0 0 / 0.06)',
        // The pressed-key edge under a button; the face sinks into it on press.
        edge: '0 2px 0 0 rgb(var(--brand-800))',
        'edge-muted': '0 2px 0 0 rgb(var(--line-strong))',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'splash-in': {
          '0%': { opacity: '0', transform: 'scale(0.92)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 220ms ease-out both',
        'splash-in': 'splash-in 500ms ease-out',
      },
    },
  },
  plugins: [],
};
