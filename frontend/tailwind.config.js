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
          400: '#818CF8',
          500: '#4F46E5',
          600: '#4338CA',
          700: token('brand-700'),
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 4px 16px -4px rgb(15 23 42 / 0.08)',
        glow: '0 8px 32px -8px rgb(79 70 229 / 0.35)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 220ms ease-out both',
      },
    },
  },
  plugins: [],
};
