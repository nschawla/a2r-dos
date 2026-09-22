/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Assembles the real inputs src/lib/decision-options.ts needs for every
 * flagged (Red/over-budget/behind-schedule) engagement in one bounded set of
 * queries — never N+1 per project. Sits alongside src/server/queries/capacity.ts
 * and src/server/queries/executive-triage.ts (same directory level, same
 * direct-`db` + explicit organizationId convention those files already use).
 *
 * Skill/role matching uses `Resource.roleId → DeliveryRole.name` (a job
 * title/rank like "Senior Architect") — the app has no separate skills or
 * certification catalog, and this is its real, existing proxy. A flagged
 * project's own Delivery Manager's role stands in for "the kind of capacity
 * this engagement is short on." Where no real substitute with spare capacity
 * exists anywhere in the org, `swapCandidate` is `null` and the Resource
 * Re-leveling option is simply not offered — never invented.
 */
import { db } from '@/lib/db';
import type { OrgContext } from '@/lib/session';
import type { FlaggedProject } from '@/lib/executive-triage';
import type { ResourceCapacityRow } from '@/lib/capacity-engine';
import { buildDecisionOptions, type DecisionOption, type SwapCandidate } from '@/lib/decision-options';
import { loadCapacityRows, trailing13Weeks } from './capacity';

export interface InterventionRecord {
  id: string;
  optionKey: string;
  optionLabel: string;
  decidedByName: string;
  createdAt: string;
}

export interface DecisionContextEntry {
  options: DecisionOption[];
  clientTier: 'STRATEGIC' | 'STANDARD';
  /** Threaded through so InterventionDrawer can run the same client-side
   * guardrail preview (src/lib/decision-governance.ts) the server will
   * re-derive authoritatively on submit. */
  commercialModel: string;
  locked: boolean;
  /** Most recent PortfolioIntervention for this project, if any — the
   * "Intervention Applied" badge's source of truth. Always re-derived live
   * from row existence, never a denormalized flag on Project. */
  lastIntervention: InterventionRecord | null;
}

