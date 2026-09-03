/**
 * UX-1 (GA-readiness audit) — skeleton primitive for route `loading.tsx`
 * fallbacks. A neutral pulsing block; `motion-reduce` stops the pulse for
 * users who ask for reduced motion.
 */
import clsx from 'clsx';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={clsx('animate-pulse motion-reduce:animate-none rounded-sm bg-surface-2', className)}
    />
  );
}

/** A card-shaped skeleton block, matching the app's `.card` footprint. */
export function SkeletonCard({ className, lines = 3 }: { className?: string; lines?: number }) {
  return (
    <div className={clsx('card flex flex-col gap-3', className)}>
      <Skeleton className="h-3.5 w-1/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={clsx('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}
