import Link from 'next/link';
import { requireOrgContext } from '@/lib/session';
import { loadProjectPickerList } from '@/server/queries/pages/project-modules';
import { getProjectHealth } from '@/server/queries/health';
import { ProjectPickerSearch } from '@/components/dashboard/project-picker-search';

const HEALTH_RANK: Record<string, number> = { R: 0, Y: 1, G: 2 };

/**
 * Shared "pick a project" landing for module index routes
 * (/commercial-baseline, /audit, /raid, /financials, /schedule) — each
 * module operates on one project at a time, addressed as
 * /<module>/[projectId].
 *
 * Role-Based Scoped Filtering: the list is built from
 * `getScopedProjectWhere`, the same scoping every one of these modules'
 * own `/<module>/[projectId]` detail pages already enforces on write via
 * `authorizeProjectEdit` — before this, the picker itself showed every
 * project in the tenant to every viewer, so a Delivery Manager or Project
 * Manager could browse (read-only) into another practice's financials or
 * RAID log even though they could never edit it. Now the picker never
 * lists what the viewer isn't in scope for in the first place.
 *
 * User-experience pass (Sept 2026): a viewer opening RAID or Schedule to
 * check on a specific engagement had no way to tell, from this list, which
 * one actually needed them — every row looked identical regardless of
 * health. Red/Amber engagements now carry the same status dot as the
 * Portfolio table and sort to the top, so the ones needing attention are
 * the first thing the eye lands on, not something you discover five
 * clicks later.
 *
 * Type-to-filter pass (v1.51.0, docs/UI_DESIGN_SYSTEM.md §18): a plain
 * scrollable list of every in-scope engagement stopped working once a
 * tenant had 50–100+ active ones — this still does the data fetch,
 * scoping, and health-sort here (server-side), but hands the result to
 * `<ProjectPickerSearch>` (a small client component) to render as a
 * type-to-filter combobox instead of a wall of rows.
 */
export async function ProjectPicker({
  modulePath,
  moduleLabel,
  moduleDesc,
}: {
  modulePath: string;
  moduleLabel: string;
  moduleDesc: string;
}) {
  const context = await requireOrgContext();
  const projects = await loadProjectPickerList(context);

  const rows = projects
    .map((p) => ({ ...p, health: getProjectHealth(p).code }))
    .sort((a, b) => HEALTH_RANK[a.health]! - HEALTH_RANK[b.health]!);
  const attentionCount = rows.filter((p) => p.health !== 'G').length;

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">{moduleLabel}</div>
          <p className="text-[12.5px] text-ink-muted">{moduleDesc}</p>
        </div>
        {attentionCount > 0 && (
          <span className="flex-none badge !border-0 !py-1 !px-2.5 bg-critical-soft text-critical text-[11px]">
            {attentionCount} need{attentionCount === 1 ? 's' : ''} attention
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-ink-muted text-sm">
          No projects yet —{' '}
          <Link href="/portfolio" className="text-brand">
            register one from the Control Tower
          </Link>
          .
        </p>
      ) : (
        <ProjectPickerSearch modulePath={modulePath} rows={rows} />
      )}
    </div>
  );
}
