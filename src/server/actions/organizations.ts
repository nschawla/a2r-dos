'use server';

import { withAction } from '@/lib/observability/action-wrapper';

import { cookies } from 'next/headers';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ACTIVE_ORG_COOKIE } from '@/lib/session';
import { PASSWORD_CHANGE_REQUIRED, sessionRequiresPasswordChange } from '@/lib/auth/password-rotation';
import type { ActionResult } from './auth';

/**
 * Switches the "active organization" for this browser session by setting
 * ACTIVE_ORG_COOKIE — requireOrgContext() reads that cookie on every
 * subsequent request. Only allows switching to an org the signed-in user
 * actually holds a Membership in (checked against the session's own
 * membership list, not client input).
 */
export const switchActiveOrganization = withAction('switchActiveOrganization', async (organizationId: string): Promise<ActionResult> => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { ok: false, error: 'Not signed in.' };
  // P0 #3 — a forced-rotation session may not change any state.
  if (await sessionRequiresPasswordChange()) return { ok: false, error: PASSWORD_CHANGE_REQUIRED };

  const membership = (session.memberships ?? []).find((m) => m.organizationId === organizationId);
  if (!membership) return { ok: false, error: "You don't have access to that organization." };

  (await cookies()).set(ACTIVE_ORG_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  return { ok: true };
});
