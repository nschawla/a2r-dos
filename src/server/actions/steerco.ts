'use server';

/**
 * WP7 — SteerCo Decision & Action Tracker CRUD. Mirrors raid.ts's
 * conventions closely (same `authorizeProjectEdit` gate, same
 * `revalidatePath` set, same "read is a lighter org-scoped check than
 * write" split as audit-log.ts's `fetchAuditTrail`) since a SteerCo
 * decision is, mechanically, another small per-project record a PM/PD
 * manages — the thing that's different is what it *means* (see the schema
 * comment on SteerCoDecision), not how it's authorized.
 *
 * Deliberately NOT hooked into the WP6 Audit Trail (`logAuditEvent`):
 * that trail is scoped to the four specific "critical state changes" the
 * WP6 spec named plus WP6's own two bulk-mutation surfaces (see
 * logger.ts's doc comment) — extending it to every new model this app
 * ever gains would erode that deliberate scope discipline. A SteerCo
 * decision's own `status`/`updatedAt`/`resolutionNotes` fields are already
 * that record's history; a separate governance log entry for "someone
 * edited a decision" isn't what WP6 was building.
 */
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { requireOrgContext } from '@/lib/session';
import { authorizeProjectEdit } from '@/server/authz';
import type { ActionResult } from './auth';

export interface SteerCoDecisionView {
  id: string;
  decisionRequired: string;
  decisionOwnerId: string | null;
  decisionOwnerName: string | null;
  resolutionTargetDate: string | null;
  status: 'OPEN' | 'RESOLVED';
  resolutionNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ListSteerCoDecisionsResult = { ok: true; decisions: SteerCoDecisionView[] } | { ok: false; error: string };

/** Read access matches fetchAuditTrail's own bar — "this project is in my
 * org" — not edit authority, so anyone who can load the Reports Hub for a
 * project in their scope can see its decision tracker, even if they
 * couldn't add to it themselves. */
export async function listSteerCoDecisions(projectId: string): Promise<ListSteerCoDecisionsResult> {
  const { organizationId } = await requireOrgContext();

  const project = await db.project.findFirst({ where: { id: projectId, organizationId }, select: { id: true } });
  if (!project) return { ok: false, error: 'Project not found.' };

  const rows = await db.steerCoDecision.findMany({
    where: { projectId },
    orderBy: [{ status: 'asc' }, { resolutionTargetDate: 'asc' }, { createdAt: 'desc' }],
    include: { owner: { select: { name: true } } },
  });

  return {
    ok: true,
    decisions: rows.map((r) => ({
      id: r.id,
      decisionRequired: r.decisionRequired,
      decisionOwnerId: r.decisionOwnerId,
      decisionOwnerName: r.owner?.name ?? null,
      resolutionTargetDate: r.resolutionTargetDate ? r.resolutionTargetDate.toISOString() : null,
      status: r.status,
      resolutionNotes: r.resolutionNotes,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  };
}

const createSchema = z.object({
  projectId: z.string().min(1),
  decisionRequired: z.string().min(1).max(2000),
  decisionOwnerId: z.string().optional().or(z.literal('')),
  resolutionTargetDate: z.string().optional().or(z.literal('')),
});

export async function createSteerCoDecision(input: unknown): Promise<ActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const { projectId, decisionRequired, decisionOwnerId, resolutionTargetDate } = parsed.data;

  const auth = await authorizeProjectEdit(projectId);
  if (!auth.ok) return { ok: false, error: auth.error };

  await db.steerCoDecision.create({
    data: {
      projectId,
      decisionRequired,
      decisionOwnerId: decisionOwnerId || null,
      resolutionTargetDate: resolutionTargetDate ? new Date(resolutionTargetDate) : null,
    },
  });

  revalidatePath('/reports');
  revalidatePath(`/commercial-baseline/${projectId}`);
  return { ok: true };
}

const statusSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  status: z.enum(['OPEN', 'RESOLVED']),
  resolutionNotes: z.string().max(2000).optional().or(z.literal('')),
});

/** Resolving (or reopening) a decision together with an optional
 * resolution note — one call, matching updateRaidStatus's own
 * single-field-plus-context shape rather than splitting the note into a
 * second round trip. */
export async function updateSteerCoDecisionStatus(input: unknown): Promise<ActionResult> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const { id, projectId, status, resolutionNotes } = parsed.data;

  const auth = await authorizeProjectEdit(projectId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const existing = await db.steerCoDecision.findFirst({ where: { id, projectId }, select: { id: true } });
  if (!existing) return { ok: false, error: 'Decision not found.' };

  await db.steerCoDecision.update({
    where: { id },
    data: { status, resolutionNotes: resolutionNotes || null },
  });

  revalidatePath('/reports');
  revalidatePath(`/commercial-baseline/${projectId}`);
  return { ok: true };
}

const deleteSchema = z.object({ id: z.string().min(1), projectId: z.string().min(1) });

export async function deleteSteerCoDecision(input: unknown): Promise<ActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const { id, projectId } = parsed.data;

  const auth = await authorizeProjectEdit(projectId);
  if (!auth.ok) return { ok: false, error: auth.error };

  await db.steerCoDecision.deleteMany({ where: { id, projectId } });

  revalidatePath('/reports');
  revalidatePath(`/commercial-baseline/${projectId}`);
  return { ok: true };
}
