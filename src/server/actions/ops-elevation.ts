'use server';

import { withAction } from '@/lib/observability/action-wrapper';

/**
 * A2R Operator Control Plane — request / drop a Just-In-Time privilege
 * elevation. See src/lib/ops/staff-elevation.ts and
 * docs/JIT_STAFF_ELEVATION.md.
 *
 * `requestOpsElevationAction` needs only a standing `staff_grants`
 * entitlement (getOpsContextOrNull). `endOpsElevationAction` is
 * de-escalation — it needs only a signed-in session.
 */
import { z } from 'zod';
import { cookies, headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOpsContextOrNull } from '@/lib/ops-auth';
import { rateLimitByUser } from '@/lib/rate-limit-action';
import { RATE_LIMITS } from '@/lib/rate-limits';
import {
  ELEVATION_COOKIE,
  requestElevation,
  endElevation,
  DEFAULT_TTL_MINUTES,
  maxTtlMinutes,
} from '@/lib/ops/staff-elevation';

export type ElevationActionResult =
  | { ok: true; expiresAt: string; ttlMinutes: number }
  | { ok: false; error: string; code?: 'MFA_SETUP_REQUIRED' | 'BAD_MFA' | 'BAD_PASSWORD' | 'NO_PASSWORD' };

const requestSchema = z.strictObject({
  reason: z.string().min(10, 'A reason of at least 10 characters is required.').max(500),
  // WP2 — step-up: the operator re-enters their password to escalate.
  password: z.string().min(1, 'Re-enter your password to elevate.').max(200),
  // Batch 2 — mandatory second factor: a 6-digit TOTP code or an
  // `XXXXX-XXXXX` recovery code.
  totpCode: z.string().min(6, 'Enter the 6-digit code from your authenticator app.').max(20),
  ttlMinutes: z.coerce.number().int().positive().optional(),
});

export const requestOpsElevationAction = withAction('requestOpsElevationAction', async (input: unknown): Promise<ElevationActionResult> => {
  const session = await getServerSession(authOptions);
  const ops = await getOpsContextOrNull();
  if (!ops || !session?.user) return { ok: false, error: 'Not authorized.' };

  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };

  // Each attempt runs a bcrypt compare — cap the rate per account so the
  // step-up cannot be used as a password oracle.
  const limited = await rateLimitByUser('ops-elevate', ops.userId, RATE_LIMITS.PASSWORD_CHANGE);
  if (limited) return { ok: false, error: 'Too many elevation attempts. Wait a minute and try again.' };

  const fwd = (await headers()).get('x-forwarded-for');
  const ip = fwd ? fwd.split(',')[0]?.trim() ?? null : null;

  const result = await requestElevation({
    userId: ops.userId,
    reason: parsed.data.reason,
    password: parsed.data.password,
    totpCode: parsed.data.totpCode,
    sessionVersion: session.sessionVersion ?? 0,
    ttlMinutes: parsed.data.ttlMinutes ?? DEFAULT_TTL_MINUTES,
    ip,
  });
  if (!result.ok) return { ok: false, error: result.error, code: result.code };

  (await cookies()).set(ELEVATION_COOKIE, result.token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: result.expiresAt,
  });

  revalidatePath('/ops', 'layout');
  return { ok: true, expiresAt: result.expiresAt.toISOString(), ttlMinutes: result.ttlMinutes };
});

export async function endOpsElevationAction(): Promise<{ ok: true }> {
  // De-escalation — a signed-in session is enough (you may already be past
  // your window and still want the cookie gone).
  const session = await getServerSession(authOptions);
  const jar = await cookies();
  const token = jar.get(ELEVATION_COOKIE)?.value;
  if (session?.user && token) {
    await endElevation(token, 'operator');
  }
  jar.delete(ELEVATION_COOKIE);
  revalidatePath('/ops', 'layout');
  return { ok: true };
}

/** The elevation window bounds, for the modal's duration picker. */
export async function getElevationLimits(): Promise<{ defaultMinutes: number; maxMinutes: number }> {
  return { defaultMinutes: DEFAULT_TTL_MINUTES, maxMinutes: maxTtlMinutes() };
}
