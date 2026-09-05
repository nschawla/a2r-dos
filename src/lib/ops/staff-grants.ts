/**
 * A2R Operator Control Plane — explicit staff-access entitlements.
 *
 * P0 #2 (2026-09): the former `User.isA2rStaff` boolean and the
 * `@a2rventures.com` email-domain wildcard (src/lib/ops/staff.ts) are gone.
 * Staff access is now ONE explicit row in `staff_grants`, tied to a
 * specific user id, attributed to the operator who granted it, with a
 * reason and a soft-revoke. A compromised corporate inbox grants nothing.
 *
 * An account is staff iff `hasActiveStaffGrant(userId)` — a live
 * `staff_grants` row with `revokedAt` still null. That is the single
 * source of truth: the NextAuth jwt callback resolves it into
 * `token.isA2rStaff` each request (fast, ≤1 request stale), and
 * src/lib/ops-auth.ts re-checks it here on every /ops render and action
 * (authoritative, zero staleness).
 *
 * Server-only: reads the Prisma client (so it can never be bundled into
 * the Edge middleware — that does its first-pass check on the JWT flag
 * alone).
 */
import { db } from '@/lib/db';

/**
 * Live check — one indexed `findFirst` on the small `staff_grants` table.
 * Called by the jwt callback (once/request), the ops-auth guard and the
 * lazy scope resolver (only on /ops routes). `staff_grants` is a platform
 * table (in UNSCOPED_MODELS), so this is unaffected by tenant scoping.
 */
export async function hasActiveStaffGrant(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const grant = await db.staffGrant.findFirst({
    where: { userId, revokedAt: null },
    select: { id: true },
  });
  return grant !== null;
}

export interface StaffGrantView {
  id: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  reason: string;
  grantedByEmail: string | null;
  grantedAt: string;
}

/** Every account that currently holds staff access, newest grant first. */
export async function listActiveStaffGrants(): Promise<StaffGrantView[]> {
  const rows = await db.staffGrant.findMany({
    where: { revokedAt: null },
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { email: true, name: true } } },
  });

  const granterIds = [...new Set(rows.map((r) => r.grantedByUserId).filter((v): v is string => v != null))];
  const granters = granterIds.length
    ? await db.user.findMany({ where: { id: { in: granterIds } }, select: { id: true, email: true } })
    : [];
  const granterEmail = new Map(granters.map((g) => [g.id, g.email]));

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userEmail: r.user.email,
    userName: r.user.name,
    reason: r.reason,
    grantedByEmail: r.grantedByUserId ? (granterEmail.get(r.grantedByUserId) ?? null) : null,
    grantedAt: r.createdAt.toISOString(),
  }));
}

export type StaffGrantResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Grant /ops access to the account with `email`. Idempotent — if the user
 * already holds a live grant, this is a no-op success.
 */
export async function grantStaffAccess(input: {
  email: string;
  grantedByUserId: string;
  reason: string;
}): Promise<StaffGrantResult> {
  const email = input.email.toLowerCase().trim();
  const reason = input.reason.trim();
  if (!email) return { ok: false, error: 'An email is required.' };
  if (reason.length < 3) return { ok: false, error: 'A reason (why this account needs operator access) is required.' };

  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return { ok: false, error: `No account exists for ${email}. They must sign in once first.` };

  const existing = await db.staffGrant.findFirst({ where: { userId: user.id, revokedAt: null }, select: { id: true } });
  if (existing) return { ok: true };

  await db.staffGrant.create({
    data: { userId: user.id, grantedByUserId: input.grantedByUserId, reason },
  });
  return { ok: true };
}

/**
 * Soft-revoke every live grant for the account with `email`. The rows stay
 * for the audit trail; the account loses access on its next request (the
 * jwt callback re-resolves) and immediately for any /ops render/action
 * (the guard re-checks live).
 */
export async function revokeStaffAccess(input: {
  email: string;
  revokedByUserId: string;
}): Promise<StaffGrantResult> {
  const email = input.email.toLowerCase().trim();
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return { ok: false, error: `No account exists for ${email}.` };

  if (user.id === input.revokedByUserId) {
    return { ok: false, error: 'You cannot revoke your own operator access.' };
  }

  const result = await db.staffGrant.updateMany({
    where: { userId: user.id, revokedAt: null },
    data: { revokedAt: new Date(), revokedByUserId: input.revokedByUserId },
  });
  if (result.count === 0) return { ok: false, error: `${email} does not currently hold operator access.` };
  return { ok: true };
}
