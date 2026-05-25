import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        bg: {
          0: '#080b12',
          1: '#0d1117',
          2: '#111828',
          3: '#151d2e',
          4: '#1a2236',
        },
        border: {
          DEFAULT: '#1e2744',
          bright: '#253050',
        },
        brand: {
          DEFAULT: '#0d9488',
          light: '#14b8a6',
          dark: '#0f766e',
        },
        ink: {
          DEFAULT: '#c8d3e8',
          dim: '#6b7fa8',
          muted: '#3d4f6a',
        },
        boundary: {
          intra_org: '#3b82f6',
          cross_org: '#f59e0b',
          cross_cloud: '#8b5cf6',
        },
        status: {
          active: '#22c55e',
          expired: '#eab308',
          deregistered: '#6b7280',
          pending: '#94a3b8',
          running: '#3b82f6',
          success: '#22c55e',
          failed: '#ef4444',
          cancelled: '#6b7280',
        },
      },
      animation: {
        'pulse-dot': 'pulse-dot 2s ease-in-out infinite',
        'slide-in': 'slide-in 0.2s ease',
        'ticker-in': 'ticker-in 0.15s ease',
      },
      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        'slide-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'ticker-in': {
          from: { opacity: '0', transform: 'translateX(-8px)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
