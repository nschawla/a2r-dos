/**
 * UX-1 (GA-readiness audit) — Ops Console route loading fallback.
 *
 * Rendered inside the (admin) shell while a page resolves. Shape mirrors
 * the Platform Telemetry / Tenants pages: a stat grid over a data table.
 */
import { Skeleton, SkeletonCard } from '@/components/ui/skeleton';

export default function OpsLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-3.5 w-72" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} lines={1} />
        ))}
      </div>

      <div className="card flex flex-col gap-3">
        <div className="flex gap-4 border-b border-border pb-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-24" />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            {Array.from({ length: 6 }).map((__, j) => (
              <Skeleton key={j} className="h-3 w-24" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
