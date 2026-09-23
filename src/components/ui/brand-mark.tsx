import clsx from 'clsx';

/**
 * "Concept B: Ascent Vector" — the PS Delivery OS logo mark: a fully
 * solid triangle rising to a point (an apex, not a curve — the ascent),
 * a clean horizontal gap, a thick, solid red bar at the base, and one
 * thin outer border framing the whole composite — flat geometric shapes
 * and one stroke, no raster artwork, no gradient.
 *
 * v1.35.0 — refined to a fully solid triangle. The earlier "Concept B"
 * cut a smaller triangular counter from the mark's center (evenodd
 * fill-rule) so it read as the letterform "A" — at the mark's actual
 * render sizes (18–40px) that counter consumed most of the shape's
 * interior, leaving only a thin ring of ink that read as a hollow
 * wireframe outline rather than a solid mark. Dropped entirely: the
 * triangle is now one plain filled path, full stop.
 *
 * v1.36.0 — the base bar is now a trapezoid, not a rectangle: its top
 * edge sits exactly on the triangle's own base footprint (x4–20, flush
 * and unified — no width jump across the gap), then flares outward at
 * the same rate the triangle's own two sides taper (Δx/Δy = 8/13, from
 * apex (12,2) to base (4,15)/(20,15)) over the bar's own height, so the
 * bar reads as a continuation of the triangle's silhouette rather than a
 * separate, differently-shaped block dropped underneath it.
 *
 * v1.37.0 — one thin, sharp outer border traces the whole composite's
 * outer silhouette (apex → triangle's right side → straight down the
 * right edge of the gap → the bar's right flare → across the bar's
 * bottom → up its left flare → straight up the left edge of the gap →
 * back up the triangle's left side → apex) — a single closed
 * stroke-only path, `fill="none"`, no separate color of its own: it
 * reads `currentColor` exactly like the triangle, so wherever a call
 * site overrides the mark's color (the marketing page's `!text-white`
 * dark-hero variant included), the border always matches. That's the
 * whole effect: where the border runs alongside the triangle's own
 * fill, same color meeting same color, it has zero contrast and reads
 * as nothing — invisible, flush, the triangle simply looks solid. Where
 * it runs alongside the empty gap or the (independently red)
 * base bar, it has real contrast and reads as a crisp frame around
 * both. No internal dividing lines between the three pieces — this is
 * the union's OUTER boundary only.
 *
 * Three independent pieces, each its own design token so none can ever
 * silently recolor another:
 *   - The triangle inherits `currentColor` from the svg's own
 *     `text-logo` class (Gunmetal Gray, #545A61) — deliberately its own
 *     token, not `text-brand` (the one interactive accent: links,
 *     primary CTAs, focus rings, the selected nav state). A call site's
 *     `className` override (e.g. the marketing page's `!text-white` on
 *     its dark hero) still recolors the triangle exactly as it always
 *     has, since this piece still reads `currentColor` rather than
 *     hardcoding its own class.
 *   - The gap is genuinely empty space — no third shape, no background
 *     rect — so it always matches whatever surface the mark sits on
 *     (dark header, light card, print) with zero upkeep.
 *   - The base bar is always the brand red, on its own
 *     `text-logo-accent` token (tailwind.config.ts) — deliberately not
 *     `text-critical` (the RAID/health severity color) nor `text-brand`:
 *     pure branding, never a status signal, and never affected by a
 *     `className` override on the mark (it doesn't use `currentColor`).
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
      {/* The triangle — solid fill, no counter-cut, no stroke. Inherits
          `currentColor` from the svg's own `text-logo` (or a call site's
          override). Apex (12,2); base corners (4,15) and (20,15). */}
      <path fill="currentColor" d="M12 2L20 15H4Z" />
      {/* y15–18 is a deliberate empty gap — no shape drawn. */}
      {/* The base bar — always the brand red, own class. Top edge (4,18)
          to (20,18) matches the triangle's base exactly; bottom edge
          flares to (1.5,22)/(22.5,22), the same taper the triangle's own
          sides use, carried across the bar's 4-unit height. */}
      <path className="text-logo-accent" fill="currentColor" d="M4 18L20 18L22.5 22H1.5Z" />
      {/* The composite's single outer border — stroke only, inherits
          `currentColor` (never its own color), so it always matches
          whatever the triangle above is currently rendering as. */}
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinejoin="miter"
        d="M12 2L20 15V18L22.5 22H1.5L4 18V15Z"
      />
    </svg>
  );
}
