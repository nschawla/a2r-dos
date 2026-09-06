'use server';

import { withAction } from '@/lib/observability/action-wrapper';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { authorizeProjectEdit } from '@/server/authz';
import { logAuditEvent } from '@/lib/audit/logger';
import type { ActionResult } from './auth';

const schema = z.object({
  projectId: z.string().min(1),
  // DeliveryRole.id in matrix mode, or the synthetic '_direct' row in
  // direct-intake mode — matches computeEacSummary's own convention
  // exactly (see FinancialActual's schema comment), so no translation is
  // needed between what this action writes and what the EAC engine reads.
  roleKey: z.string().min(1),
  hours: z.number().finite().min(0).max(1000000),
  cost: z.number().finite().min(0).max(1000000000),
  // Omit (or send null) to fall back to the role's baseline sold hours —
  // matches computeEacSummary's own "un-forecast role still lands on its
  // original sizing" default.
  forecastHours: z.number().finite().min(0).max(1000000).nullable().optional(),
  openRRHours: z.number().finite().min(0).max(1000000).nullable().optional(),
});

/**
 * WP5 — Module 4: saves one role's (or the direct-mode '_direct' row's)
 * Actual Hours/Cost to Date, Forecast Hours Remaining, and Open RR Demand
 * Hours. EacEditor.tsx commits a full row at once (all four fields
 * together) rather than per-cell, since the 4-field row is what
 * computeEacSummary treats as one atomic FinancialActualInput.
 *
 * roleKey isn't validated against the live rate-card roster the way
 * updateEffortCell validates roleId — a '_direct' key never appears there,
 * and a matrix-mode roleKey that's since been removed from the roster
 * should still be allowed to save (it simply won't render as a row until
 * the role is restored), matching computeEacSummary's own tolerant
 * handling of stale roleKeys.
 */
export const updateFinancialActual = withAction('updateFinancialActual', async (input: unknown): Promise<ActionResult> => {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const { projectId, roleKey, hours, cost, forecastHours, openRRHours } = parsed.data;

  const auth = await authorizeProjectEdit(projectId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const roleId = roleKey === '_direct' ? null : roleKey;
  const nextRow = { hours, cost, forecastHours: forecastHours ?? null, openRRHours: openRRHours ?? null };

  // WP6 — read the previous row first so the Audit Trail can show exactly
  // what changed, and so a no-op resave (identical values) can be skipped
  // rather than cluttering the trail with a change-free entry.
  const previous = await db.financialActual.findUnique({
    where: { projectId_roleKey: { projectId, roleKey } },
    select: { hours: true, cost: true, forecastHours: true, openRRHours: true },
  });

  await db.$transaction(async (tx) => {
    await tx.financialActual.upsert({
      where: { projectId_roleKey: { projectId, roleKey } },
      update: { ...nextRow, roleId },
      create: { organizationId: auth.context.organizationId, projectId, roleKey, roleId, ...nextRow },
    });

    const changed = !previous || JSON.stringify(previous) !== JSON.stringify(nextRow);
    if (changed) {
      await logAuditEvent(tx, {
        organizationId: auth.context.organizationId,
        projectId,
        userId: auth.context.userId,
        action: 'EAC_ACTUAL_UPDATED',
        entityType: 'FINANCIAL_ACTUAL',
        entityId: roleKey,
        previousState: previous ?? null,
        newState: nextRow,
      });
    }
  });

  revalidatePath('/');
  revalidatePath(`/financials/${projectId}`);
  return { ok: true };
});
