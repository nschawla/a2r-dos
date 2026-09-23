/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Assembles the RAID Cockpit's portfolio-wide Executive Triage
 * (src/lib/raid-triage.ts) — every open, Red/Amber (CRITICAL/HIGH/MED)
 * RAID item across the viewer's scoped projects, in one query. Sits
 * alongside src/server/queries/executive-triage.ts and decision-context.ts
 * (same directory level, same direct-`tenantDb` + assertTenantContext DAL
 * convention).
 */
import { tenantDb, assertTenantContext } from '@/lib/dal';
import { getScopedProjectWhere } from '@/lib/scoping';
import type { OrgContext } from '@/lib/session';
import { buildRaidTriage, type RaidTriageItemInput, type RaidTriageResult } from '@/lib/raid-triage';

export async function loadRaidTriage(context: OrgContext): Promise<RaidTriageResult> {
  assertTenantContext(context);
  const { organizationId } = context;

  const entries = await tenantDb.raidEntry.findMany({
    where: {
      organizationId,
      status: { not: 'CLOSED' },
      severity: { in: ['CRITICAL', 'HIGH', 'MED'] },
      project: await getScopedProjectWhere(context),
    },
    orderBy: [{ targetDate: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      projectId: true,
      project: { select: { name: true } },
      type: true,
      title: true,
      description: true,
      impact: true,
      severity: true,
      targetDate: true,
      owner: { select: { name: true } },
      updatedAt: true,
    },
  });

  const now = Date.now();
  const inputs: RaidTriageItemInput[] = entries.map((e) => ({
    id: e.id,
    projectId: e.projectId,
    projectName: e.project.name,
    type: e.type,
    title: e.title,
    description: e.description,
    impact: e.impact,
    severity: e.severity,
    targetDate: e.targetDate?.toISOString() ?? null,
    overdue: !!(e.targetDate && e.targetDate.getTime() < now),
    ownerName: e.owner?.name ?? null,
    updatedAt: e.updatedAt.toISOString(),
  }));

  return buildRaidTriage(inputs);
}
