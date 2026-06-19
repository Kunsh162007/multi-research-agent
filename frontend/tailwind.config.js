/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface:        '#020408',
        panel:          '#030c0b',
        card:           '#050d0b',
        border:         '#0d2e2a',
        accent:         '#00ffe1',
        'accent-hover': '#00ccb3',
        muted:          '#4a6b67',
        magenta:        '#ff2d78',
        'dim-cyan':     '#1e4a44',
      },
      fontFamily: {
        sans: ["'Courier New'", 'Courier', 'monospace'],
        mono: ["'Courier New'", 'Courier', 'monospace'],
      },
    },
  },
  plugins: [],
}
