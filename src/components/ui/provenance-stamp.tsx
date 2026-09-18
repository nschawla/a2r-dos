import { relativeTime } from '@/lib/relative-time';

/**
 * A minimalist data-freshness stamp for a financial summary or a critical/
 * red risk view — purely to give an executive reader confidence the figure
 * in front of them is current, without adding any real UI weight. Server-
 * safe (no client state): `relativeTime` is a pure function of `at` and
 * the render-time `now`, so this never needs to re-render after mount.
 *
 * Deliberately honest about what it's reporting: this reads the
 * underlying record's own `updatedAt`, not a fabricated "last synced"
 * event — there's no external system this app polls today. Where a value
 * genuinely did arrive through the Data Ingestion API Bridge (a bulk
 * timesheet/actuals import), pass `source="Ingested"` instead of the
 * generic "Updated" so the stamp doesn't overclaim.
 */
export function ProvenanceStamp({
  at,
  source = 'Updated',
  className,
}: {
  at: string | Date | null | undefined;
  source?: string;
  className?: string;
}) {
  if (!at) return null;
  const rel = relativeTime(at);
  if (!rel) return null;
  // relativeTime returns a relative unit ("5m"/"3h"/"2d") for anything
  // under a week old, and an absolute short date ("Aug 31") beyond that —
  // only the former reads correctly with "ago" appended.
  const isRelativeUnit = rel === 'just now' || /^\d+[mhd]$/.test(rel);
  return (
    <span className={`inline-flex items-center gap-1 text-[10.5px] text-ink-faint tabular-nums ${className ?? ''}`}>
      <span className="w-1 h-1 rounded-full bg-ink-faint/60" aria-hidden />
      {source} · {isRelativeUnit ? (rel === 'just now' ? rel : `${rel} ago`) : rel}
    </span>
  );
}
