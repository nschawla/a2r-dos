/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Executive Action Triage — the Command Center's headline feed
 * (docs/UI_DESIGN_SYSTEM.md §6). For every Red or over-budget engagement
 * in the viewer's scope, synthesizes one narrative card answering the
 * four questions a stakeholder actually asks first: what's wrong, how
 * bad, who owns it and by when, and what needs to happen. Pure — no
 * Prisma, no React — server adapters map real rows into the plain inputs
 * below, matching every other engine in src/lib/calculations/.
 *
 * Deliberately built from data that already exists rather than a new
 * "root cause" / "required action" schema field: `Project.narrativeBlockers`
 * is already a hand-authored red-engagement narrative; a RAID item's own
 * `impact` / `mitigationPlan` fields are exactly "what happens if this
 * isn't fixed" / "the plan to fix it". Where a project has neither, a
 * templated fallback names the failing dimension rather than showing
 * nothing.
 */
import { computeProjectHealth } from './calculations/audit';
import { computeScheduleSummary } from './calculations/schedule';
import type { AuditEntryInput, SchedulePhaseInput } from './calculations/types';
import { SEVERITY_RANK, type Severity } from './ui/severity';

export type TriageDriver = 'Governance Red' | 'Over Budget' | 'Behind Schedule';

export interface TriageProjectInput {
  id: string;
  name: string;
  locked: boolean;
  narrativeBlockers: string | null;
  /** Already converted from Prisma Decimal by the caller. */
  bac: number;
  actualsCost: number;
  /** Project.healthCost / healthSched — 'Green' | 'Amber' | 'Red'. */
  healthCost: string;
  healthSched: string;
  auditEntries: AuditEntryInput[];
  deliveryManagerName: string | null;
  projectManagerName: string | null;
  /** ISO. Fallback provenance timestamp when no RAID item drives the card. */
  updatedAt: string;
}

export interface TriageRaidInput {
  projectId: string;
  title: string | null;
  description: string;
  impact: string | null;
  mitigationPlan: string | null;
  severity: Severity;
  escalate: boolean;
  ownerName: string | null;
  targetDate: string | null;
  updatedAt: string;
}

export interface TriageItem {
  projectId: string;
  projectName: string;
  drivers: TriageDriver[];
  cause: string;
  financialImpact: string | null;
  scheduleImpact: string | null;
  ownerName: string | null;
  deadline: string | null;
  overdue: boolean;
  requiredAction: string;
  driverHref: string;
  lastUpdated: string;
}

/** Above-the-fold discipline (docs/UI_DESIGN_SYSTEM.md §1.2) — the feed
 * stays a short, genuinely-triaged list, not a restatement of the whole
 * portfolio. The worst items sort first; a viewer whose scope has more
 * than this many exceptions still sees the ones most likely to need
 * their signature today. */
export const TRIAGE_LIMIT = 6;

export interface FlaggedProject {
  project: TriageProjectInput;
  drivers: TriageDriver[];
}

/**
 * Step 1 — pure, no phase/RAID data needed yet: which projects are Red or
 * over budget, worst first, capped to `TRIAGE_LIMIT`. The caller fetches
 * schedule phases + open RAID items only for the IDs this returns, rather
 * than for the whole scoped portfolio.
 */
export function selectTriageProjects(projects: TriageProjectInput[]): FlaggedProject[] {
  const flagged = projects
    .map((project) => {
      const overall = computeProjectHealth({ locked: project.locked, auditEntries: project.auditEntries });
      const drivers: TriageDriver[] = [];
      if (overall.code === 'R') drivers.push('Governance Red');
      if (project.healthCost === 'Red') drivers.push('Over Budget');
      if (project.healthSched === 'Red') drivers.push('Behind Schedule');
      return drivers.length > 0 ? { project, drivers } : null;
    })
    .filter((x): x is FlaggedProject => x !== null);

  // Worst first: more simultaneous drivers outrank fewer; among ties, the
  // bigger dollar variance — the number most likely to need a signature
  // today — breaks it.
  flagged.sort((a, b) => {
    const score = (x: FlaggedProject) => x.drivers.length * 1_000_000 + (x.project.actualsCost - x.project.bac);
    return score(b) - score(a);
  });

  return flagged.slice(0, TRIAGE_LIMIT);
}

/** Step 2 — the narrative synthesis, once the caller has fetched schedule
 * phases + open RAID items for exactly the flagged project IDs. */
export function buildExecutiveTriage(
  flagged: FlaggedProject[],
  phasesByProject: Map<string, SchedulePhaseInput[]>,
  raidByProject: Map<string, TriageRaidInput[]>
): TriageItem[] {
  return flagged.map(({ project, drivers }) => {
    const phases = phasesByProject.get(project.id) ?? [];
    const raidItems = [...(raidByProject.get(project.id) ?? [])].sort((a, b) => {
      if (a.escalate !== b.escalate) return a.escalate ? -1 : 1;
      const rankDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
      if (rankDiff !== 0) return rankDiff;
      if (a.targetDate && b.targetDate) return a.targetDate.localeCompare(b.targetDate);
      return a.targetDate ? -1 : b.targetDate ? 1 : 0;
    });
    const topRaid = raidItems[0] ?? null;

    const overBudgetAmt = project.actualsCost - project.bac;
    const financialImpact =
      drivers.includes('Over Budget') || overBudgetAmt > 0
        ? `$${Math.round(Math.abs(overBudgetAmt)).toLocaleString('en-US')} over budget`
        : null;

    const scheduleSummary = phases.length > 0 ? computeScheduleSummary({ phases }) : null;
    const scheduleImpact =
      scheduleSummary && scheduleSummary.worstSlipDays > 0 ? `${formatSlip(scheduleSummary.worstSlipDays)} behind plan` : null;

    const cause =
      project.narrativeBlockers?.trim() ||
      topRaid?.description?.split('\n')[0]?.slice(0, 160) ||
      `Flagged ${drivers.map((d) => d.toLowerCase()).join(' · ')} — no root-cause note logged yet.`;

    const ownerName = topRaid?.ownerName ?? project.deliveryManagerName ?? project.projectManagerName ?? null;
    const deadline = topRaid?.targetDate ?? null;
    const overdue = !!(deadline && new Date(deadline).getTime() < Date.now());

    const requiredAction = topRaid?.mitigationPlan?.trim() || templatedAction(drivers);

    return {
      projectId: project.id,
      projectName: project.name,
      drivers,
      cause,
      financialImpact,
      scheduleImpact,
      ownerName,
      deadline,
      overdue,
      requiredAction,
      driverHref: topRaid ? `/raid/${project.id}` : `/audit/${project.id}`,
      lastUpdated: topRaid?.updatedAt ?? project.updatedAt,
    };
  });
}

function formatSlip(days: number): string {
  const weeks = days / 7;
  if (weeks >= 1) {
    const rounded = Math.round(weeks * 10) / 10;
    return `${rounded} week${rounded === 1 ? '' : 's'}`;
  }
  return `${days} day${days === 1 ? '' : 's'}`;
}

function templatedAction(drivers: TriageDriver[]): string {
  if (drivers.includes('Over Budget')) return 'Approve a budget adjustment or reallocate scope to bring the EAC back in line.';
  if (drivers.includes('Behind Schedule')) return 'Approve a timeline extension or reallocate resources to recover pace.';
  return 'Review the control audit checklist to close the compliance gap driving Red status.';
}
