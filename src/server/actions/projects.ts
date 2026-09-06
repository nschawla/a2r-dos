'use server';

import { withAction } from '@/lib/observability/action-wrapper';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { withTenantTx } from '@/lib/db/with-tenant-tx';
import { requireOrgContext } from '@/lib/session';
import { DEFAULT_SCOPE, PHASES, CONTROL_DEFS } from '@/lib/constants';
import { computeTotalsFor } from '@/lib/calculations/sizing';
import { toRateRoles, toSizingInput } from '@/server/queries/calc-adapters';
import { canEditProject } from '@/lib/auth/rbac';
import { authorizeProjectEdit } from '@/server/authz';
import { logAuditEvent } from '@/lib/audit/logger';
import { recordLedgerEvent } from '@/lib/audit-ledger';
import type { ActionResult } from './auth';

/** Revalidates every per-module route a Commercial Baseline edit can affect
 * — sizing totals feed the Commercial Baseline page directly, but also the
 * EAC engine (Financials) and the Control Tower's portfolio rollup, so all
 * three need a fresh render, not just /commercial-baseline/[id]. */
function revalidateProjectRoutes(projectId: string) {
  revalidatePath('/');
  revalidatePath(`/commercial-baseline/${projectId}`);
  revalidatePath(`/financials/${projectId}`);
}

const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(200),
  client: z.string().max(200).optional().or(z.literal('')),
  commercialModel: z.enum(['FF', 'TM']).default('FF'),
  methodology: z.enum(['WATERFALL', 'AGILE', 'HYBRID']).default('WATERFALL'),
});

/**
 * Registers a new engagement, seeding its Universal Scope & Taxonomy Matrix,
 * Milestone Schedule, and Control Audit rows with the same fresh
 * defaults the prototype's freshScope()/freshSchedule()/freshAuditEntries()
 * produced for a brand-new project. Audit entry control labels are copied
 * from the org's current ControlLabel overrides (falling back to the
 * catalog's methodology-appropriate default) at creation time.
 */
export const createProject = withAction('createProject', async (input: unknown): Promise<ActionResult> => {
  const { organizationId, userId } = await requireOrgContext();

  const parsed = createProjectSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const { name, client, commercialModel, methodology } = parsed.data;

  await withTenantTx(async (tx) => {
    const project = await tx.project.create({
      data: {
        organizationId,
        name,
        client: client || null,
        commercialModel,
        methodology,
      },
    });

    await tx.scopeItem.createMany({
      data: DEFAULT_SCOPE.map((s, i) => ({
        organizationId,
        projectId: project.id,
        key: s.id,
        name: s.name,
        sortOrder: i,
      })),
    });

    await tx.schedulePhase.createMany({
      data: PHASES.map((p) => ({ organizationId, projectId: project.id, phaseKey: p.key })),
    });

    await tx.auditEntry.createMany({
      data: CONTROL_DEFS.map((c) => ({ organizationId, projectId: project.id, controlKey: c.id })),
    });

    await tx.activityLogEntry.create({
      data: {
        organizationId,
        projectId: project.id,
        userId,
        text: `Registered new engagement "${name}"`,
        tab: 'home',
      },
    });
  });

  revalidatePath('/');
  return { ok: true };
});

/**
 * Locks or unlocks a project's baseline.
 *
 * Locking snapshots the current sizing totals (via the WP2 calculation
 * engine, run through the same Prisma->engine adapters every module page
 * uses) as `baselineSnapshot` — this is what Module 4's EAC margin drift
 * and other "vs. baseline" comparisons are measured against. Unlocking
 * clears the snapshot entirely rather than leaving a stale one around.
 *
 * Authorization is checked against the session's real, effective WP4
 * DeliveryRole (src/lib/auth/rbac.ts#canEditProject — ADMIN always, or a
 * PRACTICE_DIRECTOR on this project/practice), independent of whatever
 * Persona is selected in the header switcher — the persona is a
 * client-only RBAC preview, not a security boundary, and must never gate
 * a mutation on its own. A tenant OWNER/ADMIN with no explicit
 * deliveryRole set still passes this check — resolveDeliveryRole()
 * defaults them to ADMIN — so this is a strict widening of who can lock a
 * baseline (now also PRACTICE_DIRECTOR), not a narrowing.
 */
