import clsx from 'clsx';

/**
 * The A2R Delivery OS logo mark — a crisp white geometric lambda (an "A"
 * with no crossbar) on the brand blue→cyan gradient tile. The gradient is
 * the one place brand color is used as a fill; everywhere else the accent
 * is flat (solid `brand` for CTAs, `brand-hi` for active states).
 *
 * The glyph is a filled path in a 32×32 viewBox sized to 50% of the tile,
 * so it scales cleanly with the `size` prop (or any width passed via
 * `className`).
 */
const SIZES = {
  sm: 'w-6 h-6 rounded-[5px]',
  md: 'w-8 h-8 rounded-md',
  lg: 'w-11 h-11 rounded-lg',
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
      className={clsx(
        'flex-none inline-flex items-center justify-center bg-gradient-to-br from-brand to-brand-hi',
        'ring-1 ring-inset ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]',
        SIZES[size],
        className
      )}
    >
      <svg viewBox="0 0 32 32" className="w-[56%] h-[56%] text-white" fill="currentColor">
        <path d="M4 27.5 L16 4.5 L28 27.5 L20.5 27.5 L16 11.5 L11.5 27.5 Z" />
      </svg>
    </span>
  );
}
