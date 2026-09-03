import type { Config } from 'tailwindcss';

/**
 * A2R Delivery OS — design tokens (Sprint 1: Apple-grade foundation).
 *
 * NEUTRALS are the whole system — a near-neutral obsidian ramp. `bg` is the
 * deep canvas; `surface-1..3` are progressively lifted planes; `border` is
 * a single hairline weight (`border-soft` is a barely-there step up, for
 * hover/focus only). Type contrast is deliberately sharp: bright `ink`,
 * a clear drop to `ink-muted`, quiet `ink-faint` for micro-labels.
 *
 * BRAND is the ONE interactive accent — `brand` (systemBlue) for links,
 * primary CTAs, active nav, focus rings, and the selected state. It is
 * never decorative. `brand-hi` remains a resolving alias (== `brand`) so a
 * stray class still lands on the accent rather than nothing.
 *
 * STATUS colors (`success` / `warning` / `critical` / `na`) are
 * single-purpose — RAG + neutral state only, never chrome, never accent.
 *
 * No ambient shadows. `shadow-elevated` exists for true overlays (menus,
 * sheets, toasts) that float above the page; everything else is flat.
 */
const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Obsidian neutral ramp ───────────────────────────────────
        bg: '#08090B',
        surface: {
          1: '#121316',
          2: '#191A1E',
          3: '#212228',
        },
        border: {
          DEFAULT: '#26262A',
          soft: '#2F2F35',
        },
        ink: {
          DEFAULT: '#F5F5F7',
          muted: '#8E8E93',
          faint: '#636369',
        },

        // ── The one interactive accent ──────────────────────────────
        brand: {
          DEFAULT: '#0A84FF',
          hi: '#0A84FF', // resolving alias — accent, not a second colour
          fg: '#FFFFFF',
          subtle: 'rgba(10,132,255,0.12)',
        },
        accent: { 1: '#0A84FF', 2: '#0A84FF' },

        // ── Single-purpose status ───────────────────────────────────
        success: { DEFAULT: '#30D158', soft: 'rgba(48,209,88,0.14)' },
        warning: { DEFAULT: '#FF9F0A', soft: 'rgba(255,159,10,0.14)' },
        critical: { DEFAULT: '#FF453A', soft: 'rgba(255,69,58,0.14)' },
        na: { DEFAULT: '#8E8E93', soft: 'rgba(142,142,147,0.14)' },
      },
      fontFamily: {
        display: ['var(--font-sora)', 'Segoe UI', 'system-ui', 'sans-serif'],
        body: ['var(--font-plex-sans)', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['var(--font-plex-mono)', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '18px',
      },
      boxShadow: {
        // Overlays only. Nothing on the page surface itself.
        elevated: '0 24px 64px -20px rgba(0,0,0,0.72), 0 0 0 1px rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [],
};

export default config;
