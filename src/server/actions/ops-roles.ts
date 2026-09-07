'use server';

/**
 * A2R Operator Control Plane — operator role management (v1.16.0).
 * Changing another operator's role needs `roles:manage` (SUPER_ADMIN only)
 * plus a live JIT elevation.
 */
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { withAction } from '@/lib/observability/action-wrapper';
import { requireElevatedOps } from '@/lib/ops-auth';
import { setOperatorRole } from '@/lib/ops/staff-grants';
import { OPERATOR_ROLES } from '@/lib/ops/operator-roles';

export type SetRoleResult = { ok: true } | { ok: false; error: string };

const schema = z.strictObject({
  targetUserId: z.string().min(1),
  role: z.enum(OPERATOR_ROLES),
  reason: z.string().max(300).optional(),
});

export const setOperatorRoleAction = withAction(
  'setOperatorRoleAction',
  async (input: unknown): Promise<SetRoleResult> => {
    const gate = await requireElevatedOps('roles:manage');
    if (!gate.ok) {
      if (gate.reason === 'ELEVATION_REQUIRED') return { ok: false, error: 'ELEVATION_REQUIRED' };
      return { ok: false, error: 'Only a Super Admin can change operator roles.' };
    }

    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };

    const result = await setOperatorRole({
      targetUserId: parsed.data.targetUserId,
      role: parsed.data.role,
      actingUserId: gate.ops.userId,
      reason: parsed.data.reason,
    });
    if (!result.ok) return result;

    revalidatePath('/ops/access');
    revalidatePath('/ops/staff');
    return { ok: true };
  },
);