export async function loadDecisionContext(
  context: OrgContext,
  flagged: FlaggedProject[],
  /** Pass the caller's own `loadCapacityRows` result when it already has
   * one (Command Center and Portfolio both compute the org's blended
   * utilization from these same rows for their own vitals) to avoid
   * fetching + computing per-resource capacity twice in the same request.
   * Omit to have this load it itself. */
  preloadedCapacityRows?: ResourceCapacityRow[]
): Promise<Map<string, DecisionContextEntry>> {
  const result = new Map<string, DecisionContextEntry>();
  if (flagged.length === 0) return result;

  const { organizationId } = context;
  const ids = flagged.map((f) => f.project.id);
  const period = trailing13Weeks();
  const weeks = Math.max(1, Math.round((period.end.getTime() - period.start.getTime()) / (7 * 24 * 60 * 60 * 1000)));

  const [projectMeta, capacityRows, resourceRoles, interventions] = await Promise.all([
    db.project.findMany({
      where: { id: { in: ids }, organizationId },
      select: {
        id: true,
        commercialModel: true,
        clientTier: true,
        practiceDirectorId: true,
        deliveryManagerId: true,
        projectManagerId: true,
        deliveryManager: { select: { roleId: true } },
        contributors: { select: { resourceId: true } },
      },
    }),
    preloadedCapacityRows ? Promise.resolve(preloadedCapacityRows) : loadCapacityRows(organizationId, period),
    db.resource.findMany({
      where: { organizationId },
      select: { id: true, roleId: true, role: { select: { name: true } } },
    }),
    // Most-recent-first per project — Map below keeps only the first (latest).
    db.portfolioIntervention.findMany({
      where: { organizationId, projectId: { in: ids } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, projectId: true, optionKey: true, optionLabel: true, decidedByName: true, createdAt: true },
    }),
  ]);

  const projectMetaById = new Map(projectMeta.map((p) => [p.id, p]));
  const roleByResourceId = new Map(resourceRoles.map((r) => [r.id, { roleId: r.roleId, roleName: r.role?.name ?? null }]));
  const capacityByResourceId = new Map(capacityRows.map((r) => [r.id, r]));

  const lastInterventionByProject = new Map<string, InterventionRecord>();
  for (const iv of interventions) {
    if (!lastInterventionByProject.has(iv.projectId)) {
      lastInterventionByProject.set(iv.projectId, {
        id: iv.id,
        optionKey: iv.optionKey,
        optionLabel: iv.optionLabel,
        decidedByName: iv.decidedByName,
        createdAt: iv.createdAt.toISOString(),
      });
    }
  }

  // Pick a swap candidate per flagged project first (no query yet), then
  // batch-fetch every candidate's real current-project commitment in one
  // grouped query instead of one per project.
  const candidatesByProject = new Map<
    string,
    { resourceId: string; resourceName: string; roleName: string; headroomHours: number }
  >();
  for (const { project } of flagged) {
    const meta = projectMetaById.get(project.id);
    if (!meta) continue;
    const targetRoleId = meta.deliveryManager?.roleId ?? null;
    if (!targetRoleId) continue;

    const ownTeamIds = new Set(
      [meta.practiceDirectorId, meta.deliveryManagerId, meta.projectManagerId, ...meta.contributors.map((c) => c.resourceId)].filter(
        (x): x is string => !!x
      )
    );

    let best: { resourceId: string; resourceName: string; roleName: string; headroomHours: number } | null = null;
    for (const [resourceId, roleInfo] of roleByResourceId) {
      if (roleInfo.roleId !== targetRoleId || !roleInfo.roleName) continue;
      if (ownTeamIds.has(resourceId)) continue;
      const row = capacityByResourceId.get(resourceId);
      if (!row) continue;
      const headroomHours = row.availableHours - row.billableHours;
      if (headroomHours <= 0) continue;
      if (!best || headroomHours > best.headroomHours) {
        best = { resourceId, resourceName: row.name, roleName: roleInfo.roleName, headroomHours };
      }
    }
    if (best) candidatesByProject.set(project.id, best);
  }

  const candidateResourceIds = [...new Set([...candidatesByProject.values()].map((c) => c.resourceId))];
  const commitments =
    candidateResourceIds.length > 0
      ? await db.weeklyAssignmentSlot.groupBy({
          by: ['resourceId', 'projectId'],
          where: { organizationId, resourceId: { in: candidateResourceIds }, weekDate: { gte: period.start, lte: period.end } },
          _sum: { forecastedHours: true },
        })
      : [];

  // For each candidate, their single largest-hours project this period.
  const topCommitmentByResource = new Map<string, { projectId: string; hours: number }>();
  for (const c of commitments) {
    const hours = c._sum.forecastedHours ?? 0;
    if (hours <= 0) continue;
    const existing = topCommitmentByResource.get(c.resourceId);
    if (!existing || hours > existing.hours) topCommitmentByResource.set(c.resourceId, { projectId: c.projectId, hours });
  }
  const donorProjectIds = [...new Set([...topCommitmentByResource.values()].map((c) => c.projectId))];
  const donorProjects =
    donorProjectIds.length > 0
      ? await db.project.findMany({ where: { id: { in: donorProjectIds } }, select: { id: true, name: true } })
      : [];
  const donorProjectNameById = new Map(donorProjects.map((p) => [p.id, p.name]));

  const threshold = context.governance.interventionApprovalThresholdUsd;

  for (const { project, drivers } of flagged) {
    const meta = projectMetaById.get(project.id);
    if (!meta) continue;

    const candidate = candidatesByProject.get(project.id);
    let swapCandidate: SwapCandidate | null = null;
    if (candidate) {
      const commitment = topCommitmentByResource.get(candidate.resourceId) ?? null;
      swapCandidate = {
        resourceId: candidate.resourceId,
        resourceName: candidate.resourceName,
        roleName: candidate.roleName,
        headroomHours: candidate.headroomHours,
        donorProjectName: commitment ? (donorProjectNameById.get(commitment.projectId) ?? null) : null,
        donorProjectCommittedHoursPerWeek: commitment ? Math.round((commitment.hours / weeks) * 10) / 10 : null,
      };
    }

    const financialImpactUsd = project.actualsCost - project.bac > 0 ? project.actualsCost - project.bac : null;

    const options = buildDecisionOptions({
      drivers,
      clientTier: meta.clientTier,
      commercialModel: meta.commercialModel,
      locked: project.locked,
      financialImpactUsd,
      tcv: project.bac,
      approvalThresholdUsd: threshold,
      swapCandidate,
    });

    result.set(project.id, {
      options,
      clientTier: meta.clientTier,
      commercialModel: meta.commercialModel,
      locked: project.locked,
      lastIntervention: lastInterventionByProject.get(project.id) ?? null,
    });
  }

  return result;
}
