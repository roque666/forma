import type { Config } from 'tailwindcss';

const c = (v: string) => `rgb(var(--${v}) / <alpha-value>)`;

export default {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: c('bg'), surface: c('surface'), surface2: c('surface2'), fg: c('fg'), muted: c('muted'),
        line: c('line'), accent: c('accent'), 'accent-fg': c('accent-fg'), 'accent-text': c('accent-text'),
        ok: c('ok'), warn: c('warn'), danger: c('danger'),
        protein: c('protein'), carbs: c('carbs'), fat: c('fat'),
      },
      borderRadius: { xl: '0.9rem', '2xl': '1.25rem', '3xl': '1.75rem' },
      boxShadow: { card: '0 1px 2px rgb(0 0 0 / 0.04), 0 6px 24px -12px rgb(0 0 0 / 0.12)' },
      keyframes: {
        pop: { '0%': { transform: 'scale(0.9)', opacity: '0' }, '60%': { transform: 'scale(1.04)' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        rise: { '0%': { transform: 'translateY(6px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
      },
      animation: { pop: 'pop 0.28s ease-out', rise: 'rise 0.24s ease-out' },
    },
  },
  plugins: [],
} satisfies Config;
