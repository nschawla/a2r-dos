/**
 * UX-1 (GA-readiness audit) — dashboard route loading fallback.
 *
 * Rendered inside the already-mounted dashboard chrome (sidebar + header)
 * while a page's server data resolves, so navigation shows a settled
 * skeleton instead of a frozen previous screen. Shape mirrors the busiest
 * page (the Control Tower): a KPI strip over a project table.
 */
import { Skeleton, SkeletonCard } from '@/components/ui/skeleton';

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-3.5 w-80" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} lines={2} />
        ))}
      </div>

      <div className="card flex flex-col gap-3">
        <Skeleton className="h-4 w-40" />
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 flex-1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
