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
import {
  ELEVATION_COOKIE,
  requestElevation,
  endElevation,
  DEFAULT_TTL_MINUTES,
  maxTtlMinutes,
} from '@/lib/ops/staff-elevation';

export type ElevationActionResult =
  | { ok: true; expiresAt: string; ttlMinutes: number }
  | { ok: false; error: string };

const requestSchema = z.object({
  reason: z.string().min(10, 'A reason of at least 10 characters is required.').max(500),
  ttlMinutes: z.coerce.number().int().positive().optional(),
});

export const requestOpsElevationAction = withAction('requestOpsElevationAction', async (input: unknown): Promise<ElevationActionResult> => {
  const ops = await getOpsContextOrNull();
  if (!ops) return { ok: false, error: 'Not authorized.' };

  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };

  const fwd = headers().get('x-forwarded-for');
  const ip = fwd ? fwd.split(',')[0]?.trim() ?? null : null;

  const result = await requestElevation({
    userId: ops.userId,
    reason: parsed.data.reason,
    ttlMinutes: parsed.data.ttlMinutes ?? DEFAULT_TTL_MINUTES,
    ip,
  });
  if (!result.ok) return result;

  cookies().set(ELEVATION_COOKIE, result.token, {
    httpOnly: true,
    sameSite: 'lax',
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
  const token = cookies().get(ELEVATION_COOKIE)?.value;
  if (session?.user && token) {
    await endElevation(token, 'operator');
  }
  cookies().delete(ELEVATION_COOKIE);
  revalidatePath('/ops', 'layout');
  return { ok: true };
}

/** The elevation window bounds, for the modal's duration picker. */
export async function getElevationLimits(): Promise<{ defaultMinutes: number; maxMinutes: number }> {
  return { defaultMinutes: DEFAULT_TTL_MINUTES, maxMinutes: maxTtlMinutes() };
}
