/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#dae4ff',
          200: '#bcccff',
          300: '#8ca7ff',
          400: '#5a7bff',
          500: '#3355f0',
          600: '#263fd0',
          700: '#1f33a6',
          800: '#1c2e86',
          900: '#1a2b6b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
