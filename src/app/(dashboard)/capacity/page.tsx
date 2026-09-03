import { requireOrgContext } from '@/lib/session';
import { db } from '@/lib/db';
import {
  mondayOf,
  startOfDay,
  resourceCapacityRow,
  blendedSummary,
  groupByPractice,
  type CapacityResourceInput,
  type DateRange,
} from '@/lib/capacity-engine';
import { CapacityCockpit } from '@/components/modules/capacity/CapacityCockpit';

const FORECAST_WEEKS = 52;

export default async function CapacityPage() {
  const { organizationId, role } = await requireOrgContext();
  const isAdmin = role === 'OWNER' || role === 'ADMIN';

  const now = new Date();
  // Trailing 13 weeks — the standard PS "trailing-quarter" utilisation window.
  const periodEnd = startOfDay(now);
  const periodStart = mondayOf(now);
  periodStart.setDate(periodStart.getDate() - 13 * 7);
  const period: DateRange = { start: periodStart, end: periodEnd };

  const firstWeek = mondayOf(now);
  const lastWeekExclusive = new Date(firstWeek);
  lastWeekExclusive.setDate(lastWeekExclusive.getDate() + FORECAST_WEEKS * 7);

  const [resources, holidays, policies, actualsByResource, forecastSlots, activeProjects] = await Promise.all([
    db.resource.findMany({
      where: { organizationId },
      orderBy: [{ psPractice: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        psPractice: true,
        fte: true,
        startDate: true,
        endDate: true,
        targetUtilPct: true,
        projectCount: true,
        rolePolicy: { select: { roleName: true, targetUtilPct: true, isBillableHead: true } },
      },
    }),
    db.organizationHoliday.findMany({ where: { organizationId }, orderBy: { date: 'asc' } }),
    db.roleUtilizationPolicy.findMany({ where: { organizationId }, orderBy: { roleName: 'asc' } }),
    db.weeklyAssignmentSlot.groupBy({
      by: ['resourceId'],
      where: { organizationId, weekDate: { gte: periodStart, lte: periodEnd } },
      _sum: { actualHours: true },
    }),
    db.weeklyAssignmentSlot.findMany({
      where: { organizationId, weekDate: { gte: firstWeek, lt: lastWeekExclusive } },
      select: { resourceId: true, weekDate: true, forecastedHours: true },
    }),
    db.project.findMany({
      where: { organizationId, hierarchyLevel: { not: 'PARENT' } },
      select: {
        id: true,
        name: true,
        practiceDirectorId: true,
        deliveryManagerId: true,
        projectManagerId: true,
        contributors: { select: { resourceId: true } },
      },
    }),
  ]);

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
