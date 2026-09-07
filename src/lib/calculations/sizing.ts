/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 * Proprietary and confidential. Licensed, not sold, under the A2R Delivery
 * OS Terms of Service & EULA (/terms) — see that document for the full
 * customer-data vs. A2R-IP ownership split and reverse-engineering
 * restrictions this file falls under.
 */

/**
 * Commercial Baseline — sizing & margin math. Ported formula-for-formula from
 * the Phase 1/2 prototype's `computeTotalsFor`, `computeMarginModeler`, and
 * `suggestMatrixForProject` (a2r/index.html). See sizing tests in
 * tests/calculations.test.ts for the exact expected values this was
 * checked against.
 */
import { PHASES, WORKSTREAM_PHASE_HOURS, COMPLEXITY_MULT } from '../constants';
import { numOr } from './_internal';
import { d, money, rate, roundMoney } from './money';
import type { EffortMatrix, RateRole, ScopeItemInput, SizingProjectInput } from './types';

export interface SizingTotals {
  totalHours: number;
  revenue: number;
  cost: number;
  /** Blended bill rate: revenue / totalHours (0 when totalHours is 0). */
  blended: number;
  contingencyAmt: number;
  contractValue: number;
  /** Baseline sold margin, as a percentage (e.g. 32.5 for 32.5%). */
  marginPct: number;
  phaseTotals: Record<string, number>;
  roleTotals: Record<string, number>;
}

/**
 * Totals for both estimation modes:
 *  - 'direct': reads project.directIntake straight through (cost is
 *    back-solved from the stated blended margin).
 *  - 'matrix': sums the Phase-Effort Matrix (effortCells) against the
 *    current rate-card roster. A cell referencing a role not present in
 *    `roles` contributes nothing — matching the prototype, which only ever
 *    iterated the live roster (a role dropped from Module 0 stops counting
 *    even if stale matrix values exist for it).
 *
 * Contingency is added to contract value only for Fixed Fee ('ff') deals,
 * as a percentage of revenue — never for T&M.
 */
export function computeTotalsFor(project: SizingProjectInput, roles: RateRole[]): SizingTotals {
  const phaseTotals: Record<string, number> = {};
  const roleTotals: Record<string, number> = {};
  for (const p of PHASES) phaseTotals[p.key] = 0;
  for (const r of roles) roleTotals[r.id] = 0;

  if (project.estimationMode === 'direct') {
    const di = project.directIntake ?? { soldHours: 0, targetRevenue: 0, blendedMarginPct: 0 };
    const totalHours = numOr(di.soldHours, 0);
    const revenueD = d(di.targetRevenue);
    const marginPctD = d(di.blendedMarginPct);
    // cost back-solved from the stated blended margin: revenue × (1 − m/100)
    const costD = revenueD.times(d(1).minus(marginPctD.div(100)));
    const contingencyD =
      project.commercialModel === 'ff' ? revenueD.times(d(project.contingencyPct).div(100)) : d(0);
    return {
      totalHours,
      revenue: money(revenueD),
      cost: money(costD),
      blended: totalHours > 0 ? rate(revenueD.div(totalHours)) : 0,
      contingencyAmt: money(contingencyD),
      contractValue: money(roundMoney(revenueD).plus(roundMoney(contingencyD))),
      marginPct: marginPctD.toNumber(),
      phaseTotals,
      roleTotals,
    };
  }

  const roleById = new Map(roles.map((r) => [r.id, r]));
  let totalHours = 0;
  let revenueD = d(0);
  let costD = d(0);
  for (const cell of project.effortCells) {
    const role = roleById.get(cell.roleId);
    if (!role) continue;
    const hrs = numOr(cell.hours, 0);
    totalHours += hrs;
    revenueD = revenueD.plus(d(hrs).times(d(role.billRate)));
    costD = costD.plus(d(hrs).times(d(role.costRate)));
    phaseTotals[cell.phaseKey] = (phaseTotals[cell.phaseKey] ?? 0) + hrs;
    roleTotals[cell.roleId] = (roleTotals[cell.roleId] ?? 0) + hrs;
  }
  const contingencyD =
    project.commercialModel === 'ff' ? revenueD.times(d(project.contingencyPct).div(100)) : d(0);
  return {
    totalHours,
    revenue: money(revenueD),
    cost: money(costD),
    blended: totalHours > 0 ? rate(revenueD.div(totalHours)) : 0,
    contingencyAmt: money(contingencyD),
    contractValue: money(roundMoney(revenueD).plus(roundMoney(contingencyD))),
    // % from the exact-decimal revenue/cost — one division, no accumulation.
    marginPct: revenueD.gt(0) ? revenueD.minus(costD).div(revenueD).times(100).toNumber() : 0,
    phaseTotals,
    roleTotals,
  };
}

export interface MarginModelerResult {
  /** false when there is no cost basis yet (no hours sized, or zero cost) — every other field is 0. */
  hasBasis: boolean;
  requiredRevenue: number;
  requiredBlendedRate: number;
  /** revenue - requiredRevenue: positive = discount headroom, negative = premium required. */
  diff: number;
  diffPct: number;
}

