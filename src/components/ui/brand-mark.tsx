import clsx from 'clsx';

/**
 * The A2R Delivery OS logo mark — a white geometric lambda (an "A" with no
 * crossbar) on a single solid accent tile. Flat: no gradient, no shadow.
 * This tile is the one place the accent appears as a fill outside a
 * primary button.
 *
 * The glyph is a filled path in a 32×32 viewBox at 56% of the tile, so it
 * scales cleanly with `size` or any width passed via `className`.
 */
const SIZES = {
  sm: 'w-6 h-6 rounded-lg',
  md: 'w-8 h-8 rounded-[10px]',
  lg: 'w-11 h-11 rounded-2xl',
} as const;

export function BrandMark({
  size = 'md',
  className,
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={clsx('flex-none inline-flex items-center justify-center bg-brand', SIZES[size], className)}
    >
      <svg viewBox="0 0 32 32" className="w-[56%] h-[56%] text-white" fill="currentColor">
        <path d="M4 27.5 L16 4.5 L28 27.5 L20.5 27.5 L16 11.5 L11.5 27.5 Z" />
      </svg>
    </span>
  );
}
