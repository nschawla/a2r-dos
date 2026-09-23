/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Schedule & Milestones Cockpit Executive Triage & Thematic Clustering
 * (docs/SCHEDULE_MILESTONES_TRIAGE.md) — the third application of the
 * dual-tile macro-first pattern shipped for RAID (src/lib/raid-triage.ts)
 * and Financial Realization (src/lib/financial-triage.ts): a portfolio-
 * wide milestone-health rollup, plus a thematic grouping of the at-risk
 * subset by likely scheduling root cause.
 *
 * Pure — no Prisma, no React, no network call. Deliberately NOT a live LLM
 * classification, for the same reason the other two aren't: this renders
 * on every /schedule visit and needs to stay instant regardless of
 * ANTHROPIC_API_KEY configuration.
 *
 * Unlike Financial Realization (which deliberately reads only the
 * denormalized EVM snapshot to avoid re-running the heavier Decimal-based
 * EAC engine on every request), this DOES call the existing schedule calc
 * engine (src/lib/calculations/schedule.ts's computePhaseSlipDays /
 * computePhasePace) live, per scoped project — that engine is a handful of
 * date-arithmetic comparisons over at most 6 phases per project, cheap
 * enough to run fresh every time, and it's the same engine
 * src/lib/executive-triage.ts already calls for its own "Behind Schedule"
 * narrative, so both surfaces agree on what counts as slipped.
 *
 * Like Financial Realization's classifier, this is a fixed-priority
 * decision list over real, already-computed structured signals — a
 * SchedulePhase row has no free-text narrative to keyword-score, unlike a
 * RAID item.
 */
import { computePhasePace, computePhaseSlipDays, computeScheduleSummary } from './calculations/schedule';
import type { SchedulePhaseInput } from './calculations/types';

export type Rag = 'Red' | 'Amber';
export type PhaseRag = 'Red' | 'Amber' | 'Green';

export type ScheduleTheme =
  | 'THIRD_PARTY_DEPENDENCY'
  | 'UAT_SIGNOFF_LAG'
  | 'DEPLOYMENT_RESOURCE_CONTENTION'
  | 'SCOPE_EXPANSION_SLIPPAGE'
  | 'OTHER';

export const SCHEDULE_THEME_ORDER: ScheduleTheme[] = [
  'THIRD_PARTY_DEPENDENCY',
  'UAT_SIGNOFF_LAG',
  'DEPLOYMENT_RESOURCE_CONTENTION',
  'SCOPE_EXPANSION_SLIPPAGE',
  'OTHER',
];

export const SCHEDULE_THEME_LABEL: Record<ScheduleTheme, string> = {
  THIRD_PARTY_DEPENDENCY: 'Third-Party Dependency Cascades',
  UAT_SIGNOFF_LAG: 'UAT Sign-off Lags',
  DEPLOYMENT_RESOURCE_CONTENTION: 'Resource Contention on Deployment Windows',
  SCOPE_EXPANSION_SLIPPAGE: 'Scope Expansion Slippage',
  OTHER: 'Other',
};

export const SCHEDULE_THEME_BLURB: Record<ScheduleTheme, string> = {
  THIRD_PARTY_DEPENDENCY: 'An open, high-severity Dependency item is blocking the critical path.',
  UAT_SIGNOFF_LAG: 'The Test (UAT, SIT) phase has slipped past plan.',
  DEPLOYMENT_RESOURCE_CONTENTION: 'The Deploy (Cutover, Go-Live) phase has slipped while the delivery team is stretched thin.',
  SCOPE_EXPANSION_SLIPPAGE: 'Unplanned or expanding scope pushing the schedule past baseline.',
  OTHER: "At risk, but doesn't match a known pattern — review the phase timeline directly.",
};

export interface ScheduleTriageProjectInput {
  id: string;
  name: string;
  /** All (up to 6) canonical phases this project has rows for. */
  phases: SchedulePhaseInput[];
  /** Project.healthScope — 'Green' | 'Amber' | 'Red'. */
  healthScope: string;
  /** Project.healthRes — 'Green' | 'Amber' | 'Red'; the app's existing
   * "is the delivery team stretched thin" proxy (unassigned PM, or a PM
   * covering 4+ projects). */
  healthRes: string;
  /** True when this project has an open (non-CLOSED) RAID Dependency item
   * at CRITICAL or HIGH severity — a real, already-logged third-party
   * blocker, never inferred. */
  openDependencyRisk: boolean;
  updatedAt: string;
}