export const toggleProjectLock = withAction('toggleProjectLock', async (projectId: string, lock: boolean): Promise<ActionResult> => {
  const { organizationId, userId, deliveryRole, resourceId, resourcePracticeId } = await requireOrgContext();

  const project = await db.project.findFirst({
    where: { id: projectId, organizationId },
    include: { effortCells: true },
  });
  if (!project) return { ok: false, error: 'Project not found.' };

  if (!canEditProject({ deliveryRole, resourceId, practiceId: resourcePracticeId }, project)) {
    return { ok: false, error: 'You do not have edit authority on this project.' };
  }

  if (lock) {
    const roles = await db.deliveryRole.findMany({ where: { organizationId } });
    const totals = computeTotalsFor(toSizingInput(project), toRateRoles(roles));
    const lockedAt = new Date();

    await withTenantTx(async (tx) => {
      await tx.project.update({
        where: { id: projectId },
        data: { locked: true, lockedAt, baselineSnapshot: totals as unknown as Prisma.InputJsonValue },
      });
      await tx.activityLogEntry.create({
        data: {
          organizationId,
          projectId,
          userId,
          text: `Locked baseline for "${project.name}" (${totals.contractValue.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })})`,
          tab: 'commercial-baseline',
        },
      });
      // WP6 — Audit Trail: baseline lock is one of the four "critical
      // state changes" the spec names explicitly. previousState/newState
      // capture exactly the fields that changed, plus the sizing totals
      // that got snapshotted, so a reviewer can see *what* was locked in
      // without cross-referencing another table.
      await logAuditEvent(tx, {
        organizationId,
        projectId,
        userId,
        action: 'BASELINE_LOCKED',
        entityType: 'PROJECT',
        entityId: projectId,
        previousState: { locked: project.locked, lockedAt: project.lockedAt, baselineSnapshot: project.baselineSnapshot },
        newState: { locked: true, lockedAt, baselineSnapshot: totals },
      });
    });
  } else {
    await withTenantTx(async (tx) => {
      await tx.project.update({
        where: { id: projectId },
        data: { locked: false, lockedAt: null, baselineSnapshot: Prisma.DbNull },
      });
      await tx.activityLogEntry.create({
        data: {
          organizationId,
          projectId,
          userId,
          text: `Unlocked baseline for "${project.name}"`,
          tab: 'commercial-baseline',
        },
      });
      await logAuditEvent(tx, {
        organizationId,
        projectId,
        userId,
        action: 'BASELINE_UNLOCKED',
        entityType: 'PROJECT',
        entityId: projectId,
        previousState: { locked: project.locked, lockedAt: project.lockedAt, baselineSnapshot: project.baselineSnapshot },
        newState: { locked: false, lockedAt: null, baselineSnapshot: null },
      });
      // SOC 2 Compliance Ledger — discarding a locked baseline is a
      // high-consequence override: it wipes the reference point every
      // future margin-drift/EAC comparison depends on.
      if (project.locked) {
        await recordLedgerEvent(tx, {
          organizationId,
          actorId: userId,
          actionType: 'BASELINE_OVERRIDE',
          targetResource: `Project:${projectId}`,
          metadata: { projectName: project.name, discardedLockedAt: project.lockedAt?.toISOString() ?? null },
        });
      }
    });
  }

  revalidatePath('/');
  revalidatePath(`/commercial-baseline/${projectId}`);
  revalidatePath(`/audit/${projectId}`);
  revalidatePath(`/raid/${projectId}`);
  revalidatePath(`/financials/${projectId}`);
  revalidatePath(`/schedule/${projectId}`);
  return { ok: true };
});

// =========================================================
// COMMERCIAL BASELINE — SIZING INTERACTIVE WORKSPACE
// =========================================================

const PHASE_KEYS = PHASES.map((p) => p.key) as [string, ...string[]];

const effortCellSchema = z.object({
  projectId: z.string().min(1),
  phaseKey: z.enum(PHASE_KEYS),
  roleId: z.string().min(1),
  hours: z.number().finite().min(0).max(100000),
});

