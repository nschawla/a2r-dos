import type { Config } from 'tailwindcss';

/**
 * A2R Delivery OS — design tokens.
 *
 * NEUTRALS — a single slate-tinted dark ramp (a cool grey with a faint
 * blue bias, never pure black or pure grey). `bg` is the canvas (~60% of
 * any screen), `surface-*` + `border-*` + `ink-muted` carry structure
 * (~30%), and BRAND is the ~10% focal accent — see the 60-30-10 note below.
 *
 * BRAND — the A2R signal palette: `brand` (blue) is the primary fill for
 * CTAs and the logo mark; `brand-hi` (cyan) is the interactive highlight —
 * active nav, focus rings, links, section eyebrows, "you are here". Both
 * are used sparingly and consistently so the accent always reads as
 * intentional. `accent-1` / `accent-2` remain as aliases for the same two
 * hues so older class usages keep resolving; new code uses `brand` /
 * `brand-hi`.
 *
 * SEMANTIC STATUS — `success` / `warning` / `critical` / `na` are RAG +
 * neutral state colors, kept distinct from the brand accent.
 */
const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Neutrals (slate-tinted dark ramp) ────────────────────────
        bg: '#0A0B0E',
        surface: {
          1: '#121419',
          2: '#181B22',
          3: '#1E212A',
        },
        border: {
          DEFAULT: '#23262E',
          soft: '#2B2F39',
        },
        ink: {
          DEFAULT: '#EEF0F4',
          muted: '#9AA0AD',
          faint: '#666C79',
        },

        // ── Brand (the 10% focal accent) ─────────────────────────────
        brand: {
          DEFAULT: '#1575BF', // signal blue — primary CTA + logo
          hi: '#19CBDA', // cyan — interactive highlight / active state
          fg: '#F4FAFF', // text/icon sitting on a solid brand fill
          subtle: 'rgba(25,203,218,0.12)', // faint cyan wash for tints
        },
        // Back-compat aliases — identical hues, kept so existing
        // `accent-1` / `accent-2` utility classes keep resolving.
        accent: {
          1: '#1575BF',
          2: '#19CBDA',
        },

        // ── Semantic status (RAG + neutral) ──────────────────────────
        success: { DEFAULT: '#46D39A', soft: 'rgba(70,211,154,0.12)' },
        warning: { DEFAULT: '#E8A33D', soft: 'rgba(232,163,61,0.12)' },
        critical: { DEFAULT: '#E8615D', soft: 'rgba(232,97,93,0.12)' },
        na: { DEFAULT: '#7B8190', soft: 'rgba(123,129,144,0.12)' },
      },
      fontFamily: {
        display: ['var(--font-sora)', 'Segoe UI', 'system-ui', 'sans-serif'],
        body: ['var(--font-plex-sans)', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['var(--font-plex-mono)', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '16px',
      },
      boxShadow: {
        card: '0 1px 0 rgba(255,255,255,0.02) inset, 0 8px 24px rgba(0,0,0,0.28)',
        // Soft brand glow for the auth screen and other focal moments.
        brand: '0 0 0 1px rgba(25,203,218,0.12), 0 18px 60px -20px rgba(21,117,191,0.35)',
      },
    },
  },
  plugins: [],
};

export default config;
