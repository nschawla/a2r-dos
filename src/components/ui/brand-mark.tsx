import clsx from 'clsx';

/**
 * The integrated A2R logo mark — the sharp "A2R" wordform set tight in the
 * display face with a solid underline rule beneath it, in one solid
 * corporate blue.
 *
 * Rendered as live text + a bottom border (not a raster or an SVG fill),
 * so it is resolution-independent, gradient-free by construction, and
 * prints / exports to PDF crisply at any size.
 */
const SIZES = {
  sm: 'text-[15px] border-b-2 pb-px',
  md: 'text-[19px] border-b-2 pb-0.5',
  lg: 'text-[30px] border-b-[3px] pb-1',
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
        'inline-block flex-none select-none font-display font-extrabold leading-none tracking-[-0.045em] text-brand border-brand',
        SIZES[size],
        className,
      )}
    >
      A2R
    </span>
  );
}