export interface ScheduleTriageItem {
  id: string;
  name: string;
  theme: ScheduleTheme;
  rag: Rag;
  /** The worst single-phase slip (calendar days past planned end) this
   * project is currently carrying — computeScheduleSummary's own figure,
   * so it always reconciles with the per-project schedule view. */
  worstSlipDays: number;
  updatedAt: string;
}

export interface ScheduleThemeCluster {
  theme: ScheduleTheme;
  label: string;
  blurb: string;
  projectCount: number;
  redCount: number;
  amberCount: number;
  /** Sum of each member project's worstSlipDays — the schedule analog of
   * RAID's raw item count / Financial's total $ variance, used as this
   * cluster's tie-break. */
  totalSlipDays: number;
  items: ScheduleTriageItem[];
}

export interface ScheduleTriageResult {
  projectCount: number;
  /** Phases not yet status 'complete', across every scoped project —
   * "milestones still in flight" is the population the health split and
   * this count both describe. */
  activeMilestoneCount: number;
  redMilestoneCount: number;
  amberMilestoneCount: number;
  onTrackMilestoneCount: number;
  /** Deploy-phase (Cutover/Go-Live) rows not yet complete, whose planned
   * end falls within the next 30 / 60 calendar days. next60 is cumulative
   * (it includes next30, not an exclusive 31-60 band). */
  goLiveNext30: number;
  goLiveNext60: number;
  /** Thematic clusters over the at-risk (Amber/Red) project subset only —
   * a project with every phase on track has no root cause to surface. */
  clusters: ScheduleThemeCluster[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const PHASE_RAG_RANK: Record<PhaseRag, number> = { Green: 0, Amber: 1, Red: 2 };

/** A phase's own health, independent of the project-wide rollup below —
 * used for Tile 1's milestone-level split. Only meaningful for phases
 * still in flight (status !== 'complete'); a finished phase isn't an
 * ongoing risk regardless of how it landed, so callers should only pass
 * non-complete phases in here (see buildScheduleTriage). */
export function phaseHealthRag(phase: SchedulePhaseInput, now: Date = new Date()): PhaseRag {
  if (phase.status === 'delayed') return 'Red';
  const slip = computePhaseSlipDays(phase.plannedEnd, phase.actualEnd);
  if (slip.severity === 'critical') return 'Red';
  if (slip.severity === 'warning' || slip.severity === 'slip') return 'Amber';
  const pace = computePhasePace(phase.plannedStart, phase.plannedEnd, phase.pctComplete, { status: phase.status, now });
  if (pace.state === 'critical') return 'Red';
  if (pace.state === 'warning') return 'Amber';
  return 'Green';
}

/**
 * Fixed-priority decision list, evaluated top to bottom — the first rule
 * that matches wins, same mechanism as Financial Realization's classifier:
 *
 *  1. Third-Party Dependency Cascade — an open, high-severity RAID
 *     Dependency item already exists on this project (a real logged
 *     blocker, not inferred from dates).
 *  2. UAT Sign-off Lag — the Test (UAT, SIT) phase itself has slipped
 *     (warning or critical severity).
 *  3. Deployment Resource Contention — the Deploy (Cutover, Go-Live)
 *     phase has slipped AND the delivery team is already flagged thin
 *     (healthRes Amber) — slip alone isn't "contention" without the
 *     resource signal; that's Other or a more specific rule above.
 *  4. Scope Expansion Slippage — Project.healthScope is already Red.
 *  5. OTHER — schedule is at risk by the slip/pace math, but none of the
 *     above signals fired.
 */
export function classifyScheduleTheme(
  input: Pick<ScheduleTriageProjectInput, 'phases' | 'healthScope' | 'healthRes' | 'openDependencyRisk'>
): ScheduleTheme {
  if (input.openDependencyRisk) return 'THIRD_PARTY_DEPENDENCY';

  const testPhase = input.phases.find((p) => p.phaseKey === 'test');
  if (testPhase) {
    const slip = computePhaseSlipDays(testPhase.plannedEnd, testPhase.actualEnd);
    if (slip.severity === 'critical' || slip.severity === 'warning') return 'UAT_SIGNOFF_LAG';
  }

  const deployPhase = input.phases.find((p) => p.phaseKey === 'deploy');
  if (deployPhase && input.healthRes === 'Amber') {
    const slip = computePhaseSlipDays(deployPhase.plannedEnd, deployPhase.actualEnd);
    if (slip.severity === 'critical' || slip.severity === 'warning') return 'DEPLOYMENT_RESOURCE_CONTENTION';
  }

  if (input.healthScope === 'Red') return 'SCOPE_EXPANSION_SLIPPAGE';

  return 'OTHER';
}

/**
 * Assembles the full triage result from every scoped project. The caller
 * (src/server/queries/schedule-triage.ts) is responsible for the DB read
 * and the RBAC scoping; this only classifies and aggregates what it's
 * handed.
 *
 * One deliberate design point: a project's Tile 2 membership (and RAG) is
 * driven by the SAME per-phase `phaseHealthRag` computation Tile 1's split
 * uses — its worst active phase — rather than `computeScheduleSummary`'s
 * narrower "worst" (which only looks at date-based slip, missing an
 * explicit DELAYED status flag or a pace-only warning with no actualEnd
 * set yet). That would let Tile 1 show Red milestones for a project Tile 2
 * calls on-track. `computeScheduleSummary` is still used for the
 * `worstSlipDays` figure shown per cluster item — a real, already-computed
 * number that reconciles with the per-project schedule view — but never
 * as the at-risk gate itself.
 */
export function buildScheduleTriage(inputs: ScheduleTriageProjectInput[], now: Date = new Date()): ScheduleTriageResult {
  let activeMilestoneCount = 0;
  let redMilestoneCount = 0;
  let amberMilestoneCount = 0;
  let onTrackMilestoneCount = 0;
  let goLiveNext30 = 0;
  let goLiveNext60 = 0;
  const atRisk: ScheduleTriageItem[] = [];

  for (const p of inputs) {
    let worstPhaseRag: PhaseRag = 'Green';

    for (const phase of p.phases) {
      if (phase.status === 'complete') continue;
      activeMilestoneCount += 1;
      const rag = phaseHealthRag(phase, now);
      if (rag === 'Red') redMilestoneCount += 1;
      else if (rag === 'Amber') amberMilestoneCount += 1;
      else onTrackMilestoneCount += 1;
      if (PHASE_RAG_RANK[rag] > PHASE_RAG_RANK[worstPhaseRag]) worstPhaseRag = rag;

      if (phase.phaseKey === 'deploy' && phase.plannedEnd) {
        const days = (new Date(phase.plannedEnd).getTime() - now.getTime()) / DAY_MS;
        if (days >= 0 && days <= 60) goLiveNext60 += 1;
        if (days >= 0 && days <= 30) goLiveNext30 += 1;
      }
    }

    if (worstPhaseRag === 'Green') continue;
    const summary = computeScheduleSummary({ phases: p.phases }, undefined, now);

    atRisk.push({
      id: p.id,
      name: p.name,
      theme: classifyScheduleTheme(p),
      rag: worstPhaseRag,
      worstSlipDays: summary.worstSlipDays,
      updatedAt: p.updatedAt,
    });
  }

  const clusters: ScheduleThemeCluster[] = SCHEDULE_THEME_ORDER.map((theme) => {
    const members = atRisk.filter((i) => i.theme === theme);
    return {
      theme,
      label: SCHEDULE_THEME_LABEL[theme],
      blurb: SCHEDULE_THEME_BLURB[theme],
      projectCount: members.length,
      redCount: members.filter((i) => i.rag === 'Red').length,
      amberCount: members.filter((i) => i.rag === 'Amber').length,
      totalSlipDays: members.reduce((s, i) => s + i.worstSlipDays, 0),
      items: members,
    };
  })
    .filter((c) => c.projectCount > 0)
    // Worst first — same reasoning as RAID and Financial: more distinct
    // projects touched by the same theme outranks a bigger single-project
    // slip figure, since the former is the systemic read leadership wants.
    .sort((a, b) => b.projectCount - a.projectCount || b.totalSlipDays - a.totalSlipDays);

  return {
    projectCount: inputs.length,
    activeMilestoneCount,
    redMilestoneCount,
    amberMilestoneCount,
    onTrackMilestoneCount,
    goLiveNext30,
    goLiveNext60,
    clusters,
  };
}
