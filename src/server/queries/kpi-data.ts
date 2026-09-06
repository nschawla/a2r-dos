/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Custom KPI Definition Engine — the data adapter. Builds a
 * `KpiMetricValues` object (src/lib/kpi-engine.ts) from real tenant data,
 * reusing the existing calculation engines rather than recomputing
 * anything: financials come from the caller's own already-computed
 * `PortfolioSummary` (Control Tower and the Executive Hub both compute
 * one already via getScopedPortfolioSummary/getScopedProjectsForUser —
 * passing it in here avoids a second pass over the same projects), and
 * capacity comes from the existing Resource & Capacity queries.
 *
 * Scope note: `scopedProjectIds` should be whatever the *calling page*
 * already considers in scope for the viewer — Control Tower's
 * role/practice-scoped list (src/lib/scoping.ts) or the Executive Hub's
 * deliberately tenant-wide one (see that page's own doc comment on why
 * it isn't practice-filtered). This adapter doesn't make scoping
 * decisions itself, only shapes whatever project set it's handed.
 *
 * The capacity metrics are the one exception: `getPortfolioCapacity` is
 * tenant-wide regardless of caller, the same simplification the Control
 * Tower's own pre-existing "Blended Billable Utilization" stat card
 * already makes (src/server/queries/capacity.ts has no practice-scoped
 * variant yet) — not a regression introduced here.
 */
import { db } from '@/lib/db';
import { getPortfolioCapacity } from '@/server/queries/capacity';
import type { PortfolioSummary } from '@/lib/calculations/portfolio';
import type { KpiMetricValues } from '@/lib/kpi-engine';
import { isRbacPersona } from '@/lib/governance/rbacMatrix';
import type { CustomKpiDef, KpiDataSource, KpiFormulaType } from '@/types/kpi';

/**
 * Read-only, ungated — every dashboard that renders KPI cards (Control
 * Tower, the Executive Hub) needs this for whoever is looking, not just
 * tenant Admins. Deliberately separate from
 * src/server/actions/kpis.ts#listCustomKpis, which *is* gated
 * (`admin:governance`) because it backs the management UI at
 * /admin/kpis — seeing a card here is display, not administration, the
 * same distinction the rest of this app draws between reading a
 * governance-scoped nav item and editing the governance config itself.
 */
export async function getVisibleCustomKpis(organizationId: string): Promise<CustomKpiDef[]> {
  const rows = await db.customKpi.findMany({ where: { organizationId }, orderBy: { createdAt: 'asc' } });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    dataSource: row.dataSource as KpiDataSource,
    metricKey: row.metricKey as CustomKpiDef['metricKey'],
    formulaType: row.formulaType as KpiFormulaType,
    // v1.11.0 — thresholds are NUMERIC; the KPI engine works in `number`.
    targetValue: row.targetValue.toNumber(),
    warningValue: row.warningValue.toNumber(),
    targetPersonas: row.targetPersonas.filter(isRbacPersona),
  }));
}

export async function getKpiMetricValues(
  organizationId: string,
  scopedProjectIds: string[],
  portfolioSummary: PortfolioSummary
): Promise<KpiMetricValues> {
  const [phases, criticalOpenCount, escalatedOpenCount, capacity] = await Promise.all([
    scopedProjectIds.length
      ? db.schedulePhase.findMany({
          where: { projectId: { in: scopedProjectIds } },
          select: { status: true },
        })
      : Promise.resolve([]),
    scopedProjectIds.length
      ? db.raidEntry.count({
          where: { projectId: { in: scopedProjectIds }, severity: 'CRITICAL', status: { not: 'CLOSED' } },
        })
      : Promise.resolve(0),
    scopedProjectIds.length
      ? db.raidEntry.count({
          where: { projectId: { in: scopedProjectIds }, escalate: true, status: { not: 'CLOSED' } },
        })
      : Promise.resolve(0),
    getPortfolioCapacity(organizationId),
  ]);

  const delayedPhaseCount = phases.filter((p) => p.status === 'DELAYED').length;
  const onTrackPhasePct = phases.length > 0 ? ((phases.length - delayedPhaseCount) / phases.length) * 100 : null;

  return {
    blendedMarginPct: portfolioSummary.hasMargin ? portfolioSummary.avgMarginPct : null,
    highRiskProjectCount: portfolioSummary.highRiskCount,
    onTrackPhasePct,
    delayedPhaseCount: phases.length > 0 ? delayedPhaseCount : null,
    openCriticalRaidCount: criticalOpenCount,
    escalatedRaidCount: escalatedOpenCount,
    blendedUtilizationPct: capacity.summary.utilizationPct,
    overloadedResourceCount: capacity.overloadedCount,
  };
}
