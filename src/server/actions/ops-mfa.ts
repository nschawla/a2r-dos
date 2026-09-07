'use server';

/**
 * A2R Operator Control Plane — Batch 2: operator second-factor (TOTP)
 * enrollment. Rendered by /ops/security (src/components/ops/OperatorMfaPanel).
 *
 * Gating (deliberate exception to "every mutating ops action needs a live
 * elevation" — you cannot MFA-gate the MFA setup):
 *   - `beginOperatorMfaEnrollmentAction` — first-time enrollment needs a
 *     standing grant + a FRESH PASSWORD re-check. Rotating an already-active
 *     factor additionally needs a live JIT elevation.
 *   - `activateOperatorMfaAction` — standing grant; proves a live code.
 *
 * Disabling / resetting a factor is NOT here — a phished password must not
 * strip MFA. That is `npm run ops:mfa:reset -- <email>` (direct DB).
 */
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { withAction } from '@/lib/observability/action-wrapper';
import { db } from '@/lib/db';
import { getOpsContextOrNull, requireElevatedOps } from '@/lib/ops-auth';
import { rateLimitByUser } from '@/lib/rate-limit-action';
import { RATE_LIMITS } from '@/lib/rate-limits';
import {
  getMfaStatus,
  hasActivatedMfa,
  beginEnrollment,
  activateEnrollment,
  type MfaStatus,
} from '@/lib/ops/operator-mfa';

export type BeginEnrollmentResult =
  | { ok: true; secret: string; otpauthUri: string; qrDataUri: string; rotating: boolean }
  | { ok: false; error: string };

export type ActivateResult =
  | { ok: true; recoveryCodes: string[] }
  | { ok: false; error: string };

const beginSchema = z.strictObject({
  password: z.string().min(1, 'Enter your password.').max(200),
});
const activateSchema = z.strictObject({
  code: z.string().min(6, 'Enter the 6-digit code from your authenticator app.').max(10),
});

export const beginOperatorMfaEnrollmentAction = withAction(
  'beginOperatorMfaEnrollmentAction',
  async (input: unknown): Promise<BeginEnrollmentResult> => {
    const ops = await getOpsContextOrNull();
    if (!ops) return { ok: false, error: 'Not authorized.' };

    const parsed = beginSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };

    const limited = await rateLimitByUser('ops-mfa-enroll', ops.userId, RATE_LIMITS.PASSWORD_CHANGE);
    if (limited) return { ok: false, error: 'Too many attempts. Wait a minute and try again.' };

    const user = await db.user.findUnique({ where: { id: ops.userId }, select: { passwordHash: true } });
    if (!user?.passwordHash) {
      return { ok: false, error: 'Set a console password (Account → change password) before enrolling a second factor.' };
    }
    if (!(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      return { ok: false, error: 'Password incorrect.' };
    }

    // Rotating a live factor is a privileged operation — require an elevation.
    const rotating = await hasActivatedMfa(ops.userId);
    if (rotating) {
      const gate = await requireElevatedOps();
      if (!gate.ok) {
        return {
          ok: false,
          error:
            'You already have an active authenticator. Rotating it needs a live elevation, or use the operator CLI reset.',
        };
      }
    }

    const challenge = await beginEnrollment(ops.userId, ops.email || ops.name);
    return { ok: true, ...challenge, rotating };
  },
);

export const activateOperatorMfaAction = withAction(
  'activateOperatorMfaAction',
  async (input: unknown): Promise<ActivateResult> => {
    const ops = await getOpsContextOrNull();
    if (!ops) return { ok: false, error: 'Not authorized.' };

    const parsed = activateSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };

    const limited = await rateLimitByUser('ops-mfa-activate', ops.userId, RATE_LIMITS.PASSWORD_CHANGE);
    if (limited) return { ok: false, error: 'Too many attempts. Wait a minute and try again.' };

    const res = await activateEnrollment(ops.userId, parsed.data.code);
    if (!res.ok) {
      return {
        ok: false,
        error:
          res.reason === 'NO_PENDING'
            ? 'Start the enrollment again — no pending setup was found.'
            : 'That code is not valid. Check your authenticator app and try again.',
      };
    }
    return { ok: true, recoveryCodes: res.recoveryCodes };
  },
);

export async function getOperatorMfaStatusAction(): Promise<MfaStatus | null> {
  const ops = await getOpsContextOrNull();
  if (!ops) return null;
  return getMfaStatus(ops.userId);
}
