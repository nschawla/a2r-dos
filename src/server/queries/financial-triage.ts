/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Assembles the Financial Realization Cockpit's portfolio-wide Executive
 * Triage (src/lib/financial-triage.ts) — every scoped project's BAC/
 * Actuals/EAC-variance snapshot in one bounded query, no N+1. Sits
 * alongside src/server/queries/raid-triage.ts (same directory level, same
 * direct-`tenantDb` + assertTenantContext DAL convention).
 *
 * Reads the same denormalized EVM snapshot (Project.bac/actualsCost/vac/
 * healthCost/healthScope) that src/lib/executive-triage.ts already treats
 * as the portfolio-view source of truth, rather than re-running the full
 * per-project EAC engine here — consistent with that existing convention,
 * and the reason this stays "lightning fast" per the feature's own spec.
 */
import { tenantDb, assertTenantContext } from '@/lib/dal';
import { getScopedProjectWhere } from '@/lib/scoping';
import type { OrgContext } from '@/lib/session';
import { buildFinancialTriage, type FinancialTriageProjectInput, type FinancialTriageResult } from '@/lib/financial-triage';

export async function loadFinancialTriage(context: OrgContext): Promise<FinancialTriageResult> {
  assertTenantContext(context);

  const projects = await tenantDb.project.findMany({
    where: await getScopedProjectWhere(context),
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      bac: true,
      actualsCost: true,
      vac: true,
      healthCost: true,
      healthScope: true,
      commercialModel: true,
      clientTier: true,
      updatedAt: true,
      schedulePhases: { select: { status: true } },
      financials: { select: { cost: true, role: { select: { employmentType: true } } } },
    },
  });

  const inputs: FinancialTriageProjectInput[] = projects.map((p) => {
    const totalCost = p.financials.reduce((s, f) => s + Number(f.cost), 0);
    const contractorCost = p.financials.reduce(
      (s, f) => s + (f.role?.employmentType === 'CONTRACTOR' ? Number(f.cost) : 0),
      0
    );
    return {
      id: p.id,
      name: p.name,
      bac: Number(p.bac),
      actualsCost: Number(p.actualsCost),
      vac: Number(p.vac),
      healthCost: p.healthCost,
      billingType: p.commercialModel,
      clientTier: p.clientTier,
      scopeAtRisk: p.healthScope === 'Red',
      milestoneDelayed: p.schedulePhases.some((s) => s.status === 'DELAYED'),
      contractorCostPct: totalCost > 0 ? (contractorCost / totalCost) * 100 : 0,
      updatedAt: p.updatedAt.toISOString(),
    };
  });

  return buildFinancialTriage(inputs);
}
