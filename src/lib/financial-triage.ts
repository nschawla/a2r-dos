/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Financial Realization Cockpit Executive Triage & Thematic Clustering
 * (docs/FINANCIAL_REALIZATION_TRIAGE.md) — applies the same dual-tile
 * macro-first pattern shipped for the RAID Cockpit (src/lib/raid-triage.ts)
 * to the EAC engine: a portfolio-wide BAC/Actuals/EAC-variance rollup, plus
 * a thematic grouping of the at-risk (Amber/Red) subset by likely
 * financial root cause.
 *
 * Pure — no Prisma, no React, no network call. Deliberately NOT a live LLM
 * classification, for the same reason RAID's isn't: this renders on every
 * /financials visit and needs to stay instant regardless of
 * ANTHROPIC_API_KEY configuration.
 *
 * One real difference from RAID's classifier: a RAID item carries a free-
 * text title/description/impact to keyword-score against. A project's
 * financial snapshot doesn't — there's no narrative field here, only
 * structured numbers and flags that already exist elsewhere in the schema
 * (Project.healthCost/healthScope, SchedulePhase.status, FinancialActual ×
 * DeliveryRole.employmentType, Project.commercialModel). So this
 * classifier is a fixed-priority decision list over those real signals
 * rather than a keyword scorer — a different mechanism from RAID's, same
 * governing rule: deterministic, transparent, and it only buckets data
 * that's already been computed, never invents a root cause.
 */
export type BillingType = 'FF' | 'TM';
export type ClientTier = 'STRATEGIC' | 'STANDARD';
export type Rag = 'Red' | 'Amber';

export type FinancialTheme =
  | 'UNBILLED_MILESTONE_DELAY'
  | 'SCOPE_CREEP_OVERRUN'
  | 'SUBCONTRACTOR_RATE_VARIANCE'
  | 'LABOR_BURN_ACCELERATION'
  | 'OTHER';

export const FINANCIAL_THEME_ORDER: FinancialTheme[] = [
  'UNBILLED_MILESTONE_DELAY',
  'SCOPE_CREEP_OVERRUN',
  'SUBCONTRACTOR_RATE_VARIANCE',
  'LABOR_BURN_ACCELERATION',
  'OTHER',
];

export const FINANCIAL_THEME_LABEL: Record<FinancialTheme, string> = {
  UNBILLED_MILESTONE_DELAY: 'Unbilled Milestone Delays',
  SCOPE_CREEP_OVERRUN: 'Scope Creep Overruns',
  SUBCONTRACTOR_RATE_VARIANCE: 'Subcontractor Rate Variances',
  LABOR_BURN_ACCELERATION: 'Labor Burn Accelerations',
  OTHER: 'Other',
};

export const FINANCIAL_THEME_BLURB: Record<FinancialTheme, string> = {
  UNBILLED_MILESTONE_DELAY: 'A slipped delivery phase on a Fixed Price engagement — a stalled billing trigger.',
  SCOPE_CREEP_OVERRUN: 'Unplanned or expanding scope driving cost past the original baseline.',
  SUBCONTRACTOR_RATE_VARIANCE: 'Contractor/vendor labor carrying an outsized share of the spend.',
  LABOR_BURN_ACCELERATION: 'Actual spend outpacing BAC with no scope or vendor cause on record.',
  OTHER: "Financially at risk, but doesn't match a known pattern — review the EAC directly.",
};

/** Share of a project's actual spend attributable to Contractor/Vendor
 * rate-card roles, at or above which "Subcontractor Rate Variance" is
 * considered the driving theme. */
const CONTRACTOR_VARIANCE_THRESHOLD_PCT = 40;

export interface FinancialTriageProjectInput {
  id: string;
  name: string;
  /** Budget at Completion — Project.bac, already Number()'d by the caller. */
  bac: number;
  /** Actuals to date — Project.actualsCost. */
  actualsCost: number;
  /** Variance at Completion (baselineCost - EAC) — Project.vac. Positive =
   * upside/under budget, negative = margin erosion. */
  vac: number;
  /** Project.healthCost — 'Green' | 'Amber' | 'Red'. Green never reaches a
   * cluster; see ragFor. */
  healthCost: string;
  billingType: BillingType;
  clientTier: ClientTier;
  /** Project.healthScope === 'Red' — a real, already-computed signal
   * (an escalated Critical issue, or unscheduled backlog > 10% of BAC). */
  scopeAtRisk: boolean;
  /** True if any SchedulePhase on this project is status DELAYED. */
  milestoneDelayed: boolean;
  /** 0-100. Share of this project's logged FinancialActual cost sitting on
   * CONTRACTOR-employment-type rate-card roles. 0 when the project has no
   * actuals logged yet. */
  contractorCostPct: number;
  updatedAt: string;
}

export interface FinancialTriageItem extends FinancialTriageProjectInput {
  theme: FinancialTheme;
  rag: Rag;
  /** actualsCost - bac. Positive = over budget. */
  varianceUsd: number;
}

export interface FinancialThemeCluster {
  theme: FinancialTheme;
  label: string;
  blurb: string;
  /** Distinct at-risk projects landing in this theme — same as
   * items.length (a project contributes at most once here, unlike RAID
   * where several items on one project can share a theme). Named
   * `projectCount` to keep the shape parallel with RaidThemeCluster. */
  projectCount: number;
  redCount: number;
  amberCount: number;
  /** Sum of each member project's varianceUsd — the $ severity signal
   * used as this cluster's tie-break, RAID's financial analog of "raw
   * item count". */
  totalVarianceUsd: number;
  items: FinancialTriageItem[];
}

