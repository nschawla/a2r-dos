'use server';

/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Persists the signed-in user's Workspace Lens choice (see
 * src/lib/workspace/lenses.ts) in a cookie so the server-side landing
 * dispatcher (/launch) and the dashboard layout can honour it on the next
 * request. A lens is a UI preference — it gates nothing — so this does no
 * more than validate the value and write the cookie.
 */
import { cookies } from 'next/headers';
import { requireOrgContext } from '@/lib/session';
import { LENS_COOKIE, isLens, resolveLens, availableLenses, type WorkspaceLens } from '@/lib/workspace/lenses';

export async function setWorkspaceLens(lens: string): Promise<{ ok: boolean; lens: WorkspaceLens }> {
  const { deliveryRole, session, governance } = await requireOrgContext();
  const ctx = {
    deliveryRole,
    isA2rStaff: session.user.isA2rStaff === true,
    maskFinancialsForDelivery: governance.maskFinancialsForDelivery,
  };

  // Only store a lens the viewer is actually allowed to switch to; anything
  // else collapses to their resolved default.
  const next = isLens(lens) && availableLenses(ctx).includes(lens) ? lens : resolveLens(null, ctx);

  cookies().set(LENS_COOKIE, next, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  return { ok: true, lens: next };
}
