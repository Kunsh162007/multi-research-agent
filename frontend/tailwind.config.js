/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface:        '#020b1a',
        panel:          'rgba(8,16,48,0.85)',
        card:           'rgba(255,255,255,0.06)',
        border:         'rgba(255,255,255,0.12)',
        accent:         '#4fc3f7',
        'accent-hover': '#7dd3fc',
        'accent-2':     '#06b6d4',
        'accent-3':     '#818cf8',
        muted:          'rgba(255,255,255,0.4)',
        cream:          'rgba(255,255,255,0.9)',
      },
      fontFamily: {
        sans:  ['Inter', 'system-ui', '-apple-system', "'Segoe UI'", 'sans-serif'],
        serif: ['Georgia', "'Times New Roman'", 'serif'],
        mono:  ["'JetBrains Mono'", "'Fira Code'", "'Courier New'", 'monospace'],
      },
      backdropBlur: {
        xs: '2px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '40px',
      },
    },
  },
  plugins: [],
}
