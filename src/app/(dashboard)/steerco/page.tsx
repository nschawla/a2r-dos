import { redirect } from 'next/navigation';

/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Retired in v1.51.0 — SteerCo Briefing merged into the Executive Hub
 * (`/reports`): the overlap between this page's own Margin Health /
 * Watchlist sections and Executive Hub's Financial Realization / Critical
 * Risk Register was real and substantial (both already read the same
 * underlying `ExecutiveBriefing` data), and this page's two genuinely
 * unique pieces — the Pulse strip and the "What Moved" activity feed —
 * now live there too, as a glance strip and a new Activity tab
 * respectively. See `docs/UI_DESIGN_SYSTEM.md` for the full writeup.
 *
 * Route kept alive as a permanent forward (not a 404) for any bookmark or
 * typed link — exact precedent: `src/app/(dashboard)/command/page.tsx`'s
 * v1.29.0 retirement.
 */
export default function SteerCoRetiredPage() {
  redirect('/reports');
}
