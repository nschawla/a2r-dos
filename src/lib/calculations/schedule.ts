/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 * Proprietary and confidential. Licensed, not sold, under the A2R Delivery
 * OS Terms of Service & EULA (/terms) — see that document for the full
 * customer-data vs. A2R-IP ownership split and reverse-engineering
 * restrictions this file falls under.
 */

/**
 * Module 5 — Milestone Schedule & Burndown math. Ported from the
 * prototype's `computePhaseSlipDays` / `phaseSlipBadge`, `computePhasePace`,
 * and `computeScheduleSummary`.
 */
import { PHASES } from '../constants';
import { MS_PER_DAY, numOr, toDate } from './_internal';
import { DEFAULT_SCHEDULE_TOLERANCES, type ScheduleTolerances, type SchedulePhaseInput } from './types';

export type SlipSeverity = 'unknown' | 'onTrack' | 'slip' | 'warning' | 'critical';

export interface PhaseSlipResult {
  /** Calendar days between planned end and actual end. null when either date is missing. Negative means early. */
  slipDays: number | null;
  severity: SlipSeverity;
}

/**
 * slipDays = round((actualEnd - plannedEnd) / 1 day).
 *
 * The prototype's tolerances (Module 0's slipWarnDays/slipCritDays) live on
 * OrgPolicy, not on the phase itself, so this pure function takes them as a
 * parameter — defaulted to the prototype's own out-of-the-box policy
 * (5d warn / 15d crit) so a bare two-argument call still behaves exactly
 * like the original, but callers should pass the org's actual policy.
 *
 * Severity bands, in order: no dates -> 'unknown'; slip <= 0 -> 'onTrack';
 * slip >= critDays -> 'critical'; slip >= warnDays -> 'warning'; otherwise
 * a positive slip under the warn threshold -> 'slip'.
 */
export function computePhaseSlipDays(
  plannedEnd: Date | string | null | undefined,
  actualEnd: Date | string | null | undefined,
  tolerances: ScheduleTolerances = DEFAULT_SCHEDULE_TOLERANCES
): PhaseSlipResult {
  if (!plannedEnd || !actualEnd) return { slipDays: null, severity: 'unknown' };
  const slipDays = Math.round((toDate(actualEnd).getTime() - toDate(plannedEnd).getTime()) / MS_PER_DAY);
  let severity: SlipSeverity;
  if (slipDays <= 0) severity = 'onTrack';
  else if (slipDays >= tolerances.critDays) severity = 'critical';
  else if (slipDays >= tolerances.warnDays) severity = 'warning';
  else severity = 'slip';
  return { slipDays, severity };
}

export type PaceState = 'unknown' | 'complete' | 'notStarted' | 'critical' | 'warning' | 'onPace';

export interface PhasePaceResult {
  state: PaceState;
  /** Percent of the planned calendar window elapsed as of `now`. null when it can't be computed. */
  elapsedPct: number | null;
}

export interface PhasePaceOptions {
  /** Pass the phase's current status; 'complete' short-circuits to state 'complete' regardless of elapsed time. */
  status?: string;
  /** Reference "now" — defaults to `new Date()`. Pass explicitly in tests for determinism. */
  now?: Date;
}

/**
 * Schedule velocity / pace risk — independent of the end-date slip check
 * above. A phase can be within its planned end date while still burning
 * calendar time faster than the logged work is progressing:
 *  - > 75% of the planned window elapsed with < 50% complete -> 'critical'
 *  - > 50% elapsed with < 25% complete -> 'warning'
 *  - otherwise -> 'onPace'
 */
export function computePhasePace(
  plannedStart: Date | string | null | undefined,
  plannedEnd: Date | string | null | undefined,
  pctComplete: number,
  options: PhasePaceOptions = {}
): PhasePaceResult {
  if (!plannedStart || !plannedEnd) return { state: 'unknown', elapsedPct: null };
  const start = toDate(plannedStart).getTime();
  const end = toDate(plannedEnd).getTime();
  if (!(end > start)) return { state: 'unknown', elapsedPct: null };
  if (options.status === 'complete') return { state: 'complete', elapsedPct: null };

  const now = (options.now ?? new Date()).getTime();
  const elapsedPct = ((now - start) / (end - start)) * 100;
  if (elapsedPct <= 0) return { state: 'notStarted', elapsedPct };

  const pct = numOr(pctComplete, 0);
  if (elapsedPct > 75 && pct < 50) return { state: 'critical', elapsedPct };
  if (elapsedPct > 50 && pct < 25) return { state: 'warning', elapsedPct };
  return { state: 'onPace', elapsedPct };
}

export interface ScheduleSummary {
  worst: 'onTrack' | 'warning' | 'critical';
  worstSlipDays: number;
  criticalCount: number;
  warningCount: number;
  worstPace: 'onTrack' | 'warning' | 'critical';
  paceCriticalCount: number;
  paceWarningCount: number;
}

/**
 * Portfolio/project-level rollup across all 6 canonical phases (see
 * PHASES in constants.ts). Phases missing from `phases` are treated as
 * having no data (skipped, not penalized) — the schema seeds one row per
 * phase on project creation, so this only matters for partial/test input.
 */
export function computeScheduleSummary(
  project: { phases: SchedulePhaseInput[] },
  tolerances: ScheduleTolerances = DEFAULT_SCHEDULE_TOLERANCES,
  now: Date = new Date()
): ScheduleSummary {
  let worstSlipDays = 0;
  let criticalCount = 0;
  let warningCount = 0;
  let paceCriticalCount = 0;
  let paceWarningCount = 0;

  for (const p of PHASES) {
    const phase = project.phases.find((ph) => ph.phaseKey === p.key);
    if (!phase) continue;

    const slip = computePhaseSlipDays(phase.plannedEnd, phase.actualEnd, tolerances);
    if (slip.slipDays !== null) {
      if (slip.slipDays > worstSlipDays) worstSlipDays = slip.slipDays;
      if (slip.severity === 'critical') criticalCount++;
      else if (slip.severity === 'warning') warningCount++;
    }

    const pace = computePhasePace(phase.plannedStart, phase.plannedEnd, phase.pctComplete, {
      status: phase.status,
      now,
    });
    if (pace.state === 'critical') paceCriticalCount++;
    else if (pace.state === 'warning') paceWarningCount++;
  }

  const worst = criticalCount > 0 ? 'critical' : warningCount > 0 ? 'warning' : 'onTrack';
  const worstPace = paceCriticalCount > 0 ? 'critical' : paceWarningCount > 0 ? 'warning' : 'onTrack';

  return { worst, worstSlipDays, criticalCount, warningCount, worstPace, paceCriticalCount, paceWarningCount };
}
