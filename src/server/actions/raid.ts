'use server';

import { withAction } from '@/lib/observability/action-wrapper';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { withTenantTx } from '@/lib/db/with-tenant-tx';
import { requireOrgContext } from '@/lib/session';
import { authorizeProjectEdit } from '@/server/authz';
import { logAuditEvent } from '@/lib/audit/logger';
import type { ActionResult } from './auth';

const createSchema = z.strictObject({
  projectId: z.string().min(1),
  type: z.enum(['RISK', 'ASSUMPTION', 'ISSUE', 'DEPENDENCY']),
  title: z.string().max(200).optional().or(z.literal('')),
  description: z.string().min(1).max(2000),
  severity: z.enum(['CRITICAL', 'HIGH', 'MED', 'LOW']),
  likelihood: z.enum(['RARE', 'POSSIBLE', 'LIKELY', 'ALMOST_CERTAIN']).optional(),
  impact: z.string().max(2000).optional().or(z.literal('')),
  mitigationPlan: z.string().max(2000).optional().or(z.literal('')),
  ownerId: z.string().optional().or(z.literal('')),
  targetDate: z.string().optional().or(z.literal('')),
  escalate: z.boolean().optional(),
});

/**
 * WP5: the RAID Cockpit Board's Quick-Add drawer — now also collects
 * `title` (a short label distinct from the free-text description; see the
 * schema comment on RaidEntry.title), `impact`, and `mitigationPlan`, and
 * is gated by `authorizeProjectEdit` (this action had no edit-authority
 * check at all before WP5 — see WP4's canEditProject).
 */
export const createRaidEntry = withAction('createRaidEntry', async (input: unknown): Promise<ActionResult> => {
  const { userId } = await requireOrgContext();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const { projectId, type, title, description, severity, likelihood, impact, mitigationPlan, ownerId, targetDate, escalate } = parsed.data;

  const auth = await authorizeProjectEdit(projectId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const project = await db.project.findFirst({ where: { id: projectId }, select: { name: true } });

  await withTenantTx(async (tx) => {
    await tx.raidEntry.create({
      data: {
        organizationId: auth.context.organizationId,
        projectId,
        type,
        title: title || null,
        description,
        severity,
        likelihood: likelihood ?? 'POSSIBLE',
        impact: impact || null,
        mitigationPlan: mitigationPlan || null,
        ownerId: ownerId || null,
        targetDate: targetDate ? new Date(targetDate) : null,
        escalate: !!escalate,
      },
    });
    await tx.activityLogEntry.create({
      data: {
        organizationId: auth.context.organizationId,
        projectId,
        userId,
        text: `Logged a new ${type.toLowerCase()} on "${project?.name ?? projectId}"`,
        tab: 'raid',
      },
    });
  });

  revalidatePath('/');
  revalidatePath(`/raid/${projectId}`);
  return { ok: true };
});

const updateSchema = z.strictObject({
  id: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().max(200).optional().or(z.literal('')),
  description: z.string().min(1).max(2000),
  severity: z.enum(['CRITICAL', 'HIGH', 'MED', 'LOW']),
  likelihood: z.enum(['RARE', 'POSSIBLE', 'LIKELY', 'ALMOST_CERTAIN']).optional(),
  impact: z.string().max(2000).optional().or(z.literal('')),
  mitigationPlan: z.string().max(2000).optional().or(z.literal('')),
  ownerId: z.string().optional().or(z.literal('')),
  targetDate: z.string().optional().or(z.literal('')),
  status: z.enum(['OPEN', 'INPROGRESS', 'CLOSED']),
  escalate: z.boolean().optional(),
});

/**
 * WP5: RaidBoard.tsx's full inline-edit surface (severity, description,
 * owner, escalation, status — everything the Quick-Add drawer captures,
 * editable again afterward) collapsed into one Server Action rather than
 * one per field, since the board commits a row's edits together on save
 * (same per-row dirty-check + Save convention as AuditChecklist.tsx).
 * Supersedes the narrower `updateRaidStatus` below for the board's inline
 * editor; `updateRaidStatus` is kept for the quick status-only dropdown.
 */
export const updateRaidEntry = withAction('updateRaidEntry', async (input: unknown): Promise<ActionResult> => {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const { id, projectId, title, description, severity, likelihood, impact, mitigationPlan, ownerId, targetDate, status, escalate } = parsed.data;

  const auth = await authorizeProjectEdit(projectId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const existing = await db.raidEntry.findFirst({ where: { id, projectId }, select: { id: true } });
  if (!existing) return { ok: false, error: 'RAID item not found.' };

  await db.raidEntry.update({
    where: { id },
    data: {
      title: title || null,
      description,
      severity,
      ...(likelihood ? { likelihood } : {}),
      impact: impact || null,
      mitigationPlan: mitigationPlan || null,
      ownerId: ownerId || null,
      targetDate: targetDate ? new Date(targetDate) : null,
      status,
      escalate: !!escalate,
    },
  });

  revalidatePath('/');
  revalidatePath(`/raid/${projectId}`);
  return { ok: true };
});

const statusSchema = z.strictObject({
  id: z.string().min(1),
  projectId: z.string().min(1),
  status: z.enum(['OPEN', 'INPROGRESS', 'CLOSED']),
});

/** WP5: now gated by `authorizeProjectEdit` — previously any org member
 * could flip a RAID item's status regardless of RBAC edit authority. */
export const updateRaidStatus = withAction('updateRaidStatus', async (input: unknown): Promise<ActionResult> => {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const { id, projectId, status } = parsed.data;

  const auth = await authorizeProjectEdit(projectId);
  if (!auth.ok) return { ok: false, error: auth.error };

  await db.raidEntry.update({ where: { id }, data: { status } });
  revalidatePath('/');
  revalidatePath(`/raid/${projectId}`);
  return { ok: true };
});

const escalateSchema = z.strictObject({
  id: z.string().min(1),
  projectId: z.string().min(1),
  escalate: z.boolean(),
});

/** WP5: RaidBoard.tsx's dedicated SteerCo Escalation toggle — split out
 * from the full `updateRaidEntry` save so flagging an item for steering
 * visibility is a single click, not a full-row edit-and-save.
 *
 * WP6: this is the one RAID mutation the Audit Trail spec calls out by
 * name ("RAID escalations") — `updateRaidStatus`/`updateRaidEntry` stay
 * unlogged, matching the spec's precise scope rather than logging every
 * RAID edit.
 */
export const toggleRaidEscalation = withAction('toggleRaidEscalation', async (input: unknown): Promise<ActionResult> => {
  const parsed = escalateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const { id, projectId, escalate } = parsed.data;

  const auth = await authorizeProjectEdit(projectId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const previous = await db.raidEntry.findFirst({ where: { id, projectId }, select: { escalate: true, title: true, description: true } });
  if (!previous) return { ok: false, error: 'RAID item not found.' };

  if (previous.escalate === escalate) {
    // No-op — nothing changed, nothing to log.
    return { ok: true };
  }

  await withTenantTx(async (tx) => {
    await tx.raidEntry.update({ where: { id }, data: { escalate } });
    await logAuditEvent(tx, {
      organizationId: auth.context.organizationId,
      projectId,
      userId: auth.context.userId,
      action: escalate ? 'RAID_ESCALATED' : 'RAID_UNESCALATED',
      entityType: 'RAID_ENTRY',
      entityId: id,
      previousState: { escalate: previous.escalate, title: previous.title ?? previous.description.slice(0, 60) },
      newState: { escalate },
    });
  });

  revalidatePath('/');
  revalidatePath(`/raid/${projectId}`);
  return { ok: true };
});
