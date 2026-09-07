/**
 * Executive Briefing Hub — the portfolio-level data aggregator behind the
 * print-optimised `/reports` briefing.
 *
 * Org-wide (not role-scoped): an executive briefing is inherently the whole
 * PS portfolio. Every number is derived from the same engines every module
 * page uses (src/lib/calculations/*, src/lib/capacity-engine.ts) so the
 * briefing can never drift from what the app itself shows.
 */
import { db } from '@/lib/db';
import { computeTotalsFor } from '@/lib/calculations/sizing';
import { computeEacSummary } from '@/lib/calculations/financials';
import { computeProjectHealth } from '@/lib/calculations/audit';
import { d, money } from '@/lib/calculations/money';
import { toRateRoles, toSizingInput, toFinancialActuals, toAuditEntries } from '@/server/queries/calc-adapters';
import { mondayOf } from '@/lib/capacity-engine';
import { getPortfolioCapacity, type PortfolioCapacity } from '@/server/queries/capacity';

const HEALTH_LENSES = [
  { key: 'healthCost', label: 'Cost' },
  { key: 'healthSched', label: 'Schedule' },
  { key: 'healthScope', label: 'Scope' },
  { key: 'healthQual', label: 'Quality' },
  { key: 'healthRes', label: 'Resourcing' },
] as const;

export interface MacroRollup {
  totalTcv: number;
  aggregateBac: number;
  aggregateActualsCost: number;
  aggregateEacCost: number;
  blendedEacMarginPct: number;
  baselineMarginPct: number;
  marginDriftPts: number;
  activeEngagements: number;
  lockedEngagements: number;
  avgCompliancePct: number;
}

export interface HealthBand {
  green: number;
  amber: number;
  red: number;
}

export interface HealthDistribution {
  overall: HealthBand;
  lenses: { lens: string; green: number; amber: number; red: number }[];
}

export interface BurnOverview {
  plannedToDateHours: number;
  actualToDateHours: number;
  plannedTotalHours: number;
  variancePct: number;
  weekly: { week: string; plannedCum: number; actualCum: number; isFuture: boolean }[];
}

export interface CriticalRaidItem {
  id: string;
  projectName: string;
  type: string;
  title: string;
  severity: string;
  likelihood: string | null;
  ownerName: string | null;
  targetDate: string | null;
  status: string;
  escalated: boolean;
}

export interface ExecutiveBriefing {
  organizationName: string;
  generatedAt: string;
  macro: MacroRollup;
  utilization: PortfolioCapacity['summary'] & {
    practices: { practice: string; utilizationPct: number; targetUtilPct: number; attainmentPct: number; headcountFte: number }[];
  };
  concurrency: {
    overloadedCount: number;
    benchCount: number;
    avgConcurrency: number;
    top: PortfolioCapacity['overloaded'];
  };
  healthDistribution: HealthDistribution;
  burn: BurnOverview;
  criticalRaid: CriticalRaidItem[];
}

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MED: 2, LOW: 3 };
const LIKELIHOOD_LABEL: Record<string, string> = {
  RARE: 'Rare',
  POSSIBLE: 'Possible',
  LIKELY: 'Likely',
  ALMOST_CERTAIN: 'Almost certain',
};