export interface FinancialTriageResult {
  /** Every scoped project considered for the Tile 1 rollup (not just the
   * at-risk subset — BAC/Actuals/Variance are portfolio-wide totals). */
  projectCount: number;
  totalBac: number;
  totalActuals: number;
  /** Sum of vac across all scoped projects. Negative = net erosion. */
  totalVac: number;
  /** healthCost Red or Amber. */
  overBudgetCount: number;
  /** healthCost Green. */
  onBudgetCount: number;
  redCount: number;
  amberCount: number;
  byBillingType: Record<BillingType, { count: number; bac: number }>;
  /** Thematic clusters over the at-risk (Amber/Red) subset only — a
   * Green, on-baseline project has no "root cause" to surface. */
  clusters: FinancialThemeCluster[];
}

/** Green is excluded entirely — a project on baseline has nothing to
 * triage. Red and Amber both enter the at-risk population, mirroring
 * RAID's CRITICAL/HIGH (Red) + MED (Amber) inclusion / LOW exclusion. */
export function financialRagFor(healthCost: string): Rag | null {
  if (healthCost === 'Red') return 'Red';
  if (healthCost === 'Amber') return 'Amber';
  return null;
}

/**
 * Fixed-priority decision list, evaluated top to bottom — the first rule
 * that matches wins, exactly like RAID_THEME_ORDER breaks a keyword-score
 * tie. Each rule reads only real, already-computed signals:
 *
 *  1. Unbilled Milestone Delay — a slipped phase on a Fixed Price deal is
 *     specifically a stalled billing trigger (T&M bills on hours logged
 *     regardless of milestone status, so this reads FF-only).
 *  2. Scope Creep Overrun — Project.healthScope is already Red (an
 *     escalated Critical issue, or backlog > 10% of BAC).
 *  3. Subcontractor Rate Variance — contractor/vendor labor is carrying
 *     an outsized share of actual spend.
 *  4. Labor Burn Acceleration — spend has outpaced BAC with none of the
 *     three more specific causes above on record; the honest catch-all
 *     for "burn is ahead of plan, no other flagged driver."
 *  5. OTHER — at-risk (Amber/Red) by EAC/margin math, but none of the
 *     above signals fired.
 */
export function classifyFinancialTheme(
  input: Pick<FinancialTriageProjectInput, 'billingType' | 'milestoneDelayed' | 'scopeAtRisk' | 'contractorCostPct' | 'bac' | 'actualsCost'>
): FinancialTheme {
  if (input.milestoneDelayed && input.billingType === 'FF') return 'UNBILLED_MILESTONE_DELAY';
  if (input.scopeAtRisk) return 'SCOPE_CREEP_OVERRUN';
  if (input.contractorCostPct >= CONTRACTOR_VARIANCE_THRESHOLD_PCT) return 'SUBCONTRACTOR_RATE_VARIANCE';
  if (input.actualsCost > input.bac) return 'LABOR_BURN_ACCELERATION';
  return 'OTHER';
}

/**
 * Assembles the full triage result from every scoped project. The caller
 * (src/server/queries/financial-triage.ts) is responsible for the DB read
 * and the RBAC scoping; this only classifies and aggregates what it's
 * handed.
 */
export function buildFinancialTriage(inputs: FinancialTriageProjectInput[]): FinancialTriageResult {
  let totalBac = 0;
  let totalActuals = 0;
  let totalVac = 0;
  let overBudgetCount = 0;
  let onBudgetCount = 0;
  let redCount = 0;
  let amberCount = 0;
  const byBillingType: Record<BillingType, { count: number; bac: number }> = {
    FF: { count: 0, bac: 0 },
    TM: { count: 0, bac: 0 },
  };
  const atRisk: FinancialTriageItem[] = [];

  for (const p of inputs) {
    totalBac += p.bac;
    totalActuals += p.actualsCost;
    totalVac += p.vac;
    byBillingType[p.billingType].count += 1;
    byBillingType[p.billingType].bac += p.bac;

    const rag = financialRagFor(p.healthCost);
    if (rag === null) {
      onBudgetCount += 1;
      continue;
    }
    overBudgetCount += 1;
    if (rag === 'Red') redCount += 1;
    else amberCount += 1;

    atRisk.push({ ...p, theme: classifyFinancialTheme(p), rag, varianceUsd: p.actualsCost - p.bac });
  }

  const clusters: FinancialThemeCluster[] = FINANCIAL_THEME_ORDER.map((theme) => {
    const members = atRisk.filter((i) => i.theme === theme);
    return {
      theme,
      label: FINANCIAL_THEME_LABEL[theme],
      blurb: FINANCIAL_THEME_BLURB[theme],
      projectCount: members.length,
      redCount: members.filter((i) => i.rag === 'Red').length,
      amberCount: members.filter((i) => i.rag === 'Amber').length,
      totalVarianceUsd: members.reduce((s, i) => s + i.varianceUsd, 0),
      items: members,
    };
  })
    .filter((c) => c.projectCount > 0)
    // Worst first — same reasoning as RAID: more distinct projects touched
    // by the same theme outranks a bigger single-project dollar figure,
    // since the former is the systemic read leadership actually wants.
    .sort((a, b) => b.projectCount - a.projectCount || b.totalVarianceUsd - a.totalVarianceUsd);

  return {
    projectCount: inputs.length,
    totalBac,
    totalActuals,
    totalVac,
    overBudgetCount,
    onBudgetCount,
    redCount,
    amberCount,
    byBillingType,
    clusters,
  };
}
