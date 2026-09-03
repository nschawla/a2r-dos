/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 * Proprietary and confidential. Licensed, not sold, under the A2R Delivery
 * OS Terms of Service & EULA (/terms) — see that document for the full
 * customer-data vs. A2R-IP ownership split and reverse-engineering
 * restrictions this file falls under.
 */

/**
 * WP7 — Executive Reporting Hub math: the three pure calculations behind
 * the SteerCo Status Deck's Flight Path Variance bar, Open Demand &
 * Contractor Burn alert, and the Portfolio Rollup CSV's Burn-to-Date
 * column. Same philosophy as every other file in this directory — zero
 * React/Next/Prisma dependency, plain data in and out, unit-testable in
 * isolation — and deliberately its own file rather than folded into
 * financials.ts: these three functions are executive-*reporting* concerns
 * layered on top of the EAC engine's own numbers, not new EAC math.
 */
import type { EacSummary } from './financials';

// ------------------------------------------------------- Flight Path Variance

export interface FlightPathVarianceInput {
  /** Module 1's current sold margin — computeTotalsFor(...).marginPct. */
  soldMarginPct: number;
  /** The margin captured in Project.baselineSnapshot at the moment the
   * baseline was last locked — null when the project has never been
   * locked, since there is then no "Approved Baseline" leg to report. */
  baselineMarginPct: number | null;
  /** Module 4's current true EAC margin — computeEacSummary(...).eacMarginPct. */
  eacMarginPct: number;
}

export type FlightPathStatus = 'no-baseline' | 'on-track' | 'erosion' | 'upside';

export interface FlightPathVariance extends FlightPathVarianceInput {
  /** baselineMarginPct - eacMarginPct, in points. null when there is no
   * baseline to compare against (see baselineMarginPct above) — this is
   * the leg the SteerCo deck cares about most, since it measures drift
   * since the client-approved commitment, not just since deal sizing. */
  baselineToEacDriftPts: number | null;
  /** soldMarginPct - eacMarginPct, in points. Always computable (sold
   * margin always exists), so the KPI bar has a full-lifecycle number to
   * show even for a project that's never been baselined. */
  soldToEacDriftPts: number;
  /** Classified off baselineToEacDriftPts using the same ±0.05pt
   * threshold computeEacSummary's own drift classification uses (see
   * financials.ts's classifyDrift) — 'no-baseline' when there is nothing
   * to classify against. */
  status: FlightPathStatus;
}

/**
 * The SteerCo deck's three-point "Flight Path": Sold Margin % (what was
 * priced) → Approved Baseline Margin % (what the client/steering
 * committee last signed off on, at lock time) → True EAC Margin % (what
 * execution reality currently projects). Reporting this as three
 * consecutive checkpoints — not just a single sold-vs-EAC number — lets an
 * executive tell "we sized this badly to begin with" (sold vs. baseline
 * gap) apart from "this baselined deal is now eroding in flight" (baseline
 * vs. EAC gap), which is the more actionable of the two for a steering
 * committee to intervene on.
 */
export function computeFlightPathVariance(input: FlightPathVarianceInput): FlightPathVariance {
  const soldToEacDriftPts = input.soldMarginPct - input.eacMarginPct;

  if (input.baselineMarginPct === null) {
    return { ...input, baselineToEacDriftPts: null, soldToEacDriftPts, status: 'no-baseline' };
  }

  const baselineToEacDriftPts = input.baselineMarginPct - input.eacMarginPct;
  const status: FlightPathStatus = baselineToEacDriftPts > 0.05 ? 'erosion' : baselineToEacDriftPts < -0.05 ? 'upside' : 'on-track';
  return { ...input, baselineToEacDriftPts, soldToEacDriftPts, status };
}

// ------------------------------------------------------------- Open Demand Risk

export type OpenDemandBand = 'low' | 'medium' | 'high';

export interface OpenDemandRisk {
  openRRHours: number;
  /** Same actual+forecast+openRR basis computeEacSummary's own totals use. */
  totalHours: number;
  /** 0-100. 0 when totalHours is 0. */
  openRRPctOfTotal: number;
  /** >=15% of total hours still unstaffed -> high; >=5% -> medium;
   * otherwise low. Round thresholds in the same spirit as the schedule
   * pace-risk bands (50%/75% elapsed) and the EAC drift threshold
   * (0.05pt) elsewhere in this engine — a deliberately simple, documented
   * banding rather than a tuned model, since the point is a fast visual
   * signal on an executive deck, not a precise forecast. */
  band: OpenDemandBand;
}

/**
 * "Open Demand & Contractor Burn" exposure — the unstaffed-demand half.
 * Open RR (Resource Request) hours are sized work with nobody staffed
 * against it yet; they still cost money at baseline rate the moment
 * they're staffed (see EacEditor.tsx's own open-RR warning), so a rising
 * share of total hours sitting unstaffed is itself a delivery risk signal,
 * independent of whatever the EAC math currently shows.
 */
export function computeOpenDemandRisk(eac: Pick<EacSummary, 'totalActualHours' | 'totalForecastHours' | 'totalOpenRRHours'>): OpenDemandRisk {
  const totalHours = eac.totalActualHours + eac.totalForecastHours + eac.totalOpenRRHours;
  const openRRPctOfTotal = totalHours > 0 ? (eac.totalOpenRRHours / totalHours) * 100 : 0;
  const band: OpenDemandBand = openRRPctOfTotal >= 15 ? 'high' : openRRPctOfTotal >= 5 ? 'medium' : 'low';
  return { openRRHours: eac.totalOpenRRHours, totalHours, openRRPctOfTotal, band };
}

// ------------------------------------------------------------- Burn-to-Date

/**
 * Burn-to-Date % — how much of the project's *current* total estimated
 * cost (True EAC Cost, not the original sold cost) has actually been
 * spent so far. Deliberately measured against EAC cost rather than
 * baseline/sold cost: a project that has re-forecast its total cost
 * upward should show a lower burn % against that larger number, which is
 * the reading a portfolio reviewer actually wants ("how far through the
 * current plan are we"), not one that's artificially inflated by a stale
 * original estimate. 0 when totalEacCost is 0 (nothing to burn against yet).
 */
export function computeBurnToDatePct(eac: Pick<EacSummary, 'totalActualCost' | 'totalEacCost'>): number {
  return eac.totalEacCost > 0 ? (eac.totalActualCost / eac.totalEacCost) * 100 : 0;
}
