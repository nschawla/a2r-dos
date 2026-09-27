'use client';

/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * (admin) segment error boundary — the Ops Console's counterpart to
 * `src/app/(dashboard)/error.tsx`. Before this file existed, ANY thrown
 * error anywhere under `/ops/*` (a transient DB blip in ops-auth.ts's
 * unwrapped hot-path queries, a bad prop, anything) had no local boundary
 * to catch it and fell all the way through to `src/app/global-error.tsx` —
 * the last-resort, full-document fallback that replaces the entire page,
 * sidebar and all, with zero context on which ops page even failed. This
 * keeps the Ops Console's own chrome ((admin)/layout.tsx: sidebar nav,
 * elevation bar, "← Client Workspace") mounted around the failure, same as
 * the tenant shell's own error.tsx already does for `(dashboard)`.
 *
 * No SupportTicketModal is mounted in this route group (that's a
 * `(dashboard)`-only, per-tenant feature), so "Contact support" is a plain
 * mailto: link here, same fallback global-error.tsx already uses.
 */

import { useEffect } from 'react';
import { captureException } from '@/lib/observability';

export default function OpsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureException(error, { scope: 'ops-error', digest: error.digest });
  }, [error]);

  return (
    <div className="flex justify-center pt-8">
      <div className="card max-w-md w-full text-center">
        <div className="text-[11px] uppercase tracking-wide text-critical font-semibold mb-2">
          This page didn&rsquo;t load
        </div>
        <h1 className="text-xl font-display font-bold mb-2">Something went wrong</h1>
        <p className="text-sm text-ink-muted">
          We hit an unexpected error rendering this Ops Console view. Nothing was lost — try again, and if it
          keeps happening, send the reference below to support.
        </p>

        <div className="mt-5 flex items-center justify-center gap-2 flex-wrap">
          <button type="button" onClick={() => reset()} className="btn-primary !w-auto px-5 text-xs">
            Try again
          </button>
          <a
            href={`mailto:support@a2rventures.com?subject=${encodeURIComponent(
              'PS-DOS Ops Console error' + (error.digest ? ` (ref ${error.digest})` : '')
            )}`}
            className="btn-secondary !w-auto px-5 text-xs"
          >
            Contact support
          </a>
        </div>

        {error.digest ? (
          <p className="mt-4 font-mono text-[11px] text-ink-faint">Reference: {error.digest}</p>
        ) : null}
      </div>
    </div>
  );
}
