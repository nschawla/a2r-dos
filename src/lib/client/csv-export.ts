/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Client-only CSV export — a Blob + a synthetic download link, never a
 * network request. Shared by the Decision Center's local triage actions
 * (TriageRowActions.tsx, one row per export) and PS-DOS IQ's filtered
 * table export (ProjectsExplorer.tsx, many rows per export) — same
 * escaping, same download mechanics, one implementation.
 */

/** Minimal RFC 4180 escaping: wraps a field in quotes (doubling any
 * internal quotes) only when it contains a comma, quote, or newline. */
function escapeCsvField(v: string): string {
  return /["\n,]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** One header row followed by one row per entry in `rows`. Every row must
 * carry the same keys as `headers`, in order — callers build plain
 * `Record<string, string>` objects rather than passing arbitrary shapes, so
 * there's no ambiguity about column order or missing fields. */
export function downloadCsv(filename: string, headers: string[], rows: Record<string, string>[]): void {
  const lines = [
    headers.map(escapeCsvField).join(','),
    ...rows.map((row) => headers.map((h) => escapeCsvField(row[h] ?? '')).join(',')),
  ];
  const csv = `${lines.join('\n')}\n`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
