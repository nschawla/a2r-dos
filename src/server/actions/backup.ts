'use server';

import { withAction } from '@/lib/observability/action-wrapper';
import { rateLimitByUser } from '@/lib/rate-limit-action';
import { RATE_LIMITS } from '@/lib/rate-limits';

/**
 * WP6 — Workspace Backup & Restore server actions. Both gated by
 * `authorizeAdminAction('admin:workspace')` (see src/server/authz.ts's doc
 * comment on why this is a distinct, more guarded gate than
 * `authorizeProjectEdit`) — this is the one WP6 capability that can touch
 * every project in the tenant at once, not just the one a user has edit
 * authority on.
 *
 * RESTORE IS ADDITIVE, NEVER DESTRUCTIVE ACROSS THE WHOLE TENANT: restoring
 * an older snapshot upserts (id-preserving) every Practice / DeliveryRole /
 * Resource / Project *present in the snapshot*, and for each of those
 * projects, wipes and recreates its child collections (Scope Items, Effort
 * Matrix, Audit Checklist, RAID Register, Financials, Schedule) from
 * exactly what the snapshot says — but it never deletes a Practice, role,
 * Resource, or Project that exists in the current tenant but *isn't* in
 * the snapshot. A literal "make the tenant exactly match this old backup"
 * restore would silently destroy every project created since that backup
 * was taken, which is a far more dangerous default than an admin
 * restoring an old snapshot actually expects. If a true wipe-to-snapshot
 * capability is ever needed, it should be an explicit, separately
 * confirmed action — not this one's default behavior.
 */
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { authorizeAdminAction } from '@/server/authz';
import { logAuditEvent } from '@/lib/audit/logger';
import { recordLedgerEvent } from '@/lib/audit-ledger';
import {
  buildWorkspaceSnapshot,
  validateWorkspaceSnapshot,
  checkSnapshotReferentialIntegrity,
  type WorkspaceSnapshot,
} from '@/lib/backup/workspace-io';

export type ExportWorkspaceSnapshotResult = { ok: true; snapshot: WorkspaceSnapshot } | { ok: false; error: string };

export const exportWorkspaceSnapshot = withAction('exportWorkspaceSnapshot', async (): Promise<ExportWorkspaceSnapshotResult> => {
  const auth = await authorizeAdminAction('admin:workspace');
  if (!auth.ok) return { ok: false, error: auth.error };
  const { organizationId, userId } = auth.context;

  const limited = await rateLimitByUser('workspace:export', userId, RATE_LIMITS.WORKSPACE_SNAPSHOT);
  if (limited) return limited;

  const [org, practices, deliveryRoles, resources, orgPolicy, controlLabels, projects] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } }),
    db.practice.findMany({ where: { organizationId }, select: { id: true, name: true } }),
    db.deliveryRole.findMany({
      where: { organizationId },
      select: { id: true, name: true, billRate: true, costRate: true, practiceId: true, employmentType: true },
    }),
    db.resource.findMany({
      where: { organizationId },
      select: { id: true, name: true, email: true, roleId: true, practiceId: true, managerId: true },
    }),
    db.orgPolicy.findUnique({
      where: { organizationId },
      select: { slipWarnDays: true, slipCritDays: true, marginCritPct: true, methodology: true },
    }),
    db.controlLabel.findMany({ where: { organizationId }, select: { controlKey: true, label: true } }),
    db.project.findMany({
      where: { organizationId },
      include: {
        scopeItems: { select: { key: true, name: true, included: true, complexity: true, notes: true, custom: true, sortOrder: true } },
        effortCells: { select: { phaseKey: true, roleId: true, hours: true } },
        auditEntries: { select: { controlKey: true, status: true, owner: true, repoLink: true, notes: true } },
        raidEntries: {
          select: {
            type: true,
            title: true,
            description: true,
            impact: true,
            mitigationPlan: true,
            severity: true,
            ownerId: true,
            targetDate: true,
            status: true,
            escalate: true,
          },
        },
        financials: { select: { roleKey: true, roleId: true, hours: true, cost: true, forecastHours: true, openRRHours: true } },
        schedulePhases: {
          select: { phaseKey: true, plannedStart: true, plannedEnd: true, actualStart: true, actualEnd: true, pctComplete: true, status: true },
        },
        contributors: { select: { resourceId: true } },
      },
    }),
  ]);

  const snapshot = buildWorkspaceSnapshot({
    organizationName: org.name,
    practices,
    deliveryRoles,
    resources,
    orgPolicy,
    controlLabels,
    projects,
  });

  await logAuditEvent(db, {
    organizationId,
    projectId: null,
    userId,
    action: 'WORKSPACE_EXPORTED',
    entityType: 'WORKSPACE',
    entityId: organizationId,
    previousState: null,
    newState: { projectCount: snapshot.projects.length, deliveryRoleCount: snapshot.deliveryRoles.length, resourceCount: snapshot.resources.length },
  });

  return { ok: true, snapshot };
});

