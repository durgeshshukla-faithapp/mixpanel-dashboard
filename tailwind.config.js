/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0F1419',
        surface: '#161C24',
        surface2: '#1D2530',
        border: '#2A323D',
        text: '#E8ECF1',
        dim: '#8B96A5',
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
