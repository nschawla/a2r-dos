import clsx from 'clsx';

/**
 * "Concept B: Ascent Vector" — the A2R DOS logo mark. A single geometric
 * glyph, not raster artwork or a gradient fill: one solid triangle rising
 * to a point (an apex, not a curve — the ascent) with a smaller
 * triangular counter cut from its center on the same taper as its outer
 * edges, read at a glance as the letterform "A" — the classic
 * bold-monogram construction (a shape nested inside a similar, larger
 * copy of itself), built from three straight lines each.
 *
 * Rendered in a fixed solid Gunmetal Gray (`text-logo`, #545A61) —
 * deliberately its OWN design token, not `text-brand`. The interactive
 * accent (links, primary CTAs, focus rings, the selected nav state) stays
 * corporate blue everywhere; the logo's ink never shares that variable,
 * so re-theming one can never silently recolor the other. See
 * tailwind.config.ts's `logo` token for the rationale.
 *
 * Every call site pairs this with its own adjacent text label already
 * (Header, Sidebar, AuthShell, the public/marketing shell, the Ops
 * Console header), so the icon alone reads cleanly with no wordmark
 * baked into the SVG.
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
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2L22 22H2L12 2ZM12 6L17 16H7L12 6Z"
      />
    </svg>
  );
}
