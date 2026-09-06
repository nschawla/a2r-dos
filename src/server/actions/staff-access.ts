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
import { requireElevatedOps } from '@/lib/ops-auth';
import {
  grantStaffAccess,
  revokeStaffAccess,
  type StaffGrantResult,
} from '@/lib/ops/staff-grants';

/** Grant / revoke staff are themselves high-privilege ops operations —
 * they need a live JIT elevation, not just a standing entitlement. */
async function elevatedOps(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const gate = await requireElevatedOps();
  if (gate.ok) return { ok: true, userId: gate.ops.userId };
  return {
    ok: false,
    error: gate.reason === 'ELEVATION_REQUIRED' ? 'ELEVATION_REQUIRED' : 'Not authorized.',
  };
}

const grantSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  reason: z.string().min(3, 'Give a short reason for the audit trail.').max(300),
});

const revokeSchema = z.object({ email: z.string().email() });

export async function grantStaffAction(input: unknown): Promise<StaffGrantResult> {
  const gate = await elevatedOps();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = grantSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };

  const result = await grantStaffAccess({
    email: parsed.data.email,
    reason: parsed.data.reason,
    grantedByUserId: gate.userId,
  });
  if (result.ok) revalidatePath('/ops/staff');
  return result;
}

export async function revokeStaffAction(input: unknown): Promise<StaffGrantResult> {
  const gate = await elevatedOps();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = revokeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid input.' };

  const result = await revokeStaffAccess({
    email: parsed.data.email,
    revokedByUserId: gate.userId,
  });
  if (result.ok) revalidatePath('/ops/staff');
  return result;
}
