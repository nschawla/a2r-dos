/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * The one place that assembles the Executive Action Triage feed end to
 * end (scoped project load → flag selection → driver reads → narrative
 * synthesis, src/lib/executive-triage.ts) — shared by the Command Center
 * page and the persona-aware Executive Agent (src/lib/executive-agent.ts)
 * so both are always looking at the exact same scoped, computed reality,
 * never two independently-drifting copies of the same logic.
 */
import type { OrgContext } from '@/lib/session';
import { getScopedPortfolioSummary, type ScopedPortfolioSummary } from '@/lib/db/scoped-portfolio';
import { toAuditEntries } from '@/server/queries/calc-adapters';
import { loadTriageDrivers } from '@/server/queries/pages/dashboards';
import {
  selectTriageProjects,
  buildExecutiveTriage,
  type TriageItem,
  type TriageProjectInput,
  type TriageRaidInput,
} from '@/lib/executive-triage';

export interface ExecutiveTriageResult {
  items: TriageItem[];
  portfolio: ScopedPortfolioSummary;
}

/**
 * @param preloadedPortfolio — pass the caller's own `getScopedPortfolioSummary`
 * result when it already has one (e.g. the Command Center page, which needs
 * it for its own vitals) to avoid fetching the scoped portfolio twice in
 * the same request. Omit to have this load it.
 */
export async function getExecutiveTriage(
  context: OrgContext,
  preloadedPortfolio?: ScopedPortfolioSummary
): Promise<ExecutiveTriageResult> {
  const portfolio = preloadedPortfolio ?? (await getScopedPortfolioSummary(context));

  const projectInputs: TriageProjectInput[] = portfolio.projects.map((p) => ({
    id: p.id,
    name: p.name,
    locked: p.locked,
    narrativeBlockers: p.narrativeBlockers,
    bac: Number(p.bac),
    actualsCost: Number(p.actualsCost),
    healthCost: p.healthCost,
    healthSched: p.healthSched,
    auditEntries: toAuditEntries(p.auditEntries),
    deliveryManagerName: p.deliveryManager?.name ?? null,
    projectManagerName: p.projectManager?.name ?? null,
    updatedAt: p.updatedAt.toISOString(),
  }));

  const flagged = selectTriageProjects(projectInputs);
  const { phases, raid } = await loadTriageDrivers(context, flagged.map((f) => f.project.id));

  const phasesByProject = new Map<string, typeof phases>();
  for (const ph of phases) {
    const list = phasesByProject.get(ph.projectId) ?? [];
    list.push(ph);
    phasesByProject.set(ph.projectId, list);
  }
  const raidByProject = new Map<string, TriageRaidInput[]>();
  for (const r of raid) {
    const list = raidByProject.get(r.projectId) ?? [];
    list.push({
      projectId: r.projectId,
      title: r.title,
      description: r.description,
      impact: r.impact,
      mitigationPlan: r.mitigationPlan,
      severity: r.severity,
      escalate: r.escalate,
      ownerName: r.owner?.name ?? null,
      targetDate: r.targetDate?.toISOString() ?? null,
      updatedAt: r.updatedAt.toISOString(),
    });
    raidByProject.set(r.projectId, list);
  }

  const items = buildExecutiveTriage(flagged, phasesByProject, raidByProject);
  return { items, portfolio };
}