/**
 * Upserts one cell of the Phase-Effort Matrix (Module 1, Matrix Mode). The
 * grid in DealEditor.tsx fires one of these per cell blur/commit rather
 * than batching the whole matrix, so an edit to one cell can never clobber
 * a concurrent edit to another — same optimistic-per-cell pattern as the
 * rest of WP5's editors.
 *
 * A locked project's baseline is a point-in-time snapshot, not a live
 * value, so editing cells after lock wouldn't retroactively change what was
 * locked in — canEditProject already reflects that (see rbac.ts), so no
 * separate "is this project locked" check is needed here.
 */
export const updateEffortCell = withAction('updateEffortCell', async (input: unknown): Promise<ActionResult> => {
  const parsed = effortCellSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const { projectId, phaseKey, roleId, hours } = parsed.data;

  const auth = await authorizeProjectEdit(projectId);
  if (!auth.ok) return { ok: false, error: auth.error };

  // A cell can only ever reference a role that actually exists on this
  // org's rate card — otherwise computeTotalsFor would silently drop it
  // (a role not present in `roles` contributes nothing, per sizing.ts),
  // producing a save that "succeeds" but has no visible effect.
  const role = await db.deliveryRole.findFirst({
    where: { id: roleId, organizationId: auth.context.organizationId },
    select: { id: true },
  });
  if (!role) return { ok: false, error: 'That delivery role no longer exists on this org’s rate card.' };

  await db.effortCell.upsert({
    where: { projectId_phaseKey_roleId: { projectId, phaseKey, roleId } },
    update: { hours },
    create: { organizationId: auth.context.organizationId, projectId, phaseKey, roleId, hours },
  });

  revalidateProjectRoutes(projectId);
  return { ok: true };
});

const directIntakeSchema = z.object({
  projectId: z.string().min(1),
  soldHours: z.number().finite().min(0).max(1000000),
  targetRevenue: z.number().finite().min(0).max(1000000000),
  blendedMarginPct: z.number().finite().min(0).max(99),
});

/**
 * Saves Module 1's Direct Baseline Intake Mode fields. All three are
 * required together — Direct Mode's math (sizing.ts's `estimationMode ===
 * 'direct'` branch) back-solves cost from margin, so a partial write (e.g.
 * hours with no revenue yet) would just render as a $0 deal rather than a
 * validation error; the form in DealEditor.tsx defaults all three to their
 * current saved value (or 0) so every submit is a complete triple.
 */
export const updateDirectIntake = withAction('updateDirectIntake', async (input: unknown): Promise<ActionResult> => {
  const parsed = directIntakeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const { projectId, soldHours, targetRevenue, blendedMarginPct } = parsed.data;

  const auth = await authorizeProjectEdit(projectId);
  if (!auth.ok) return { ok: false, error: auth.error };

  await db.project.update({
    where: { id: projectId },
    data: {
      directIntakeSoldHours: soldHours,
      directIntakeTargetRevenue: targetRevenue,
      directIntakeBlendedMarginPct: blendedMarginPct,
    },
  });

  revalidateProjectRoutes(projectId);
  return { ok: true };
});

const estimationModeSchema = z.object({
  projectId: z.string().min(1),
  mode: z.enum(['MATRIX', 'DIRECT']),
});

/**
 * Persists which of Module 1's two intake modes is authoritative for this
 * project — DealEditor.tsx's tab switcher isn't just a local view toggle:
 * computeTotalsFor (and everything downstream of it — the EAC engine, the
 * Control Tower rollup, baseline locking) reads `project.estimationMode`
 * to decide whether to sum the Phase-Effort Matrix or read Direct Intake
 * straight through, so the switch has to be saved, not just displayed.
 */
export const setEstimationMode = withAction('setEstimationMode', async (input: unknown): Promise<ActionResult> => {
  const parsed = estimationModeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const { projectId, mode } = parsed.data;

  const auth = await authorizeProjectEdit(projectId);
  if (!auth.ok) return { ok: false, error: auth.error };

  await db.project.update({ where: { id: projectId }, data: { estimationMode: mode } });

  revalidateProjectRoutes(projectId);
  return { ok: true };
});