export type RestoreWorkspaceSnapshotResult =
  | { ok: true; projectCount: number; deliveryRoleCount: number; resourceCount: number }
  | { ok: false; error: string; issues?: string[] };

export const restoreWorkspaceSnapshot = withAction('restoreWorkspaceSnapshot', async (input: unknown): Promise<RestoreWorkspaceSnapshotResult> => {
  const auth = await authorizeAdminAction('admin:workspace');
  if (!auth.ok) return { ok: false, error: auth.error };
  const { organizationId, userId } = auth.context;

  const limited = await rateLimitByUser('workspace:restore', userId, RATE_LIMITS.WORKSPACE_SNAPSHOT);
  if (limited) return limited;

  const validated = validateWorkspaceSnapshot(input);
  if (!validated.ok) return { ok: false, error: validated.error };
  const snapshot = validated.snapshot;

  const issues = checkSnapshotReferentialIntegrity(snapshot);
  if (issues.length > 0) {
    return { ok: false, error: `This snapshot has ${issues.length} internal reference problem(s) and cannot be restored.`, issues: issues.map((i) => i.message) };
  }

  await db.$transaction(async (tx) => {
    // 1. Practices — id-preserving upsert, no self-reference.
    for (const p of snapshot.practices) {
      await tx.practice.upsert({
        where: { id: p.id },
        update: { organizationId, name: p.name },
        create: { id: p.id, organizationId, name: p.name },
      });
    }

    // 2. Org Policy — unique on organizationId, not id-preserving.
    if (snapshot.orgPolicy) {
      await tx.orgPolicy.upsert({
        where: { organizationId },
        update: snapshot.orgPolicy,
        create: { organizationId, ...snapshot.orgPolicy },
      });
    }

    // 3. Control label overrides — unique on [organizationId, controlKey].
    for (const c of snapshot.controlLabels) {
      await tx.controlLabel.upsert({
        where: { organizationId_controlKey: { organizationId, controlKey: c.controlKey } },
        update: { label: c.label },
        create: { organizationId, controlKey: c.controlKey, label: c.label },
      });
    }

    // 4. Delivery Roles (rate card + WP6 employmentType) — id-preserving.
    for (const r of snapshot.deliveryRoles) {
      await tx.deliveryRole.upsert({
        where: { id: r.id },
        update: { organizationId, name: r.name, billRate: r.billRate, costRate: r.costRate, practiceId: r.practiceId, employmentType: r.employmentType },
        create: {
          id: r.id,
          organizationId,
          name: r.name,
          billRate: r.billRate,
          costRate: r.costRate,
          practiceId: r.practiceId,
          employmentType: r.employmentType,
        },
      });
    }

    // 5. Resources — id-preserving, two-pass for the managerId
    // self-reference (a manager row must exist before it can be pointed
    // at). userId is deliberately never written by restore — see this
    // file's top doc comment — so an existing login link on a resource
    // already in this tenant is never touched, and a newly-created
    // resource never re-links to whatever User currently happens to hold
    // the snapshot's original id.
    for (const r of snapshot.resources) {
      await tx.resource.upsert({
        where: { id: r.id },
        update: { organizationId, name: r.name, email: r.email, roleId: r.roleId, practiceId: r.practiceId },
        create: { id: r.id, organizationId, name: r.name, email: r.email, roleId: r.roleId, practiceId: r.practiceId },
      });
    }
    for (const r of snapshot.resources) {
      await tx.resource.update({ where: { id: r.id }, data: { managerId: r.managerId } });
    }

    // 6. Projects — id-preserving, two-pass for the parentId
    // self-reference (PARENT/CHILD hierarchy).
    for (const p of snapshot.projects) {
      const base = {
        organizationId,
        name: p.name,
        client: p.client,
        externalId: p.externalId,
        commercialModel: p.commercialModel,
        methodology: p.methodology,
        govProfile: p.govProfile,
        estimationMode: p.estimationMode,
        contingencyPct: p.contingencyPct,
        practiceDirectorId: p.practiceDirectorId,
        deliveryManagerId: p.deliveryManagerId,
        projectManagerId: p.projectManagerId,
        practiceId: p.practiceId,
        hierarchyLevel: p.hierarchyLevel,
        waveTag: p.waveTag,
        locked: p.locked,
        lockedAt: p.lockedAt ? new Date(p.lockedAt) : null,
        baselineSnapshot: p.baselineSnapshot ?? undefined,
        directIntakeSoldHours: p.directIntakeSoldHours,
        directIntakeTargetRevenue: p.directIntakeTargetRevenue,
        directIntakeBlendedMarginPct: p.directIntakeBlendedMarginPct,
        narrativeAccomplishments: p.narrativeAccomplishments,
        narrativeBlockers: p.narrativeBlockers,
        narrativePriorities: p.narrativePriorities,
      };
      await tx.project.upsert({
        where: { id: p.id },
        update: base,
        create: { id: p.id, ...base },
      });
    }
    for (const p of snapshot.projects) {
      await tx.project.update({ where: { id: p.id }, data: { parentId: p.parentId } });
    }

    // 7. Per-project child collections — wipe and recreate from the
    // snapshot exactly, rather than trying to diff/upsert each child row
    // against whatever's currently in the database (which may have
    // different rows entirely, e.g. CSV-imported effort cells added since
    // this snapshot was taken). Fresh ids are fine here: nothing else in
    // the schema references a ScopeItem/EffortCell/AuditEntry/RaidEntry/
    // FinancialActual/SchedulePhase/ProjectContributor row by its own id.
    for (const p of snapshot.projects) {
      await Promise.all([
        tx.scopeItem.deleteMany({ where: { projectId: p.id } }),
        tx.effortCell.deleteMany({ where: { projectId: p.id } }),
        tx.auditEntry.deleteMany({ where: { projectId: p.id } }),
        tx.raidEntry.deleteMany({ where: { projectId: p.id } }),
        tx.financialActual.deleteMany({ where: { projectId: p.id } }),
        tx.schedulePhase.deleteMany({ where: { projectId: p.id } }),
        tx.projectContributor.deleteMany({ where: { projectId: p.id } }),
      ]);

      if (p.scopeItems.length > 0) {
        await tx.scopeItem.createMany({ data: p.scopeItems.map((s) => ({ organizationId, projectId: p.id, ...s })) });
      }
      if (p.effortCells.length > 0) {
        await tx.effortCell.createMany({ data: p.effortCells.map((c) => ({ organizationId, projectId: p.id, ...c })) });
      }
      if (p.auditEntries.length > 0) {
        await tx.auditEntry.createMany({ data: p.auditEntries.map((a) => ({ organizationId, projectId: p.id, ...a })) });
      }
      if (p.raidEntries.length > 0) {
        await tx.raidEntry.createMany({
          data: p.raidEntries.map((r) => ({ organizationId, projectId: p.id, ...r, targetDate: r.targetDate ? new Date(r.targetDate) : null })),
        });
      }
      if (p.financials.length > 0) {
        await tx.financialActual.createMany({ data: p.financials.map((f) => ({ organizationId, projectId: p.id, ...f })) });
      }
      if (p.schedulePhases.length > 0) {
        await tx.schedulePhase.createMany({
          data: p.schedulePhases.map((s) => ({
            organizationId,
            projectId: p.id,
            ...s,
            plannedStart: s.plannedStart ? new Date(s.plannedStart) : null,
            plannedEnd: s.plannedEnd ? new Date(s.plannedEnd) : null,
            actualStart: s.actualStart ? new Date(s.actualStart) : null,
            actualEnd: s.actualEnd ? new Date(s.actualEnd) : null,
          })),
        });
      }
      if (p.contributorResourceIds.length > 0) {
        await tx.projectContributor.createMany({ data: p.contributorResourceIds.map((resourceId) => ({ organizationId, projectId: p.id, resourceId })) });
      }
    }

    await logAuditEvent(tx, {
      organizationId,
      projectId: null,
      userId,
      action: 'WORKSPACE_RESTORED',
      entityType: 'WORKSPACE',
      entityId: organizationId,
      previousState: null,
      newState: {
        projectCount: snapshot.projects.length,
        deliveryRoleCount: snapshot.deliveryRoles.length,
        resourceCount: snapshot.resources.length,
        snapshotExportedAt: snapshot.exportedAt,
      },
    });
    // SOC 2 Compliance Ledger — a full-tenant restore overwrites live
    // governance data; among the highest-consequence actions in the app.
    await recordLedgerEvent(tx, {
      organizationId,
      actorId: userId,
      actionType: 'WORKSPACE_RESTORE',
      targetResource: `Organization:${organizationId}`,
      metadata: {
        projectCount: snapshot.projects.length,
        deliveryRoleCount: snapshot.deliveryRoles.length,
        resourceCount: snapshot.resources.length,
        snapshotExportedAt: snapshot.exportedAt,
      },
    });
  });

  revalidatePath('/');
  revalidatePath('/admin');
  revalidatePath('/admin/audit-log');

  return { ok: true, projectCount: snapshot.projects.length, deliveryRoleCount: snapshot.deliveryRoles.length, resourceCount: snapshot.resources.length };
});