/**
 * Given the current cost base (from computeTotalsFor), what services
 * revenue and blended bill rate are required to hit an arbitrary target
 * margin — and what discount/premium that implies versus the
 * rate-card-derived baseline revenue already sized.
 *
 * targetMarginPct is clamped to [0, 99] (a 100% target margin implies zero
 * cost recovery and is mathematically undefined here, same as the prototype).
 */
export function computeMarginModeler(totals: SizingTotals, targetMarginPct: number): MarginModelerResult {
  // `requiredRevenue` / `requiredBlendedRate` / `diff` are what-if modelling
  // figures, not booked amounts — computed exactly (decimal.js) but returned
  // full-precision, like a rate. Only positions that represent real money
  // (revenue / cost / contractValue / EAC) round to cents.
  const costD = d(totals.cost);
  const revD = d(totals.revenue);
  const hasBasis = totals.totalHours > 0 && costD.gt(0);
  const clampedTarget = Math.max(0, Math.min(99, targetMarginPct));
  const requiredRevenueD = hasBasis ? costD.div(d(1).minus(d(clampedTarget).div(100))) : d(0);
  const requiredRevenue = requiredRevenueD.toNumber();
  const requiredBlendedRate =
    hasBasis && totals.totalHours > 0 ? requiredRevenueD.div(totals.totalHours).toNumber() : 0;
  const diffD = revD.minus(requiredRevenueD);
  return {
    hasBasis,
    requiredRevenue,
    requiredBlendedRate,
    diff: diffD.toNumber(),
    diffPct: revD.gt(0) ? diffD.div(revD).times(100).toNumber() : 0,
  };
}

/**
 * Seniority-weighted split of a phase's role-agnostic hours across a
 * bill-rate-sorted (desc) role list. Front-loaded phases (initiate/design)
 * skew senior; execution-heavy phases (build/test) skew junior; deploy and
 * sustain are split flat (weight 0.7 for every role, pre-normalization).
 * Exported for testability — not part of the module's public surface in
 * the prototype, but the weighting itself is exactly what the tests need
 * to pin down.
 */
export function seniorityWeightsForPhase(phaseKey: string, rolesSortedByBillRateDesc: RateRole[]): number[] {
  const n = rolesSortedByBillRateDesc.length;
  const raw = rolesSortedByBillRateDesc.map((_, i) => {
    const seniorFrac = n > 1 ? 1 - i / (n - 1) : 1;
    if (phaseKey === 'initiate' || phaseKey === 'design') return 0.4 + 0.9 * seniorFrac;
    if (phaseKey === 'build' || phaseKey === 'test') return 0.4 + 0.9 * (1 - seniorFrac);
    return 0.7;
  });
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  return raw.map((w) => w / sum);
}

/**
 * Suggests a full Phase-Effort Matrix from the Universal Scope & Taxonomy
 * Matrix: for every included scope item with a known workstream profile
 * (WORKSTREAM_PHASE_HOURS), scales its role-agnostic per-phase hours by
 * complexity, then splits that phase's hours across the current roster
 * using seniorityWeightsForPhase. Rounds the phase total first, then each
 * role's share — matching the prototype's rounding order exactly (two
 * sequential Math.round calls, not one), which is why the sum of a
 * suggested phase's per-role hours can be off by a rounding point or two
 * from the phase total. That's expected, not a bug.
 */
export function suggestMatrixForProject(scope: ScopeItemInput[], roles: RateRole[]): EffortMatrix {
  const rolesSorted = [...roles].sort((a, b) => d(b.billRate).minus(d(a.billRate)).toNumber());

  // Built as a Map first (not the plain-object EffortMatrix) so every
  // per-phase row lookup below is a normal Map#get, not an indexed access
  // TypeScript would otherwise widen to `Record<string, number> | undefined`
  // under noUncheckedIndexedAccess — same values, fully type-safe either way.
  const rows = new Map<string, Record<string, number>>();
  for (const p of PHASES) {
    const row: Record<string, number> = {};
    for (const r of roles) row[r.id] = 0;
    rows.set(p.key, row);
  }

  if (rolesSorted.length) {
    for (const s of scope) {
      if (!s.included) continue;
      const workstreamTotals = WORKSTREAM_PHASE_HOURS[s.key];
      if (!workstreamTotals) continue;
      const mult = COMPLEXITY_MULT[s.complexity] ?? 1;
      for (const p of PHASES) {
        const phaseHrs = Math.round((workstreamTotals[p.key] ?? 0) * mult);
        if (phaseHrs <= 0) continue;
        const weights = seniorityWeightsForPhase(p.key, rolesSorted);
        const row = rows.get(p.key);
        if (!row) continue;
        rolesSorted.forEach((r, idx) => {
          row[r.id] = (row[r.id] ?? 0) + Math.round(phaseHrs * (weights[idx] ?? 0));
        });
      }
    }
  }

  const matrix: EffortMatrix = {};
  for (const [phaseKey, row] of rows) matrix[phaseKey] = row;
  return matrix;
}
