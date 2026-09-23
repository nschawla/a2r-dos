/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Assembles the Schedule & Milestones Cockpit's portfolio-wide Executive
 * Triage (src/lib/schedule-triage.ts) — every scoped project's phase
 * timeline plus its open high-severity Dependency risk, in two bounded
 * queries, no N+1. Sits alongside src/server/queries/raid-triage.ts and
 * financial-triage.ts (same directory level, same direct-`tenantDb` +
 * assertTenantContext DAL convention).
 */
import { tenantDb, assertTenantContext } from '@/lib/dal';
import { getScopedProjectWhere } from '@/lib/scoping';
import type { OrgContext } from '@/lib/session';
import { toScheduleInput } from '@/server/queries/calc-adapters';
import { buildScheduleTriage, type ScheduleTriageProjectInput, type ScheduleTriageResult } from '@/lib/schedule-triage';

export async function loadScheduleTriage(context: OrgContext): Promise<ScheduleTriageResult> {
  assertTenantContext(context);
  const { organizationId } = context;

  const projects = await tenantDb.project.findMany({
    where: await getScopedProjectWhere(context),
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      healthScope: true,
      healthRes: true,
      updatedAt: true,
      schedulePhases: {
        select: { phaseKey: true, status: true, plannedStart: true, plannedEnd: true, actualStart: true, actualEnd: true, pctComplete: true },
      },
    },
  });

  const projectIds = projects.map((p) => p.id);
  // A real, already-logged blocker — never inferred from dates. Type
  // DEPENDENCY at CRITICAL/HIGH severity, still open, mirrors the same
  // population rule src/server/queries/raid-triage.ts uses for its own
  // Red band.
  const dependencyRisks =
    projectIds.length > 0
      ? await tenantDb.raidEntry.findMany({
          where: { organizationId, projectId: { in: projectIds }, type: 'DEPENDENCY', severity: { in: ['CRITICAL', 'HIGH'] }, status: { not: 'CLOSED' } },
          select: { projectId: true },
        })
      : [];
  const dependencyRiskProjectIds = new Set(dependencyRisks.map((r) => r.projectId));

  const inputs: ScheduleTriageProjectInput[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    phases: toScheduleInput(p.schedulePhases).phases,
    healthScope: p.healthScope,
    healthRes: p.healthRes,
    openDependencyRisk: dependencyRiskProjectIds.has(p.id),
    updatedAt: p.updatedAt.toISOString(),
  }));

  return buildScheduleTriage(inputs);
}
