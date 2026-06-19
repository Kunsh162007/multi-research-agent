/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface:        '#0c0c0c',
        panel:          '#101008',
        card:           '#181612',
        border:         '#2a2015',
        accent:         '#d4a847',
        'accent-hover': '#e8be60',
        muted:          '#9a8a6a',
        magenta:        '#d4a847',
        'dim-cyan':     '#3a3020',
        cream:          '#f5f0e8',
      },
      fontFamily: {
        sans:  ["'Segoe UI'", 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['Georgia', "'Times New Roman'", 'serif'],
        mono:  ["'Courier New'", 'Courier', 'monospace'],
      },
    },
  },
  plugins: [],
}
