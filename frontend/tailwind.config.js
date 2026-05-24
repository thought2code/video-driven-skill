/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)'],
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      colors: {
        paper: {
          50:  '#FBF8F3',
          100: '#F5F0E8',
          200: '#ECE3D4',
          300: '#DCCDB3',
          400: '#B8A88A',
        },
        ink: {
          50:  '#F7F6F3',
          200: '#C8C3B9',
          400: '#8A847A',
          500: '#5C574F',
          700: '#3B362E',
          900: '#1F1C18',
        },
        umber: {
          50:  '#F4EADE',
          200: '#E4CCA9',
          300: '#D4B08A',
          400: '#B88A5E',
          500: '#9A6B3F',
          600: '#7F5628',
          700: '#5E3D17',
        },
        sage: {
          300: '#B3C0A2',
          500: '#7A8A6E',
          700: '#58684C',
        },
        clay: {
          300: '#E0B5A7',
          500: '#B87E6B',
          700: '#8A5544',
        },
      },
      boxShadow: {
        soft: '0 1px 2px rgba(31, 28, 24, 0.03), 0 8px 24px -10px rgba(31, 28, 24, 0.08)',
        lift: '0 1px 2px rgba(31, 28, 24, 0.04), 0 20px 48px -20px rgba(31, 28, 24, 0.14)',
        hairline: '0 0 0 1px rgba(31, 28, 24, 0.06)',
        'inset-hair': 'inset 0 0 0 1px rgba(31, 28, 24, 0.05)',
        'ember-glow': '0 0 0 1px rgba(154, 107, 63, 0.2), 0 0 28px -6px rgba(154, 107, 63, 0.35)',
      },
      letterSpacing: {
        'wider-plus': '0.14em',
        'widest-plus': '0.22em',
      },
      borderRadius: {
        xs: '4px',
      },
      backgroundImage: {
        'paper-grain':
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.12 0 0 0 0 0.11 0 0 0 0 0.09 0 0 0 0.06 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
      },
      animation: {
        'fade-up':   'fade-up 700ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in':   'fade-in 700ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'shimmer':   'shimmer 2400ms linear infinite',
        'pulse-soft':'pulse-soft 3.2s ease-in-out infinite',
      },
      keyframes: {
        'fade-up': {
          '0%':   { opacity: 0, transform: 'translateY(10px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%':   { opacity: 0 },
          '100%': { opacity: 1 },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: 0.55 },
          '50%':      { opacity: 1 },
        },
      },
    },
  },
  plugins: [],
}
