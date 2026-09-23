import clsx from 'clsx';

/**
 * "Concept B: Ascent Vector" — the PS Delivery OS logo mark. A single
 * geometric glyph, not raster artwork or a gradient fill: one solid
 * triangle rising to a point (an apex, not a curve — the ascent) with a
 * smaller triangular counter cut from its center on the same taper as its
 * outer edges, read at a glance as the letterform "A" — the classic
 * bold-monogram construction (a shape nested inside a similar, larger
 * copy of itself), built from three straight lines each.
 *
 * v1.34.0 — final approved branding adds a solid red accent bar embedded
 * at the triangle's base: a trapezoid sharing the outer triangle's exact
 * taper on both edges (computed from the same two side lines, not a
 * clipPath — a plain `<path>` keeps this a dependency-free, ID-free
 * server component; a `clipPath` would need a React `useId()`-generated
 * id to stay collision-safe across the many places this mark renders on
 * one page, which would force `'use client'` onto a component that
 * currently needs no hooks at all). Sits below the "A" counter-cut
 * (which spans y6–16) with room to spare, so the two never interact.
 * Rendered in its own `text-logo-accent` token (tailwind.config.ts) —
 * deliberately not `text-critical`, the RAID/health severity color nor
 * `text-brand`, the one interactive accent: the base bar is pure
 * branding, and none of the three should be able to silently recolor
 * either of the others.
 *
 * Core mark rendered in a fixed solid Gunmetal Gray (`text-logo`,
 * #545A61) — deliberately its OWN design token, not `text-brand`. The
 * interactive accent (links, primary CTAs, focus rings, the selected nav
 * state) stays corporate blue everywhere; the logo's ink never shares
 * that variable, so re-theming one can never silently recolor the other.
 * See tailwind.config.ts's `logo` token for the rationale.
 *
 * Every call site pairs this with its own adjacent text label already
 * (Header, Sidebar, AuthShell, the public/marketing shell, the Ops
 * Console header), so the icon alone reads cleanly with no wordmark
 * baked into the SVG. `src/app/icon.svg` is a hand-synced static copy of
 * this exact mark (hardcoded hex, since a favicon has no Tailwind/CSS
 * context) for the browser tab/bookmark icon — keep the two in sync if
 * this path data ever changes.
 *
 * Pure vector paths (no raster, no gradient) — crisp at every size this
 * app uses it at, from 18px in the Sidebar up to 40px on the sign-in
 * screen, and prints / exports to PDF exactly as rendered on screen.
 */
const SIZES = {
  sm: 'h-[18px] w-[18px]',
  md: 'h-6 w-6',
  lg: 'h-10 w-10',
} as const;

export function BrandMark({
  size = 'md',
  className,
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={clsx('inline-block flex-none select-none text-logo', SIZES[size], className)}
    >
      {/* Core mark — inherits `currentColor` from the svg's own
          `text-logo`, so a call site's `className` override (e.g. the
          marketing page's `!text-white` on its dark hero) still recolors
          the triangle exactly as before this mark gained its accent. */}
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2L22 22H2L12 2ZM12 6L17 16H7L12 6Z"
      />
      {/* Base accent — always the brand red, deliberately its OWN class
          (not `currentColor`) so no `className` override on the mark
          ever recolors it: a trapezoid on the outer triangle's own taper
          (left edge x=13-0.5y, right edge x=11+0.5y), flush with the
          base at y=22, 3 units tall. */}
      <path className="text-logo-accent" fill="currentColor" d="M3.5 19L20.5 19L22 22H2L3.5 19Z" />
    </svg>
  );
}
