/** @type {import('tailwindcss').Config} */
const rgb = (v) => `rgb(var(${v}) / <alpha-value>)`;

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // semanticos de UI
        background: rgb('--background'),
        foreground: rgb('--foreground'),
        card: rgb('--card'),
        muted: { DEFAULT: rgb('--muted'), foreground: rgb('--muted-foreground') },
        border: rgb('--border'),
        ring: rgb('--ring'),
        // marca
        ink: rgb('--ink'),
        sand: rgb('--sand'),
        surface: rgb('--surface'),
        gold: {
          400: rgb('--gold-400'),
          500: rgb('--gold-500'),
          600: rgb('--gold-600'),
          700: rgb('--gold-700'),
          DEFAULT: rgb('--gold-500'),
        },
        warm: {
          50: rgb('--warm-50'), 100: rgb('--warm-100'), 200: rgb('--warm-200'),
          300: rgb('--warm-300'), 400: rgb('--warm-400'), 500: rgb('--warm-500'),
          600: rgb('--warm-600'), 700: rgb('--warm-700'), 800: rgb('--warm-800'),
          900: rgb('--warm-900'),
        },
        // semanticos
        success: { DEFAULT: rgb('--success'), soft: rgb('--success-soft') },
        warning: { DEFAULT: rgb('--warning'), soft: rgb('--warning-soft') },
        error: { DEFAULT: rgb('--error'), soft: rgb('--error-soft') },
        info: { DEFAULT: rgb('--info'), soft: rgb('--info-soft') },
        // termometro
        score: {
          verde: rgb('--score-verde'), amarelo: rgb('--score-amarelo'),
          laranja: rgb('--score-laranja'), vermelho: rgb('--score-vermelho'),
        },
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"DM Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        display: ['2.5rem', { lineHeight: '1.1', letterSpacing: '-0.01em' }],
        h1: ['2rem', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
        h2: ['1.5625rem', { lineHeight: '1.25' }],
        h3: ['1.25rem', { lineHeight: '1.3' }],
        body: ['1rem', { lineHeight: '1.6' }],
        sm: ['0.875rem', { lineHeight: '1.5' }],
        caption: ['0.78rem', { lineHeight: '1.4', letterSpacing: '0.04em' }],
      },
      borderRadius: {
        sm: '0.375rem',
        md: '0.625rem',
        lg: 'var(--radius)',
        xl: '1rem',
      },
      boxShadow: {
        sm: '0 1px 2px rgb(28 23 18 / 0.06)',
        md: '0 4px 16px rgb(28 23 18 / 0.08)',
        lg: '0 12px 32px rgb(28 23 18 / 0.10)',
        'gold-glow': '0 0 0 3px rgb(184 131 42 / 0.25)',
      },
      keyframes: {
        'fade-rise': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-rise': 'fade-rise 250ms ease-out both',
      },
    },
  },
  plugins: [],
};
