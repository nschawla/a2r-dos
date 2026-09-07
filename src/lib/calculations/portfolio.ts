/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 * Proprietary and confidential. Licensed, not sold, under the A2R Delivery
 * OS Terms of Service & EULA (/terms) — see that document for the full
 * customer-data vs. A2R-IP ownership split and reverse-engineering
 * restrictions this file falls under.
 */

/**
 * Portfolio-level rollups for the PS Control Tower. Ported from the
 * prototype's `computePortfolio` and `computeProgramRollup`.
 *
 * Both functions here take an explicit `roles` (rate-card) parameter that
 * the prototype's equivalents did not — the prototype read `state.org.roles`
 * as a module-level global. Since this engine has no shared state, and
 * sizing/EAC math is impossible without the rate card, `roles` is threaded
 * through explicitly. Everything else matches the original formulas exactly.
 */
import { computeAuditProgress, computeProjectHealth } from './audit';
import { computeEacSummary } from './financials';
import { d, money } from './money';
import { computeTotalsFor } from './sizing';
import type { AuditEntryInput, HealthCode, HierarchyLevel, RateRole, SizingProjectInput } from './types';
import type { FinancialActualInput } from './types';

export interface PortfolioProjectInput {
  id: string;
  hierarchyLevel: HierarchyLevel;
  locked: boolean;
  sizing: SizingProjectInput;
  auditEntries: AuditEntryInput[];
}

export interface PortfolioSummary {
  totalValue: number;
  avgMarginPct: number;
  /** false when no project has any sized hours yet — avgMarginPct is meaningless (0) in that case. */
  hasMargin: boolean;
  avgCompliancePct: number;
  highRiskCount: number;
  projectCount: number;
}

/**
 * Total contract value, average baseline margin (only across projects with
 * sized hours), average audit compliance, and a count of Red-health
 * projects. Parent Program containers are structural groupings, not
 * individually delivered/audited engagements, so they're excluded from the
 * compliance and high-risk counts — an unsized, unaudited container
 * shouldn't drag down portfolio health — but their (typically zero)
 * contract value still rolls into totalValue for completeness.
 */
export function computePortfolioSummary(projects: PortfolioProjectInput[], roles: RateRole[]): PortfolioSummary {
  let totalValueD = d(0);
  let marginSum = 0;
  let marginCount = 0;
  let complianceSum = 0;
  let complianceCount = 0;
  let highRisk = 0;

  for (const p of projects) {
    const totals = computeTotalsFor(p.sizing, roles);
    totalValueD = totalValueD.plus(d(totals.contractValue));
    if (totals.totalHours > 0) {
      marginSum += totals.marginPct;
      marginCount++;
    }
    if (p.hierarchyLevel !== 'parent') {
      complianceSum += computeAuditProgress(p.auditEntries).pct;
      complianceCount++;
      if (computeProjectHealth({ locked: p.locked, auditEntries: p.auditEntries }).code === 'R') highRisk++;
    }
  }

  return {
    totalValue: money(totalValueD),
    avgMarginPct: marginCount > 0 ? marginSum / marginCount : 0,
    hasMargin: marginCount > 0,
    avgCompliancePct: complianceCount > 0 ? complianceSum / complianceCount : 0,
    highRiskCount: highRisk,
    projectCount: projects.length,
  };
}

export interface ProgramChildInput {
  id: string;
  locked: boolean;
  sizing: SizingProjectInput;
  auditEntries: AuditEntryInput[];
  financialActuals: FinancialActualInput[];
}

export interface ProgramRollup {
  parentId: string;
  childCount: number;
  totalContractValue: number;
  totalRevenue: number;
  totalEacCost: number;
  /** (totalRevenue - totalEacCost) / totalRevenue * 100 — 0 when totalRevenue is 0. */
  blendedEacMarginPct: number;
  totalOpenRRHours: number;
  /** Worst (highest-risk) health among the children; 'NA' when there are no children yet. */
  health: HealthCode | 'NA';
}

const HEALTH_RANK: Record<HealthCode, number> = { G: 0, Y: 1, R: 2 };

/**
 * Aggregates a Parent Program's directly-linked child waves into rollup
 * metrics for the Control Tower tree view and the Program-level Executive
 * Status Report: summed contract value/EAC cost/open RR demand, a
 * revenue-weighted blended EAC margin, and the worst health code among the
 * children (health never improves as more children are added — only holds
 * or worsens).
 */
export function computeProgramRollup(
  parentProject: { id: string },
  childProjects: ProgramChildInput[],
  roles: RateRole[]
): ProgramRollup {
  let totalContractValueD = d(0);
  let totalRevenueD = d(0);
  let totalEacCostD = d(0);
  let totalOpenRRHours = 0;
  let worstHealth: HealthCode = 'G';

  for (const c of childProjects) {
    const totals = computeTotalsFor(c.sizing, roles);
    const eac = computeEacSummary(c.sizing, roles, c.financialActuals);
    totalContractValueD = totalContractValueD.plus(d(totals.contractValue));
    totalRevenueD = totalRevenueD.plus(d(totals.revenue));
    totalEacCostD = totalEacCostD.plus(d(eac.totalEacCost));
    totalOpenRRHours += eac.totalOpenRRHours;

    const health = computeProjectHealth({ locked: c.locked, auditEntries: c.auditEntries });
    if (HEALTH_RANK[health.code] > HEALTH_RANK[worstHealth]) worstHealth = health.code;
  }

  const blendedEacMarginPct = totalRevenueD.gt(0)
    ? totalRevenueD.minus(totalEacCostD).div(totalRevenueD).times(100).toNumber()
    : 0;

  return {
    parentId: parentProject.id,
    childCount: childProjects.length,
    totalContractValue: money(totalContractValueD),
    totalRevenue: money(totalRevenueD),
    totalEacCost: money(totalEacCostD),
    blendedEacMarginPct,
    totalOpenRRHours,
    health: childProjects.length ? worstHealth : 'NA',
  };
}
