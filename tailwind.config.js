/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        surface2: 'var(--surface2)',
        border: 'var(--border)',
        text: 'var(--text)',
        dim: 'var(--dim)',
        accent: '#3DDC97',
        accentDim: '#2A9D6F',
        warn: '#F0A868',
        neg: '#F0685C',
        violet: '#C58FE0',
        blue: '#5B9FE8',
        teal: '#4FD1D9',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
