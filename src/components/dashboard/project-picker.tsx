import Link from 'next/link';
import { requireOrgContext } from '@/lib/session';
import { loadProjectPickerList } from '@/server/queries/pages/project-modules';
import { getProjectHealth } from '@/server/queries/health';

const HEALTH_DOT: Record<string, string> = { G: 'bg-success', Y: 'bg-warning', R: 'bg-critical' };
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
          <h2 className="text-[15.5px] font-bold mb-1">Select an engagement</h2>
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
        <ul className="flex flex-col gap-2">
          {rows.map((p) => (
            <li key={p.id}>
              <Link
                href={`${modulePath}/${p.id}`}
                className={`flex items-center gap-3 rounded-2xl border-2 px-3.5 py-2.5 text-sm transition-all duration-150 ease-out ${
                  p.health === 'R'
                    ? 'border-critical/30 bg-critical-soft/40 hover:border-critical/60'
                    : 'border-border-soft bg-surface-1 hover:border-border hover:bg-surface-2'
                }`}
              >
                <span className={`flex-none status-dot ${HEALTH_DOT[p.health]}`} title={`Health: ${p.health}`} />
                <span className="min-w-0 flex-1 font-semibold truncate">{p.name}</span>
                <span className="flex-none text-ink-muted text-xs">{p.client || '—'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
