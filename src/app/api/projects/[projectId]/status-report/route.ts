import { NextResponse } from 'next/server';
import { getOrgContextOrNull } from '@/lib/session';
import { passwordRotationGate } from '@/lib/auth/password-rotation';
import { loadStatusReport } from '@/server/queries/reports-exports';
import { computeTotalsFor, type SizingTotals } from '@/lib/calculations/sizing';
import { computeEacSummary, computeContractorExposure } from '@/lib/calculations/financials';
import { computeScheduleSummary } from '@/lib/calculations/schedule';
import { computeProjectHealth } from '@/lib/calculations/audit';
import { computeFlightPathVariance, computeOpenDemandRisk } from '@/lib/calculations/reporting';
import { DEFAULT_SCHEDULE_TOLERANCES } from '@/lib/calculations/types';
import {
  toAuditEntries,
  toFinancialActuals,
  toRateRoles,
  toScheduleInput,
  toSizingInput,
} from '@/server/queries/calc-adapters';
import { SteerCoReportView, type TopRaidRiskViewData, type DecisionTrackerRowViewData } from '@/components/reports/SteerCoReportView';

const SEVERITY_RANK: Record<'CRITICAL' | 'HIGH' | 'MED' | 'LOW', number> = { CRITICAL: 0, HIGH: 1, MED: 2, LOW: 3 };
const RAID_TYPE_LABEL: Record<string, string> = { RISK: 'Risk', ASSUMPTION: 'Assumption', ISSUE: 'Issue', DEPENDENCY: 'Dependency' };

/**
 * "Export Status Report" / the Reports Hub's "SteerCo Status Deck" launcher
 * — a self-contained, print-ready HTML document sized for a 1280x720
 * steering-committee slide, built by src/components/reports/SteerCoReportView.tsx
 * (see that file's doc comment for why it's a string-builder, not JSX).
 * Opens in a new tab; the browser's own "Print to PDF" turns it into a
 * shareable PDF without this app needing a PDF-rendering dependency (none
 * is installable in this sandbox — see the README's npm-registry note).
 *
 * WP7 extends this beyond WP1-era health/EAC/schedule figures with the
 * Flight Path Variance bar (Sold → Approved Baseline → True EAC margin),
 * the Open Demand & Contractor Burn exposure alert, the top 3
 * SteerCo-escalated RAID risks, and the SteerCo Decision & Action Tracker
 * — all sourced from the same WP2/WP6/WP7 engine functions every module
 * page and the Reports Hub itself use, so this can never drift from what
 * the app's own pages show.
 */
export async function GET(_request: Request, { params }: { params: { projectId: string } }) {
  const blocked = await passwordRotationGate();
  if (blocked) return blocked;
  const context = await getOrgContextOrNull();
  if (!context) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const { project, roles, policy, escalatedRaid, decisions } = await loadStatusReport(
    { organizationId: context.organizationId },
    params.projectId,
  );
  if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });

  const rateRoles = toRateRoles(roles);
  const sizingInput = toSizingInput(project);
  const totals: SizingTotals = computeTotalsFor(sizingInput, rateRoles);
  const eac = computeEacSummary(sizingInput, rateRoles, toFinancialActuals(project.financials));
  const contractorExposure = computeContractorExposure(eac);
  const openDemand = computeOpenDemandRisk(eac);
  const tolerances = policy
    ? { warnDays: policy.slipWarnDays, critDays: policy.slipCritDays }
    : DEFAULT_SCHEDULE_TOLERANCES;
  const scheduleSummary = computeScheduleSummary(toScheduleInput(project.schedulePhases), tolerances);
  const health = computeProjectHealth({ locked: project.locked, auditEntries: toAuditEntries(project.auditEntries) });

  // The baseline snapshot is whatever SizingTotals object toggleProjectLock
  // last wrote (see projects.ts) — a plain JSON blob, so its marginPct is
  // read defensively rather than trusted as a typed shape.
  const baselineMarginPct =
    project.baselineSnapshot && typeof project.baselineSnapshot === 'object' && 'marginPct' in project.baselineSnapshot
      ? Number((project.baselineSnapshot as { marginPct: unknown }).marginPct)
      : null;
  const flightPath = computeFlightPathVariance({
    soldMarginPct: totals.marginPct,
    baselineMarginPct: Number.isFinite(baselineMarginPct) ? baselineMarginPct : null,
    eacMarginPct: eac.eacMarginPct,
  });

  const topRaidRisks: TopRaidRiskViewData[] = [...escalatedRaid]
    .sort((a, b) => {
      const rank = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (rank !== 0) return rank;
      const aTime = a.targetDate ? a.targetDate.getTime() : Infinity;
      const bTime = b.targetDate ? b.targetDate.getTime() : Infinity;
      return aTime - bTime;
    })
    .slice(0, 3)
    .map((r) => ({
      id: r.id,
      typeLabel: RAID_TYPE_LABEL[r.type] ?? r.type,
      title: r.title || (r.description.length > 70 ? `${r.description.slice(0, 70)}…` : r.description),
      severity: r.severity,
      mitigationPlan: r.mitigationPlan,
      targetDate: r.targetDate ? r.targetDate.toISOString() : null,
    }));

  const decisionRows: DecisionTrackerRowViewData[] = decisions.map((d) => ({
    id: d.id,
    decisionRequired: d.decisionRequired,
    decisionOwnerName: d.owner?.name ?? null,
    resolutionTargetDate: d.resolutionTargetDate ? d.resolutionTargetDate.toISOString() : null,
    status: d.status,
  }));

  const generatedAt = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

  const html = SteerCoReportView({
    organizationName: context.organizationName,
    project: {
      name: project.name,
      client: project.client,
      locked: project.locked,
      lockedAt: project.lockedAt ? project.lockedAt.toISOString() : null,
    },
    health,
    contractValue: totals.contractValue,
    eac: { totalActualCost: eac.totalActualCost, totalEacCost: eac.totalEacCost, drift: eac.drift, status: eac.status },
    flightPath,
    openDemand,
    contractorExposure,
    schedule: {
      worstPace: scheduleSummary.worstPace,
      paceCriticalCount: scheduleSummary.paceCriticalCount,
      paceWarningCount: scheduleSummary.paceWarningCount,
    },
    topRaidRisks,
    decisions: decisionRows,
    generatedAt,
  });

  return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
