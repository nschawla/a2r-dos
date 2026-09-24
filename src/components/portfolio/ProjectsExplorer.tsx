'use client';

/**
 * Portfolio Control Tower — the Active Projects registry, with a health
 * category filter above it (Icon & Pill Selector Hub,
 * docs/UI_DESIGN_SYSTEM.md §5). Purely client-side: `rows` arrives already
 * built server-side (see portfolio/page.tsx) carrying each project's
 * `healthCode` alongside its pre-rendered `<DataTable>` cells; clicking a
 * pill only narrows which of those rows get handed to `<DataTable>` — no
 * request, no scroll jump, nothing else on the page re-renders.
 */
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { DataTable, type DataTableColumn, type DataTableRow } from '@/components/ui/data-table';
import { PillSelectorRow } from '@/components/ui/pill-selector';
import { IconGrid, IconDot } from '@/components/ui/pill-icons';
import type { HealthCode } from '@/lib/calculations/types';
import { downloadCsv } from '@/lib/client/csv-export';
import { buildSearchBlob, matchesNlQuery, NL_SEARCH_SUGGESTIONS, type NlSearchableProject } from '@/lib/portfolio-nl-search';

export type ProjectExplorerRow = DataTableRow & {
  healthCode: HealthCode;
  /** Plain-text/plain-value fields PS-DOS IQ filters and exports against —
   * `cells` below is pre-rendered JSX and isn't searchable. */
  searchable: {
    name: string;
    client: string;
    pm: string;
    model: string;
    methodology: string;
    raidCount: number;
    unassigned: boolean;
  };
};

const HEALTH_LABEL: Record<HealthCode, string> = { G: 'Green', Y: 'Amber', R: 'Red' };
const HEALTH_DOT: Record<HealthCode, string> = { G: 'bg-success', Y: 'bg-warning', R: 'bg-critical' };

export function ProjectsExplorer({
  rows,
  columns,
  storageKey,
  caption,
  emptyMessage,
}: {
  rows: ProjectExplorerRow[];
  columns: DataTableColumn[];
  storageKey: string;
  caption?: string;
  emptyMessage: ReactNode;
}) {
  const [healthFilter, setHealthFilter] = useState<'all' | HealthCode>('all');
  const [query, setQuery] = useState('');

  const counts = useMemo(() => {
    const c: Record<HealthCode, number> = { G: 0, Y: 0, R: 0 };
    for (const r of rows) c[r.healthCode]++;
    return c;
  }, [rows]);

  // One lowercase blob + one NlSearchableProject per row, computed once
  // whenever `rows` changes — not on every keystroke.
  const searchIndex = useMemo(
    () =>
      new Map(
        rows.map((r) => [
          r.key,
          {
            blob: buildSearchBlob(r.searchable),
            project: {
              id: r.key,
              healthCode: r.healthCode,
              ...r.searchable,
            } satisfies NlSearchableProject,
          },
        ])
      ),
    [rows]
  );

  const healthFiltered = useMemo(
    () => (healthFilter === 'all' ? rows : rows.filter((r) => r.healthCode === healthFilter)),
    [rows, healthFilter]
  );

  // PS-DOS IQ — narrows healthFiltered further by the NL query. Kept as a
  // second pass over the (usually much smaller) health-filtered set rather
  // than folding both filters into one predicate, so each stays legible and
  // independently testable.
  const filtered = useMemo(() => {
    if (query.trim() === '') return healthFiltered;
    return healthFiltered.filter((r) => {
      const entry = searchIndex.get(r.key);
      return entry ? matchesNlQuery(entry.project, entry.blob, query) : false;
    });
  }, [healthFiltered, searchIndex, query]);

  function exportFilteredCsv() {
    const headers = ['Project', 'Client', 'PM', 'Model', 'Methodology', 'Health', 'Open RAID'];
    downloadCsv(
      `${storageKey}.csv`,
      headers,
      filtered.map((r) => ({
        Project: r.searchable.name,
        Client: r.searchable.client,
        PM: r.searchable.pm || 'Unassigned',
        Model: r.searchable.model,
        Methodology: r.searchable.methodology,
        Health: HEALTH_LABEL[r.healthCode],
        'Open RAID': String(r.searchable.raidCount),
      }))
    );
  }

  const healthOptions: HealthCode[] = ['G', 'Y', 'R'];

  return (
    <div className="flex flex-col gap-4">
      <PillSelectorRow
        aria-label="Filter projects by health"
        options={[
          { key: 'all', label: 'All', icon: <IconGrid />, count: rows.length },
          ...healthOptions
            .filter((h) => counts[h] > 0 || healthFilter === h)
            .map((h) => ({
              key: h,
              label: HEALTH_LABEL[h],
              icon: <IconDot className={HEALTH_DOT[h]} />,
              count: counts[h],
            })),
        ]}
        isActive={(k) => healthFilter === k}
        onSelect={(k) => setHealthFilter(k as 'all' | HealthCode)}
      />

      {/* PS-DOS IQ — client-side natural-language filter, see
          src/lib/portfolio-nl-search.ts for the exact grammar. Nothing here
          calls the server: `rows` is already the full data already loaded
          on the page, and every keystroke just re-runs the `filtered`
          memo above. */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint text-[13px]">
              ✨
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={'PS-DOS IQ — try "red", "unassigned", "raid>2", or a client/PM name…'}
              aria-label="Search projects with PS-DOS IQ"
              className="w-full rounded-full border border-border-soft bg-surface-1 pl-9 pr-8 py-1.5 text-[13px] placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand/50 transition-colors"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2 leading-none text-[13px]"
              >
                ×
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={exportFilteredCsv}
            disabled={filtered.length === 0}
            className="flex-none text-[11.5px] font-semibold text-ink-muted border border-border-soft rounded-full px-3 py-1.5 hover:text-ink hover:border-ink-faint transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            Export CSV
          </button>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap pl-1">
          {query.trim() !== '' && (
            <span className="text-[11px] text-ink-faint font-medium mr-1">
              {filtered.length} of {healthFiltered.length} match
            </span>
          )}
          {NL_SEARCH_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setQuery(s)}
              className="text-[10.5px] font-mono text-ink-faint border border-border-soft rounded-full px-2 py-0.5 hover:text-brand hover:border-brand/40 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <DataTable storageKey={storageKey} caption={caption} rows={filtered} columns={columns} emptyMessage={emptyMessage} />
    </div>
  );
}
