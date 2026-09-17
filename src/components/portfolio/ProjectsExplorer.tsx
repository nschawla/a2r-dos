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

export type ProjectExplorerRow = DataTableRow & { healthCode: HealthCode };

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

  const counts = useMemo(() => {
    const c: Record<HealthCode, number> = { G: 0, Y: 0, R: 0 };
    for (const r of rows) c[r.healthCode]++;
    return c;
  }, [rows]);

  const filtered = useMemo(
    () => (healthFilter === 'all' ? rows : rows.filter((r) => r.healthCode === healthFilter)),
    [rows, healthFilter]
  );

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

      <DataTable storageKey={storageKey} caption={caption} rows={filtered} columns={columns} emptyMessage={emptyMessage} />
    </div>
  );
}
