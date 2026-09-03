import type { Config } from 'tailwindcss';

/**
 * A2R Delivery OS — design tokens ("Executive Clarity" light theme, v1.2.2).
 *
 * NEUTRALS are a crisp light ramp built for an executive audience (ages
 * 30–50+) and print/PDF export. `bg` is a soft cool off-white page canvas
 * (less glare than pure white); `surface-1..3` step DOWN from white for
 * inputs, hovers and pressed rows; `border` is a hairline that reads on
 * both. Type contrast is deliberately high — `ink` (zinc-900, ~17:1),
 * `ink-muted` (zinc-700, ~10:1) and `ink-faint` (zinc-600, ~7.6:1) all
 * clear WCAG AAA for body text.
 *
 * BRAND is the ONE interactive accent — a solid corporate blue for links,
 * primary CTAs, active nav, focus rings, the selected state, and the
 * integrated A2R logo mark. Never a gradient, never decorative.
 * `brand-hi` remains a resolving alias (== `brand`).
 *
 * STATUS colors (`success` / `warning` / `critical` / `na`) are
 * single-purpose RAG + neutral — deep enough to read as text on white.
 *
 * `shadow-card` gives every surface subtle separation on the light ground;
 * `shadow-elevated` is for true overlays (menus, sheets, toasts).
 */
const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Light neutral ramp (crisp, cool-biased) ─────────────────
        bg: '#F6F7F9',
        surface: {
          1: '#FFFFFF',
          2: '#F1F3F6',
          3: '#E6E9EE',
        },
        border: {
          DEFAULT: '#E1E4EA',
          soft: '#CDD2DB',
        },
        ink: {
          DEFAULT: '#18181B', // zinc-900 — headings, table data (AAA)
          muted: '#3F3F46', // zinc-700 — body / secondary (AAA)
          faint: '#52525B', // zinc-600 — micro-labels / captions (AAA)
        },

        // ── The one interactive accent — solid corporate blue ───────
        brand: {
          DEFAULT: '#0B5FD1',
          hi: '#0B5FD1', // resolving alias — accent, not a second colour
          fg: '#FFFFFF',
          subtle: 'rgba(11,95,209,0.10)',
        },
        accent: { 1: '#0B5FD1', 2: '#0B5FD1' },

        // ── Single-purpose status (deep — legible as text on white) ──
        success: { DEFAULT: '#166534', soft: 'rgba(22,101,52,0.10)' }, // green-800, ~6:1
        warning: { DEFAULT: '#B45309', soft: 'rgba(180,83,9,0.10)' }, // amber-700, ~5.9:1 (AAA large)
        critical: { DEFAULT: '#B91C1C', soft: 'rgba(185,28,28,0.10)' }, // red-700, ~6.4:1
        na: { DEFAULT: '#52525B', soft: 'rgba(82,82,91,0.10)' },
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
        // Subtle separation for cards / sidebars / pills on the light ground.
        card: '0 1px 2px 0 rgba(16,24,40,0.04), 0 1px 3px 0 rgba(16,24,40,0.08)',
        // True overlays (menus, sheets, toasts) that float above the page.
        elevated:
          '0 16px 40px -12px rgba(16,24,40,0.18), 0 4px 12px -4px rgba(16,24,40,0.10), 0 0 0 1px rgba(16,24,40,0.05)',
      },
    },
  },
  plugins: [],
};

export default config;
