'use client';

/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * The "No-Scroll" data table — one shared primitive for every dense list in
 * the app (portfolio registries, rosters, RAID logs, financial ledgers).
 * Two disciplines it enforces so a table never forces horizontal scrolling
 * as the default experience:
 *
 *   1. Every column is either **core** (always rendered) or **optional**
 *      (toggleable via the "Customize Display" control, off by default when
 *      `defaultHidden` is set). A table's core set is chosen by its caller
 *      to comfortably fit a standard viewport on its own — optional columns
 *      are an opt-in a viewer reaches for, never a surprise the page ambushes
 *      them with.
 *   2. Long text truncates with an ellipsis (and a native `title` tooltip)
 *      instead of forcing the column wider than its budget.
 *
 * `overflow-x-auto` still wraps the table as a safety net (a very narrow
 * viewport, or a viewer who has switched on every optional column, can still
 * scroll) — it's a fallback for an edge case, not the load-bearing mechanism.
 *
 * Column visibility persists per-table in localStorage. Hydration-safe the
 * same way Sidebar.tsx / useRbacPreview are: the FIRST render (server and
 * client alike) always uses the caller's default visibility — no dependence
 * on localStorage until a `useEffect` restores a prior customization after
 * mount, so there is nothing for server and client to ever disagree on.
 *
 * IMPORTANT — RSC boundary: this is a Client Component, and its caller is
 * almost always a Server Component page. `DataTableColumn` is deliberately
 * metadata-only (header/width/visibility) with NO render function — a
 * function is not serializable across the Server→Client props boundary and
 * Next.js throws at runtime the moment one is passed ("Something went
 * wrong" with no useful client-side message). Each row instead carries its
 * cells PRE-RENDERED as `ReactNode` (a Server Component rendering JSX and
 * handing it to a Client Component as a prop value — as opposed to a raw
 * function — is exactly the supported, documented pattern). Build a row's
 * `cells` map in the calling page, not inside this component.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';

export interface DataTableColumn {
  key: string;
  header: string;
  className?: string;
  align?: 'left' | 'right' | 'center';
  /** Hideable via "Customize Display". Omit for a column the table can't
   * function without (name, primary identifier, the row's action link). */
  optional?: boolean;
  /** Only meaningful with `optional` — starts unchecked; the viewer opts in. */
  defaultHidden?: boolean;
}

export interface DataTableRow {
  key: string;
  /** One pre-rendered ReactNode per column key. */
  cells: Record<string, ReactNode>;
  /** Plain-text tooltip per column key, for a cell whose rendered content
   * (a truncated span, a badge) isn't itself a full-text title. */
  cellTitles?: Record<string, string | null | undefined>;
  rowClassName?: string;
}

function defaultVisibility(columns: DataTableColumn[]): Record<string, boolean> {
  const v: Record<string, boolean> = {};
  for (const c of columns) v[c.key] = !(c.optional && c.defaultHidden);
  return v;
}

export function DataTable({
  columns,
  rows,
  /** Unique per distinct table on the site — persists column choices
   * separately for, say, the portfolio registry vs. the capacity roster. */
  storageKey,
  emptyMessage = 'Nothing to show yet.',
  caption,
}: {
  columns: DataTableColumn[];
  rows: DataTableRow[];
  storageKey: string;
  emptyMessage?: ReactNode;
  /** Visually hidden `<caption>` for assistive tech — the table's purpose,
   * since the visual heading usually lives in the surrounding card. */
  caption?: string;
}) {
  const [visible, setVisible] = useState<Record<string, boolean>>(() => defaultVisibility(columns));
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hasOptional = columns.some((c) => c.optional);
  const storageId = `a2r_table_cols_${storageKey}`;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageId);
      if (!stored) return;
      const parsed = JSON.parse(stored) as Record<string, boolean>;
      // Merge onto the current default rather than trusting the stored
      // object wholesale — a column added to the table after a viewer's
      // last visit should still show up (defaultVisibility's own value for
      // it), not silently vanish because it's absent from an old save.
      setVisible((cur) => ({ ...cur, ...parsed }));
    } catch {
      /* ignore */
    }
    // storageId is derived from a stable prop; columns' identity is stable
    // for a given page render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageId]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function toggle(key: string) {
    setVisible((cur) => {
      const next = { ...cur, [key]: !cur[key] };
      try {
        window.localStorage.setItem(storageId, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const visibleColumns = columns.filter((c) => visible[c.key] !== false);

  return (
    <div className="flex flex-col gap-2">
      {hasOptional && (
        <div className="flex justify-end">
          <div className="relative" ref={ref}>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={open}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border-soft text-[11.5px] font-semibold text-ink-muted hover:text-ink hover:border-ink-faint transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-3.5 w-3.5">
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="4" y1="12" x2="14" y2="12" />
                <line x1="4" y1="18" x2="17" y2="18" />
                <circle cx="18" cy="12" r="2" fill="currentColor" stroke="none" />
                <circle cx="16" cy="18" r="2" fill="currentColor" stroke="none" />
              </svg>
              Customize Display
            </button>
            {open && (
              <div
                role="menu"
                aria-label="Choose visible columns"
                className="absolute right-0 top-full mt-1.5 w-56 bg-surface-1 border border-border-soft rounded-md shadow-elevated overflow-hidden z-20 py-1"
              >
                <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-ink-faint font-semibold border-b border-border">
                  Optional columns
                </div>
                {columns
                  .filter((c) => c.optional)
                  .map((c) => (
                    <label
                      key={c.key}
                      className="flex items-center gap-2 px-3 py-1.5 text-[12.5px] text-ink hover:bg-surface-2 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={visible[c.key] !== false}
                        onChange={() => toggle(c.key)}
                        className="accent-brand"
                      />
                      {c.header}
                    </label>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide border-b border-border">
              {visibleColumns.map((c) => (
                <th
                  key={c.key}
                  className={clsx(
                    'py-2.5 pr-4 font-semibold',
                    c.align === 'right' && 'text-right',
                    c.align === 'center' && 'text-center',
                    c.className
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length} className="py-6 text-center text-ink-muted text-sm">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.key}
                  className={clsx(
                    'border-b border-border/60 last:border-0 hover:bg-surface-2/60 transition-colors',
                    row.rowClassName
                  )}
                >
                  {visibleColumns.map((c) => (
                    <td
                      key={c.key}
                      title={row.cellTitles?.[c.key] ?? undefined}
                      className={clsx(
                        'py-3 pr-4 align-top',
                        c.align === 'right' && 'text-right',
                        c.align === 'center' && 'text-center',
                        c.className
                      )}
                    >
                      {row.cells[c.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** A single truncating cell body — the common case of "one line of text,
 * clipped with an ellipsis rather than pushing the column wider." Pair with
 * a row's `cellTitles` entry so the full value still surfaces as a tooltip. */
export function TruncatedCell({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx('block truncate', className)}>{children}</span>;
}
