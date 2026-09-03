'use client';

/**
 * REL-1 (GA-readiness audit) — dashboard segment error boundary.
 *
 * Catches errors thrown while rendering any page under `(dashboard)`. The
 * dashboard layout (sidebar, header, providers) stays mounted around this,
 * so it can use globals.css classes and the DashboardUI context — unlike
 * `src/app/global-error.tsx`, which is the last-resort full-document
 * fallback. An error in the layout itself bubbles past this to global-error.
 */

import { useEffect } from 'react';
import { useDashboardUI } from '@/components/layout/dashboard-ui-context';
import { captureException } from '@/lib/observability';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { openSupportModal } = useDashboardUI();

  useEffect(() => {
    captureException(error, { scope: 'dashboard-error', digest: error.digest });
  }, [error]);

  return (
    <div className="flex justify-center pt-8">
      <div className="card max-w-md w-full text-center">
        <div className="text-[11px] uppercase tracking-wide text-critical font-semibold mb-2">
          This page didn&rsquo;t load
        </div>
        <h1 className="text-xl font-display font-bold mb-2">Something went wrong</h1>
        <p className="text-sm text-ink-muted">
          We hit an unexpected error rendering this view. Your work is safe — try again, and if it keeps
          happening, let us know with the reference below.
        </p>

        <div className="mt-5 flex items-center justify-center gap-2 flex-wrap">
          <button type="button" onClick={() => reset()} className="btn-primary !w-auto px-5 text-xs">
            Try again
          </button>
          <button
            type="button"
            onClick={openSupportModal}
            className="btn-secondary !w-auto px-5 text-xs"
          >
            Contact support
          </button>
        </div>

        {error.digest ? (
          <p className="mt-4 font-mono text-[11px] text-ink-faint">Reference: {error.digest}</p>
        ) : null}
      </div>
    </div>
  );
}
