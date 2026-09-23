/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Assembles the Commercial Baseline Cockpit's portfolio-wide Executive
 * Triage (src/lib/commercial-triage.ts) — every scoped project's
 * contract/baseline snapshot plus its real Change Order activity, in two
 * bounded queries, no N+1. Sits alongside raid-triage.ts /
 * financial-triage.ts / schedule-triage.ts / resource-triage.ts (same
 * directory level, same direct-`tenantDb` + assertTenantContext DAL
 * convention).
 */
import { tenantDb, assertTenantContext } from '@/lib/dal';
import { getScopedProjectWhere } from '@/lib/scoping';
import type { OrgContext } from '@/lib/session';
import { buildCommercialTriage, type CommercialTriageProjectInput, type CommercialTriageResult } from '@/lib/commercial-triage';

export async function loadCommercialTriage(context: OrgContext): Promise<CommercialTriageResult> {
  assertTenantContext(context);
  const { organizationId } = context;

  const projects = await tenantDb.project.findMany({
    where: await getScopedProjectWhere(context),
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      bac: true,
      actualsCost: true,
      healthCost: true,
      healthScope: true,
      commercialModel: true,
      locked: true,
      updatedAt: true,
    },
  });

  const projectIds = projects.map((p) => p.id);
  // Real, already-executed Change Order activity — see the file header in
  // src/lib/commercial-triage.ts for why this (not a signed/unsigned
  // status PS-DOS doesn't track) is the real signal used here.
  const changeOrders =
    projectIds.length > 0
      ? await tenantDb.portfolioIntervention.findMany({
          where: { organizationId, projectId: { in: projectIds }, optionKey: 'change_order' },
          select: { projectId: true },
        })
      : [];
  const changeOrderProjectIds = new Set(changeOrders.map((c) => c.projectId));

  const inputs: CommercialTriageProjectInput[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    bac: Number(p.bac),
    actualsCost: Number(p.actualsCost),
    healthCost: p.healthCost,
    healthScope: p.healthScope,
    commercialModel: p.commercialModel,
    locked: p.locked,
    hasChangeOrderActivity: changeOrderProjectIds.has(p.id),
    updatedAt: p.updatedAt.toISOString(),
  }));

  return buildCommercialTriage(inputs);
}
