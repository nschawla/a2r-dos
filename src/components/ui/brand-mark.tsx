import clsx from 'clsx';

/**
 * "Concept B: Ascent Vector" — the PS Delivery OS logo mark: a fully
 * solid triangle rising to a point (an apex, not a curve — the ascent),
 * a clean horizontal gap, and a solid red rectangular bar at the base —
 * three flat geometric shapes, no raster artwork, no gradient, no
 * stroke/outline anywhere.
 *
 * Two independent pieces, each its own design token so neither can ever
 * silently recolor the other:
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
 *     A clean rectangle, the exact width of the triangle's own base.
 *
 * Revision history (each iteration verified live before the next):
 *   v1.35.0 — the earlier "A" counter-cut (a smaller triangle removed
 *     from the mark's center) was dropped for a fully solid triangle —
 *     at this mark's actual render sizes that cutout consumed most of
 *     the interior, reading as a hollow wireframe rather than a solid
 *     mark.
 *   v1.36.0 — tried a tapered trapezoid base bar (flaring wider than the
 *     triangle's base). v1.37.0 — tried a stroke-only outer border
 *     framing the whole composite. v1.38.0 — both reverted per explicit
 *     request, back to this file's current clean-rectangle-bar,
 *     no-border form.
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
      {/* The base bar — always the brand red, own class. A clean
          rectangle, exactly as wide as the triangle's own base (x4–20). */}
      <rect className="text-logo-accent" fill="currentColor" x="4" y="18" width="16" height="4" />
    </svg>
  );
}
