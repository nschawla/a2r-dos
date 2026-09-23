import clsx from 'clsx';

/**
 * "Concept B: Ascent Vector" — the PS Delivery OS logo mark: a fully
 * solid Navy triangle rising to a point (an apex, not a curve — the
 * ascent), a clean horizontal gap, and a solid red ribbon at the base,
 * wider than the triangle itself — three flat geometric shapes, no
 * raster artwork, no gradient, no stroke/outline anywhere.
 *
 * v1.39.0 — matched to final approved reference art:
 *   - Recolored from Gunmetal Gray to Navy (`logo` token,
 *     tailwind.config.ts).
 *   - The base bar is a wider red ribbon, not a same-width rectangle: it
 *     starts already wider than the triangle's own base right at the
 *     gap (x3–21, one unit past the triangle's x4–20 footprint on each
 *     side) and flares further by the bottom (x0.5–23.5) — reading as a
 *     pedestal the emblem sits on, not a bar cut to the emblem's own
 *     width.
 *   - `logo-accent` brightened to a more vivid flag red, and made fully
 *     independent of `critical` (they only shared a hex by coincidence
 *     before this pass).
 *
 * Two independent pieces, each its own design token so neither can ever
 * silently recolor the other:
 *   - The triangle inherits `currentColor` from the svg's own
 *     `text-logo` class (Navy, #16233F) — deliberately its own token,
 *     not `text-brand` (the one interactive accent: links, primary CTAs,
 *     focus rings, the selected nav state). A call site's `className`
 *     override (e.g. the marketing page's `!text-white` on its dark
 *     hero) still recolors the triangle exactly as it always has, since
 *     this piece still reads `currentColor` rather than hardcoding its
 *     own class.
 *   - The gap is genuinely empty space — no third shape, no background
 *     rect — so it always matches whatever surface the mark sits on
 *     (dark header, light card, print) with zero upkeep.
 *   - The base ribbon is always the brand red, on its own
 *     `text-logo-accent` token (tailwind.config.ts) — deliberately not
 *     `text-critical` (the RAID/health severity color) nor `text-brand`:
 *     pure branding, never a status signal, and never affected by a
 *     `className` override on the mark (it doesn't use `currentColor`).
 *
 * Revision history (each iteration verified live before the next):
 *   v1.35.0 dropped the earlier "A" counter-cut for a fully solid
 *   triangle. v1.36.0 tried a tapered trapezoid matching the triangle's
 *   own width; v1.37.0 tried a stroke-only outer border framing the
 *   whole composite; v1.38.0 reverted both to a plain same-width
 *   rectangle bar, no border. v1.39.0 (this revision) is the first pass
 *   built directly against reference art rather than a text description
 *   — colors and the ribbon's exact flare are a best-effort visual match,
 *   not pixel-sampled; flag if either needs further tuning.
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
      {/* The base ribbon — always the brand red, own class. Wider than
          the triangle's own base at the top (x3–21) and flares further
          by the bottom (x0.5–23.5), reading as a pedestal the triangle
          sits on rather than a bar cut to its exact width. */}
      <path className="text-logo-accent" fill="currentColor" d="M3 18L21 18L23.5 22H0.5Z" />
    </svg>
  );
}
