import type { ReactNode } from 'react';
import clsx from 'clsx';

/**
 * The single-pane layout container (Sprint 1: Apple-grade foundation).
 *
 * One centered column with generous, responsive gutters and vertical
 * rhythm — every authenticated surface renders its content through this so
 * nothing sprawls edge-to-edge and the eye always has one focal column.
 *
 *   default — app views (module pages, Ops Console)
 *   wide    — dense data views that genuinely need the width
 *   full    — the main client dashboard shell: edge-to-edge, minimal
 *             gutters, for high-density enterprise viewing (the Bento
 *             Control Tower, wide data tables, etc.)
 *   prose   — legal / long-form reading
 *   form    — a narrow single-form screen
 */
const WIDTHS = {
  form: 'max-w-md',
  prose: 'max-w-2xl',
  default: 'max-w-[1180px]',
  wide: 'max-w-[1360px]',
  full: 'max-w-[1920px]',
} as const;

/** Tighter horizontal gutters for `full` — the point is screen real estate,
 * not a second centered column at a different width. */
const FULL_PADDING = 'px-4 sm:px-6 lg:px-8 lg:py-10';
const DEFAULT_PADDING = 'px-5 py-8 sm:px-8 lg:px-12 lg:py-12';

export function Container({
  children,
  size = 'default',
  className,
}: {
  children: ReactNode;
  size?: keyof typeof WIDTHS;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'mx-auto w-full flex flex-col gap-6',
        size === 'full' ? FULL_PADDING : DEFAULT_PADDING,
        WIDTHS[size],
        className
      )}
    >
      {children}
    </div>
  );
}
