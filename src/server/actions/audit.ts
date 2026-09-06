'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { authorizeProjectEdit } from '@/server/authz';
import { logAuditEvent } from '@/lib/audit/logger';

/** Richer than the shared ActionResult: AuditChecklist.tsx displays the
 * server's authoritative `updatedAt` as the per-control "verified at"
 * timestamp, rather than trusting the client's clock. */
export type UpdateAuditEntryResult = { ok: true; updatedAt: string } | { ok: false; error: string };

const schema = z.object({
  projectId: z.string().min(1),
  controlKey: z.string().min(1),
  status: z.enum(['YES', 'PARTIAL', 'NO', 'NA']),
  owner: z.string().max(120).optional().or(z.literal('')),
  repoLink: z.string().max(500).optional().or(z.literal('')),
  // WP5 — free-text verification notes distinct from the evidence link.
  notes: z.string().max(4000).optional().or(z.literal('')),
});

/**
 * WP5: gated by `authorizeProjectEdit` (the WP4 canEditProject check,
 * shared across every interactive-editor mutation — see src/server/authz.ts)
 * instead of the org-membership-only check this action had before. Also
 * now accepts `notes`. `updatedAt` (auto-managed by Prisma's @updatedAt)
 * doubles as the "verified at" timestamp AuditChecklist.tsx displays per
 * control — it's touched on every save, matrix mode or not.
 *
 * WP6: gated the same way as before, plus an Audit Trail entry — but only
 * when `status` itself actually changed. Editing just the owner/evidence
 * link/notes on an unchanged status isn't an "audit score modification"
 * (the spec's exact phrase), so it stays off the trail; a control with no
 * prior entry is treated as having previously been 'NO', matching
 * computeAuditProgress's own fallback for an unlogged control.
 */
export async function updateAuditEntry(input: unknown): Promise<UpdateAuditEntryResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const { projectId, controlKey, status, owner, repoLink, notes } = parsed.data;

  const auth = await authorizeProjectEdit(projectId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const previous = await db.auditEntry.findUnique({
    where: { projectId_controlKey: { projectId, controlKey } },
    select: { status: true },
  });
  const previousStatus = previous?.status ?? 'NO';

  const entry = await db.$transaction(async (tx) => {
    const row = await tx.auditEntry.upsert({
      where: { projectId_controlKey: { projectId, controlKey } },
      update: { status, owner: owner || null, repoLink: repoLink || null, notes: notes || null },
      create: {
        organizationId: auth.context.organizationId,
        projectId,
        controlKey,
        status,
        owner: owner || null,
        repoLink: repoLink || null,
        notes: notes || null,
      },
    });

    if (previousStatus !== status) {
      await logAuditEvent(tx, {
        organizationId: auth.context.organizationId,
        projectId,
        userId: auth.context.userId,
        action: 'AUDIT_SCORE_CHANGED',
        entityType: 'AUDIT_ENTRY',
        entityId: controlKey,
        previousState: { controlKey, status: previousStatus },
        newState: { controlKey, status },
      });
    }

    return row;
  });

  revalidatePath('/');
  revalidatePath(`/audit/${projectId}`);
  return { ok: true, updatedAt: entry.updatedAt.toISOString() };
}
