/**
 * UX-3 (GA-readiness audit) — dashboard not-found page.
 *
 * Rendered when `notFound()` fires in a dashboard route (a stale bookmark,
 * a project opened in another tab and since deleted, a mistyped id). The
 * dashboard layout stays mounted around this, so the sidebar/header chrome
 * is already there — this just fills the content area with a way back.
 */
import Link from 'next/link';

export default function DashboardNotFound() {
  return (
    <div className="flex justify-center pt-10">
      <div className="card max-w-md w-full text-center">
        <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-2">
          404 — Not found
        </div>
        <h1 className="text-xl font-display font-bold mb-2">We couldn&rsquo;t find that page</h1>
        <p className="text-sm text-ink-muted">
          The engagement or record you&rsquo;re looking for may have been moved, closed, or renamed — or the
          link is out of date.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <Link href="/portfolio" className="btn-primary !w-auto px-5 text-xs">
            Back to the Control Tower
          </Link>
        </div>
      </div>
    </div>
  );
}
