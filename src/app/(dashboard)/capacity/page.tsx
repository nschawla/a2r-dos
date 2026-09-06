import { requireOrgContext } from '@/lib/session';
import { isGlobalRole } from '@/lib/scoping';
import { loadCapacityCockpitData } from '@/server/queries/pages/dashboards';
import {
  resourceCapacityRow,
  blendedSummary,
  groupByPractice,
  type CapacityResourceInput,
} from '@/lib/capacity-engine';
import { CapacityCockpit } from '@/components/modules/capacity/CapacityCockpit';

const FORECAST_WEEKS = 52;

/**
 * Role-Based Scoped Filtering: before this, the Cockpit queried every
 * resource and every project in the tenant regardless of who was
 * looking — `role` (the tenant-console MembershipRole) only ever gated
 * the holiday-calendar edit button, not visibility. A Practice Director
 * now sees their own practice's roster and staffing exactly the way the
 * Control Tower already scopes their project list (see
 * src/lib/scoping.ts); ADMIN/VP_EXECUTIVE are unaffected — they were
 * already seeing the whole tenant.
 */
export default async function CapacityPage() {
  const context = await requireOrgContext();
  const { role, deliveryRole } = context;
  const isAdmin = role === 'OWNER' || role === 'ADMIN';

  const {
    window: { period, periodStart, periodEnd, firstWeek },
    resources,
    holidays,
    policies,
    actualsByResource,
    forecastSlots,
    activeProjects,
  } = await loadCapacityCockpitData(context);

  const holidayDates = holidays.map((h) => h.date);
  const actualByResource = new Map(actualsByResource.map((a) => [a.resourceId, a._sum.actualHours ?? 0]));

  // resourceId -> [project names]
  const projectsByResource = new Map<string, string[]>();
  for (const p of activeProjects) {
    const ids = new Set<string>(
      [p.practiceDirectorId, p.deliveryManagerId, p.projectManagerId, ...p.contributors.map((c) => c.resourceId)].filter(
        (x): x is string => !!x
      )
    );
    for (const rid of ids) {
      const list = projectsByResource.get(rid) ?? [];
      list.push(p.name);
      projectsByResource.set(rid, list);
    }
  }

  const engineInputs: CapacityResourceInput[] = resources.map((r) => ({
    id: r.id,
    name: r.name,
    psPractice: r.psPractice,
    fte: r.fte,
    startDate: r.startDate,
    endDate: r.endDate,
    targetUtilPct: r.rolePolicy?.targetUtilPct ?? r.targetUtilPct,
    isBillableHead: r.rolePolicy?.isBillableHead ?? true,
    billableHours: actualByResource.get(r.id) ?? 0,
    projectCount: r.projectCount,
  }));

  const rows = engineInputs.map((r) => resourceCapacityRow(r, period, holidayDates));
  const orgSummary = blendedSummary(rows);
  const practices = groupByPractice(rows);

  // 52-week forecast matrix
  const weeks: string[] = [];
  for (let i = 0; i < FORECAST_WEEKS; i++) {
    const d = new Date(firstWeek);
    d.setDate(d.getDate() + i * 7);
    weeks.push(d.toISOString().slice(0, 10));
  }
  const forecastByResource = new Map<string, Record<string, number>>();
  for (const s of forecastSlots) {
    const iso = s.weekDate.toISOString().slice(0, 10);
    const rec = forecastByResource.get(s.resourceId) ?? {};
    rec[iso] = (rec[iso] ?? 0) + s.forecastedHours;
    forecastByResource.set(s.resourceId, rec);
  }

  const forecastRows = resources.map((r) => ({
    id: r.id,
    name: r.name,
    psPractice: r.psPractice,
    fte: r.fte,
    weekly: weeks.map((w) => forecastByResource.get(r.id)?.[w] ?? 0),
  }));

  const concurrencyRows = rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      psPractice: row.psPractice,
      projectCount: row.projectCount,
      overloaded: row.overloaded,
      projects: (projectsByResource.get(row.id) ?? []).sort(),
    }))
    .sort((a, b) => b.projectCount - a.projectCount);

  return (
    <>
      <div>
        <h1 className="text-2xl font-display font-bold">Resource &amp; Capacity Cockpit</h1>
        <p className="text-ink-muted text-sm mt-1 max-w-2xl">
          Blended billable utilisation, concurrency load, and a 52-week staffing forecast — measured against the
          corporate holiday calendar and each role&rsquo;s target-utilisation policy.
        </p>
        <p id="capacity-scope-indicator" className="text-ink-faint text-xs mt-1.5">
          {isGlobalRole(deliveryRole)
            ? 'Tenant-wide — every practice.'
            : `Scoped to your practice — ${resources.length} resource${resources.length === 1 ? '' : 's'}.`}
        </p>
      </div>

      <CapacityCockpit
        isAdmin={isAdmin}
        periodLabel={`trailing 13 wks · ${periodStart.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        })} – ${periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
        orgSummary={orgSummary}
        practices={practices}
        resourceRows={rows}
        concurrencyRows={concurrencyRows}
        forecastWeeks={weeks}
        forecastRows={forecastRows}
        holidays={holidays.map((h) => ({ id: h.id, name: h.name, date: h.date.toISOString().slice(0, 10) }))}
        policies={policies.map((p) => ({
          id: p.id,
          roleName: p.roleName,
          targetUtilPct: p.targetUtilPct,
          isBillableHead: p.isBillableHead,
          headcount: resources.filter((r) => r.rolePolicy?.roleName === p.roleName).length,
        }))}
      />
    </>
  );
}