export async function getExecutiveBriefing(organizationId: string): Promise<ExecutiveBriefing> {
  const now = new Date();
  const firstWeek = mondayOf(now);
  const trailingStart = new Date(firstWeek);
  trailingStart.setDate(trailingStart.getDate() - 13 * 7);
  const forwardEnd = new Date(firstWeek);
  forwardEnd.setDate(forwardEnd.getDate() + 26 * 7);

  const [org, roleRows, projects, capacity, weeklySlots, raidRows] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    db.deliveryRole.findMany({ where: { organizationId } }),
    db.project.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        hierarchyLevel: true,
        locked: true,
        estimationMode: true,
        commercialModel: true,
        contingencyPct: true,
        directIntakeSoldHours: true,
        directIntakeTargetRevenue: true,
        directIntakeBlendedMarginPct: true,
        bac: true,
        actualsCost: true,
        healthCost: true,
        healthSched: true,
        healthScope: true,
        healthQual: true,
        healthRes: true,
        effortCells: { select: { phaseKey: true, roleId: true, hours: true } },
        financials: { select: { roleKey: true, hours: true, cost: true, forecastHours: true, openRRHours: true } },
        auditEntries: { select: { controlKey: true, status: true } },
      },
    }),
    getPortfolioCapacity(organizationId),
    db.weeklyAssignmentSlot.findMany({
      where: { organizationId, weekDate: { gte: trailingStart, lt: forwardEnd } },
      select: { weekDate: true, forecastedHours: true, actualHours: true },
      orderBy: { weekDate: 'asc' },
    }),
    db.raidEntry.findMany({
      where: {
        project: { organizationId },
        status: { not: 'CLOSED' },
        OR: [{ escalate: true }, { severity: 'CRITICAL' }],
      },
      select: {
        id: true,
        type: true,
        title: true,
        description: true,
        severity: true,
        likelihood: true,
        status: true,
        escalate: true,
        targetDate: true,
        project: { select: { name: true } },
        owner: { select: { name: true } },
      },
    }),
  ]);

  const roles = toRateRoles(roleRows);

  // ---- Section 1 macro rollups (WP2 — exact-decimal accumulation) ----
  let totalTcvD = d(0);
  let sumRevenueD = d(0);
  let sumBaselineCostD = d(0);
  let sumEacCostD = d(0);
  let sumBacD = d(0);
  let sumActualsCostD = d(0);
  let activeEngagements = 0;
  let lockedEngagements = 0;

  const overall: HealthBand = { green: 0, amber: 0, red: 0 };
  const lensBands: Record<string, HealthBand> = Object.fromEntries(
    HEALTH_LENSES.map((l) => [l.key, { green: 0, amber: 0, red: 0 }])
  );

  for (const p of projects) {
    const totals = computeTotalsFor(toSizingInput(p), roles);
    totalTcvD = totalTcvD.plus(d(totals.contractValue));

    if (p.hierarchyLevel === 'PARENT') continue;
    activeEngagements += 1;
    if (p.locked) lockedEngagements += 1;
    sumBacD = sumBacD.plus(d(p.bac.toString()));
    sumActualsCostD = sumActualsCostD.plus(d(p.actualsCost.toString()));

    if (totals.totalHours > 0) {
      const eac = computeEacSummary(toSizingInput(p), roles, toFinancialActuals(p.financials));
      sumRevenueD = sumRevenueD.plus(d(totals.revenue));
      sumBaselineCostD = sumBaselineCostD.plus(d(totals.cost));
      sumEacCostD = sumEacCostD.plus(d(eac.totalEacCost));
    }

    const audit = toAuditEntries(p.auditEntries);
    const code = computeProjectHealth({ locked: p.locked, auditEntries: audit }).code;
    if (code === 'G') overall.green += 1;
    else if (code === 'Y') overall.amber += 1;
    else overall.red += 1;

    for (const lens of HEALTH_LENSES) {
      const v = String(p[lens.key] ?? 'Green').toLowerCase();
      const band = lensBands[lens.key]!;
      if (v === 'red') band.red += 1;
      else if (v === 'amber' || v === 'yellow') band.amber += 1;
      else band.green += 1;
    }
  }

  // weighted-compliance average across active engagements
  let complianceSum = 0;
  let complianceCount = 0;
  for (const p of projects) {
    if (p.hierarchyLevel === 'PARENT') continue;
    const graded = p.auditEntries.filter((a) => a.status !== 'NA');
    const pct = graded.length
      ? (graded.reduce((s, a) => s + (a.status === 'YES' ? 1 : a.status === 'PARTIAL' ? 0.5 : 0), 0) / graded.length) * 100
      : 0;
    complianceSum += pct;
    complianceCount += 1;
  }

  const baselineMarginPct = sumRevenueD.gt(0)
    ? sumRevenueD.minus(sumBaselineCostD).div(sumRevenueD).times(100).toNumber()
    : 0;
  const blendedEacMarginPct = sumRevenueD.gt(0)
    ? sumRevenueD.minus(sumEacCostD).div(sumRevenueD).times(100).toNumber()
    : 0;

  const macro: MacroRollup = {
    totalTcv: money(totalTcvD),
    aggregateBac: money(sumBacD),
    aggregateActualsCost: money(sumActualsCostD),
    aggregateEacCost: money(sumEacCostD),
    blendedEacMarginPct,
    baselineMarginPct,
    marginDriftPts: baselineMarginPct - blendedEacMarginPct,
    activeEngagements,
    lockedEngagements,
    avgCompliancePct: complianceCount > 0 ? complianceSum / complianceCount : 0,
  };

  // ---- Section 3 aggregated burn ----
  const byWeek = new Map<string, { forecast: number; actual: number }>();
  for (const s of weeklySlots) {
    const iso = s.weekDate.toISOString().slice(0, 10);
    const acc = byWeek.get(iso) ?? { forecast: 0, actual: 0 };
    acc.forecast += s.forecastedHours;
    acc.actual += s.actualHours;
    byWeek.set(iso, acc);
  }
  const todayIso = mondayOf(now).toISOString().slice(0, 10);
  let plannedCum = 0;
  let actualCum = 0;
  let plannedToDateHours = 0;
  let actualToDateHours = 0;
  const weekly = [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, v]) => {
      plannedCum += v.forecast;
      actualCum += v.actual;
      const isFuture = week > todayIso;
      if (!isFuture) {
        plannedToDateHours = plannedCum;
        actualToDateHours = actualCum;
      }
      return { week, plannedCum, actualCum, isFuture };
    });

  const burn: BurnOverview = {
    plannedToDateHours,
    actualToDateHours,
    plannedTotalHours: plannedCum,
    variancePct: plannedToDateHours > 0 ? ((actualToDateHours - plannedToDateHours) / plannedToDateHours) * 100 : 0,
    weekly,
  };

  // ---- Section 4 critical RAID ----
  const criticalRaid: CriticalRaidItem[] = raidRows
    .map((r) => ({
      id: r.id,
      projectName: r.project.name,
      type: r.type,
      title: r.title?.trim() || (r.description.length > 70 ? `${r.description.slice(0, 70)}…` : r.description),
      severity: r.severity,
      likelihood: r.likelihood ? (LIKELIHOOD_LABEL[r.likelihood] ?? r.likelihood) : null,
      ownerName: r.owner?.name ?? null,
      targetDate: r.targetDate ? r.targetDate.toISOString().slice(0, 10) : null,
      status: r.status,
      escalated: r.escalate,
    }))
    .sort((a, b) => {
      const sev = (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
      if (sev !== 0) return sev;
      if (a.escalated !== b.escalated) return a.escalated ? -1 : 1;
      return (a.targetDate ?? '9999').localeCompare(b.targetDate ?? '9999');
    });

  return {
    organizationName: org?.name ?? 'Portfolio',
    generatedAt: now.toISOString(),
    macro,
    utilization: {
      ...capacity.summary,
      practices: capacity.practices.map((p) => ({
        practice: p.practice,
        utilizationPct: p.summary.utilizationPct,
        targetUtilPct: p.summary.targetUtilPct,
        attainmentPct: p.summary.attainmentPct,
        headcountFte: p.summary.headcountFte,
      })),
    },
    concurrency: {
      overloadedCount: capacity.overloadedCount,
      benchCount: capacity.benchCount,
      avgConcurrency: capacity.avgConcurrency,
      top: capacity.overloaded,
    },
    healthDistribution: {
      overall,
      lenses: HEALTH_LENSES.map((l) => ({ lens: l.label, ...lensBands[l.key]! })),
    },
    burn,
    criticalRaid,
  };
}
