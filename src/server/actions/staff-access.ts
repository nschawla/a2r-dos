'use server';

/**
 * A2R Operator Control Plane — grant / revoke internal /ops access.
 *
 * P0 #2: staff access is an explicit `staff_grants` entitlement, not a
 * boolean and not an email-domain wildcard. Only a current operator
 * (getOpsContextOrNull) can grant or revoke, every change is attributed to
 * them, and you cannot revoke your own access.
 */
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getOpsContextOrNull } from '@/lib/ops-auth';
import {
  grantStaffAccess,
  revokeStaffAccess,
  type StaffGrantResult,
} from '@/lib/ops/staff-grants';

const grantSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  reason: z.string().min(3, 'Give a short reason for the audit trail.').max(300),
});

const revokeSchema = z.object({ email: z.string().email() });

export async function grantStaffAction(input: unknown): Promise<StaffGrantResult> {
  const ops = await getOpsContextOrNull();
  if (!ops) return { ok: false, error: 'Not authorized.' };

  const parsed = grantSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };

  const result = await grantStaffAccess({
    email: parsed.data.email,
    reason: parsed.data.reason,
    grantedByUserId: ops.userId,
  });
  if (result.ok) revalidatePath('/ops/staff');
  return result;
}

export async function revokeStaffAction(input: unknown): Promise<StaffGrantResult> {
  const ops = await getOpsContextOrNull();
  if (!ops) return { ok: false, error: 'Not authorized.' };

  const parsed = revokeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid input.' };

  const result = await revokeStaffAccess({
    email: parsed.data.email,
    revokedByUserId: ops.userId,
  });
  if (result.ok) revalidatePath('/ops/staff');
  return result;
}
