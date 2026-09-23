/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Assembles the Resource & Capacity Cockpit's portfolio-wide Executive
 * Triage (src/lib/resource-triage.ts) — every scoped billable-head
 * resource's utilization row (via capacity-engine.ts, the same math
 * src/server/queries/capacity.ts's loadCapacityRows already runs) plus
 * the distinct active projects each one touches, in a small bounded set
 * of queries. Sits alongside raid-triage.ts / financial-triage.ts /
 * schedule-triage.ts (same directory level, same direct-`tenantDb` +
 * assertTenantContext DAL convention).
 *
 * Resource scoping (getScopedResourceWhere) is a distinct axis from
 * project scoping (getScopedProjectWhere) — see src/lib/scoping.ts — so
 * both are used here: the former for "which resources can this viewer
 * see," the latter for "which of their active projects count toward the
 * distinct-projects-touched figure."
 */
import { tenantDb, assertTenantContext } from '@/lib/dal';
import { getScopedResourceWhere, getScopedProjectWhere } from '@/lib/scoping';
import type { OrgContext } from '@/lib/session';
import { resourceCapacityRow, type CapacityResourceInput } from '@/lib/capacity-engine';
import { trailing13Weeks } from './capacity';
import { buildResourceTriage, type ResourceTriageInput, type ResourceTriageResult } from '@/lib/resource-triage';

export async function loadResourceTriage(context: OrgContext): Promise<ResourceTriageResult> {
  assertTenantContext(context);
  const { organizationId } = context;
  const period = trailing13Weeks();

  const [resources, holidays, actuals, activeProjects] = await Promise.all([
    tenantDb.resource.findMany({
      where: getScopedResourceWhere(context),
      select: {
        id: true,
        name: true,
        psPractice: true,
        fte: true,
        startDate: true,
        endDate: true,
        targetUtilPct: true,
        projectCount: true,
        role: { select: { name: true } },
        rolePolicy: { select: { targetUtilPct: true, isBillableHead: true } },
      },
    }),
    tenantDb.organizationHoliday.findMany({ where: { organizationId }, select: { date: true } }),
    tenantDb.weeklyAssignmentSlot.groupBy({
      by: ['resourceId'],
      where: { organizationId, weekDate: { gte: period.start, lte: period.end } },
      _sum: { actualHours: true },
    }),
    tenantDb.project.findMany({
      where: { ...(await getScopedProjectWhere(context)), hierarchyLevel: { not: 'PARENT' } },
      select: { id: true, practiceDirectorId: true, deliveryManagerId: true, projectManagerId: true, contributors: { select: { resourceId: true } } },
    }),
  ]);

  const actualByResource = new Map(actuals.map((a) => [a.resourceId, a._sum.actualHours ?? 0]));
  const holidayDates = holidays.map((h) => h.date);

  // resourceId -> distinct active-project ids (PD/DM/PM/contributor) —
  // the same "who's really on this project" union the Capacity Cockpit
  // page itself already builds for its Concurrency Radar tab.
  const projectIdsByResource = new Map<string, Set<string>>();
  for (const p of activeProjects) {
    const ids = new Set<string>(
      [p.practiceDirectorId, p.deliveryManagerId, p.projectManagerId, ...p.contributors.map((c) => c.resourceId)].filter(
        (x): x is string => !!x
      )
    );
    for (const rid of ids) {
      const set = projectIdsByResource.get(rid) ?? new Set<string>();
      set.add(p.id);
      projectIdsByResource.set(rid, set);
    }
  }

  const inputs: ResourceTriageInput[] = resources.map((r) => {
    const capacityInput: CapacityResourceInput = {
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
    };
    const row = resourceCapacityRow(capacityInput, period, holidayDates);

    return {
      id: r.id,
      name: r.name,
      psPractice: r.psPractice,
      roleName: r.role?.name ?? null,
      isBillableHead: row.isBillableHead,
      fte: row.fte,
      availableHours: row.availableHours,
      billableHours: row.billableHours,
      utilizationPct: row.utilizationPct,
      targetUtilPct: row.targetUtilPct,
      attainmentPct: row.attainmentPct,
      projectCount: row.projectCount,
      overloaded: row.overloaded,
      projectIds: [...(projectIdsByResource.get(r.id) ?? [])],
    };
  });

  return buildResourceTriage(inputs);
}
