import { db } from '@/lib/db';
import {
  startOfDay,
  mondayOf,
  resourceCapacityRow,
  blendedSummary,
  groupByPractice,
  type BlendedCapacitySummary,
  type CapacityResourceInput,
  type DateRange,
  type ResourceCapacityRow,
} from '@/lib/capacity-engine';

/** The trailing-13-week reporting window — the standard PS utilisation period. */
export function trailing13Weeks(now = new Date()): DateRange {
  const start = mondayOf(now);
  start.setDate(start.getDate() - 13 * 7);
  return { start, end: startOfDay(now) };
}

/**
 * Loads every resource's capacity row for one org over `period` (default:
 * trailing 13 weeks). Shared by `getBlendedUtilization`, the Capacity
 * Cockpit page, and the Executive Briefing so all three agree.
 */
export async function loadCapacityRows(
  organizationId: string,
  period: DateRange = trailing13Weeks()
): Promise<ResourceCapacityRow[]> {
  const [resources, holidays, actuals] = await Promise.all([
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
        rolePolicy: { select: { targetUtilPct: true, isBillableHead: true } },
      },
    }),
    db.organizationHoliday.findMany({ where: { organizationId }, select: { date: true } }),
    db.weeklyAssignmentSlot.groupBy({
      by: ['resourceId'],
      where: { organizationId, weekDate: { gte: period.start, lte: period.end } },
      _sum: { actualHours: true },
    }),
  ]);

  const actualByResource = new Map(actuals.map((a) => [a.resourceId, a._sum.actualHours ?? 0]));
  const holidayDates = holidays.map((h) => h.date);

  const inputs: CapacityResourceInput[] = resources.map((r) => ({
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

  return inputs.map((r) => resourceCapacityRow(r, period, holidayDates));
}

/**
 * Org-wide blended billable utilisation over the trailing 13 weeks — the
 * same number the Resource & Capacity Cockpit's Tab 1 headline shows. Kept
 * here so the PS Control Tower KPI card and the Cockpit never disagree.
 */
export async function getBlendedUtilization(organizationId: string): Promise<{
  utilizationPct: number;
  targetUtilPct: number;
  attainmentPct: number;
  headcountFte: number;
}> {
  const rows = await loadCapacityRows(organizationId);
  const summary = blendedSummary(rows);
  return {
    utilizationPct: summary.utilizationPct,
    targetUtilPct: summary.targetUtilPct,
    attainmentPct: summary.attainmentPct,
    headcountFte: summary.headcountFte,
  };
}

export interface PortfolioCapacity {
  summary: BlendedCapacitySummary;
  practices: { practice: string; summary: BlendedCapacitySummary }[];
  overloaded: { id: string; name: string; psPractice: string; projectCount: number; engagements: string[] }[];
  overloadedCount: number;
  benchCount: number;
  avgConcurrency: number;
}

/** Everything the Executive Briefing's resource-economics section needs. */
export async function getPortfolioCapacity(organizationId: string): Promise<PortfolioCapacity> {
  const [rows, activeProjects] = await Promise.all([
    loadCapacityRows(organizationId),
    db.project.findMany({
      where: { organizationId, hierarchyLevel: { not: 'PARENT' } },
      select: {
        name: true,
        practiceDirectorId: true,
        deliveryManagerId: true,
        projectManagerId: true,
        contributors: { select: { resourceId: true } },
      },
    }),
  ]);

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

  const overloaded = rows
    .filter((r) => r.overloaded)
    .sort((a, b) => b.projectCount - a.projectCount)
    .map((r) => ({
      id: r.id,
      name: r.name,
      psPractice: r.psPractice,
      projectCount: r.projectCount,
      engagements: (projectsByResource.get(r.id) ?? []).sort(),
    }));

  return {
    summary: blendedSummary(rows),
    practices: groupByPractice(rows).map((g) => ({ practice: g.practice, summary: g.summary })),
    overloaded,
    overloadedCount: overloaded.length,
    benchCount: rows.filter((r) => r.projectCount === 0).length,
    avgConcurrency: rows.length ? rows.reduce((s, r) => s + r.projectCount, 0) / rows.length : 0,
  };
}
