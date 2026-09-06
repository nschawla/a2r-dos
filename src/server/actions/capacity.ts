'use server';

import { withAction } from '@/lib/observability/action-wrapper';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { requireOrgContext } from '@/lib/session';
import { recordLedgerEvent } from '@/lib/audit-ledger';
import type { ActionResult } from './auth';

async function requireAdmin() {
  const ctx = await requireOrgContext();
  if (ctx.role !== 'OWNER' && ctx.role !== 'ADMIN') {
    throw new Error('Only org owners/admins can change capacity policy.');
  }
  return ctx;
}

function revalidateCapacity() {
  revalidatePath('/capacity');
  revalidatePath('/');
  revalidatePath('/admin/audit-log');
}

// ---------------------------------------------------------------- Holidays

const holidaySchema = z.object({
  name: z.string().min(1).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
});

export const createHoliday = withAction('createHoliday', async (input: unknown): Promise<ActionResult> => {
  const { organizationId, userId } = await requireAdmin();
  const parsed = holidaySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const date = new Date(`${parsed.data.date}T00:00:00.000Z`);
  const existing = await db.organizationHoliday.findUnique({
    where: { organizationId_date: { organizationId, date } },
  });
  if (existing) return { ok: false, error: 'A holiday already exists on that date.' };

  const created = await db.organizationHoliday.create({
    data: { organizationId, name: parsed.data.name, date },
  });
  await recordLedgerEvent(db, {
    organizationId,
    actorId: userId,
    actionType: 'HOLIDAY_CALENDAR_CHANGE',
    targetResource: `OrganizationHoliday:${created.id}`,
    metadata: { op: 'add', name: parsed.data.name, date: parsed.data.date },
  });
  revalidateCapacity();
  return { ok: true };
});

export const deleteHoliday = withAction('deleteHoliday', async (id: string): Promise<ActionResult> => {
  const { organizationId, userId } = await requireAdmin();
  const existing = await db.organizationHoliday.findFirst({
    where: { id, organizationId },
    select: { name: true, date: true },
  });
  await db.organizationHoliday.deleteMany({ where: { id, organizationId } });
  if (existing) {
    await recordLedgerEvent(db, {
      organizationId,
      actorId: userId,
      actionType: 'HOLIDAY_CALENDAR_CHANGE',
      targetResource: `OrganizationHoliday:${id}`,
      metadata: { op: 'remove', name: existing.name, date: existing.date.toISOString().slice(0, 10) },
    });
  }
  revalidateCapacity();
  return { ok: true };
});

// ------------------------------------------------------ Role utilisation policy

const policySchema = z.object({
  id: z.string().min(1),
  targetUtilPct: z.coerce.number().min(0).max(1),
  isBillableHead: z.boolean(),
});

export const updateRolePolicy = withAction('updateRolePolicy', async (input: unknown): Promise<ActionResult> => {
  const { organizationId, userId } = await requireAdmin();
  const parsed = policySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const { id, targetUtilPct, isBillableHead } = parsed.data;

  const existing = await db.roleUtilizationPolicy.findFirst({
    where: { id, organizationId },
    select: { id: true, roleName: true, targetUtilPct: true, isBillableHead: true },
  });
  if (!existing) return { ok: false, error: 'Policy not found.' };

  await db.roleUtilizationPolicy.update({ where: { id }, data: { targetUtilPct, isBillableHead } });
  // Keep the per-person fallback target in sync with the policy.
  await db.resource.updateMany({ where: { organizationId, rolePolicyId: id }, data: { targetUtilPct } });
  await recordLedgerEvent(db, {
    organizationId,
    actorId: userId,
    actionType: 'ROLE_POLICY_CHANGE',
    targetResource: `RoleUtilizationPolicy:${id}`,
    metadata: {
      roleName: existing.roleName,
      before: { targetUtilPct: existing.targetUtilPct, isBillableHead: existing.isBillableHead },
      after: { targetUtilPct, isBillableHead },
    },
  });
  revalidateCapacity();
  return { ok: true };
});

const createPolicySchema = z.object({
  roleName: z.string().min(1).max(120),
  targetUtilPct: z.coerce.number().min(0).max(1),
  isBillableHead: z.boolean(),
});

export const createRolePolicy = withAction('createRolePolicy', async (input: unknown): Promise<ActionResult> => {
  const { organizationId, userId } = await requireAdmin();
  const parsed = createPolicySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const existing = await db.roleUtilizationPolicy.findUnique({
    where: { organizationId_roleName: { organizationId, roleName: parsed.data.roleName } },
  });
  if (existing) return { ok: false, error: 'A policy with that role name already exists.' };

  const created = await db.roleUtilizationPolicy.create({ data: { organizationId, ...parsed.data } });
  await recordLedgerEvent(db, {
    organizationId,
    actorId: userId,
    actionType: 'ROLE_POLICY_CHANGE',
    targetResource: `RoleUtilizationPolicy:${created.id}`,
    metadata: { created: parsed.data },
  });
  revalidateCapacity();
  return { ok: true };
});
