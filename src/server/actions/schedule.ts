'use server';

import { withAction } from '@/lib/observability/action-wrapper';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { PHASES } from '@/lib/constants';
import { authorizeProjectEdit } from '@/server/authz';
import type { ActionResult } from './auth';

const PHASE_KEYS = PHASES.map((p) => p.key) as [string, ...string[]];

const dateField = z.string().optional().or(z.literal(''));

const schema = z.object({
  projectId: z.string().min(1),
  phaseKey: z.enum(PHASE_KEYS),
  plannedStart: dateField,
  plannedEnd: dateField,
  // WP5 — the schema has no separate "forecast" columns (see the
  // migration notes for this WP), so a phase's forward-looking forecast
  // date and its eventual actual date share `actualStart`/`actualEnd`:
  // common PM practice is that the same field holds a forecast until it
  // becomes an actual, rather than carrying two parallel date pairs that
  // would only ever differ by which one is "true" this week.
  actualStart: dateField,
  actualEnd: dateField,
  pctComplete: z.number().finite().min(0).max(100),
  status: z.enum(['NOTSTARTED', 'INPROGRESS', 'COMPLETE', 'DELAYED']),
});

function toDateOrNull(s: string | undefined): Date | null {
  return s ? new Date(s) : null;
}

/**
 * WP5 — Module 5: persists one milestone phase's dates, % complete, and
 * status in one atomic Server Action call — ScheduleTracker.tsx's row
 * saves everything together, since a lone pctComplete update with a stale
 * planned-date pair could otherwise produce a momentarily-wrong Pace Risk
 * badge server-side (client-side it's always correctly recomputed live from
 * the full draft row via computePhasePace).
 */
export const updateSchedulePhase = withAction('updateSchedulePhase', async (input: unknown): Promise<ActionResult> => {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const { projectId, phaseKey, plannedStart, plannedEnd, actualStart, actualEnd, pctComplete, status } = parsed.data;

  const auth = await authorizeProjectEdit(projectId);
  if (!auth.ok) return { ok: false, error: auth.error };

  await db.schedulePhase.upsert({
    where: { projectId_phaseKey: { projectId, phaseKey } },
    update: {
      plannedStart: toDateOrNull(plannedStart),
      plannedEnd: toDateOrNull(plannedEnd),
      actualStart: toDateOrNull(actualStart),
      actualEnd: toDateOrNull(actualEnd),
      pctComplete,
      status,
    },
    create: {
      organizationId: auth.context.organizationId,
      projectId,
      phaseKey,
      plannedStart: toDateOrNull(plannedStart),
      plannedEnd: toDateOrNull(plannedEnd),
      actualStart: toDateOrNull(actualStart),
      actualEnd: toDateOrNull(actualEnd),
      pctComplete,
      status,
    },
  });

  revalidatePath('/');
  revalidatePath(`/schedule/${projectId}`);
  return { ok: true };
});
