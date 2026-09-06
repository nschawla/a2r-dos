/**
 * A2R Operator Control Plane — request-time access guard for /ops/*.
 *
 * The internal ops console is gated on holding an explicit, un-revoked
 * `staff_grants` entitlement (src/lib/ops/staff-grants.ts). There is no
 * `User.isA2rStaff` boolean and no `@a2rventures.com` email shortcut any
 * more — a compromised corporate inbox grants nothing (P0 #2). It is a
 * platform-operator capability with no relationship to any client tenant's
 * MembershipRole / DeliveryAccessRole, so this guard deliberately does NOT
 * call requireOrgContext() — an operator commonly holds no client
 * Membership at all.
 *
 * middleware.ts does a first-pass check on the JWT flag for defence in
 * depth, but THIS is the authoritative gate: it re-checks the grant table
 * live (zero staleness — a revoke locks the operator out on their next
 * action, not their next token refresh). The (admin) route-group layout
 * and every ops Server Action call it.
 *
 * P1 JIT elevation: a standing grant reaches the /ops *read* views only.
 * Every mutating ops action calls `requireElevatedOps()`, which additionally
 * requires a live `staff_elevations` row bound to this session (the
 * `a2r_ops_elevation` cookie + a userId match). See
 * src/lib/ops/staff-elevation.ts and docs/JIT_STAFF_ELEVATION.md.
 */
import { getServerSession, type Session } from 'next-auth';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { hasActiveStaffGrant } from '@/lib/ops/staff-grants';
import {
  ELEVATION_COOKIE,
  resolveActiveElevation,
  toElevationView,
  type ElevationView,
} from '@/lib/ops/staff-elevation';
import { PasswordChangeRequiredError } from '@/lib/auth/password-rotation';
import { setAdminScope } from '@/lib/db/org-scope';

export interface OpsContext {
  session: Session;
  userId: string;
  email: string;
  name: string;
  /** P1 — the operator's live JIT elevation, or null when unelevated.
   * Every mutating ops action requires this to be non-null. */
  elevation: ElevationView | null;
}

/** Thrown by action helpers that can't return a result shape (e.g.
 * identity.ts's shared `authorizeSsoAction`) when a standing operator has
 * no live JIT elevation. `.code` lets the catching action surface it. */
export class OpsElevationRequiredError extends Error {
  readonly code = 'ELEVATION_REQUIRED' as const;
  readonly status = 403 as const;
  constructor(message = 'A Just-In-Time privilege elevation is required for this operation.') {
    super(message);
    this.name = 'OpsElevationRequiredError';
  }
}

async function toOpsContext(session: Session): Promise<OpsContext> {
  // The Ops Console is legitimately cross-tenant (telemetry aggregates
  // every org, provisioning creates them). Mark the request so the
  // org-scope Prisma extension lets these queries through.
  setAdminScope('ops-console');

  const userId = session.user.id;
  const token = cookies().get(ELEVATION_COOKIE)?.value;
  const row = await resolveActiveElevation(token);
  // Bind to the authenticated session: a stolen / stale cookie whose row
  // belongs to a different account confers nothing.
  const elevation = row && row.userId === userId ? toElevationView(row) : null;

  return {
    session,
    userId,
    email: session.user.email ?? '',
    name: session.user.name ?? session.user.email ?? 'Operator',
    elevation,
  };
}

/** Returns the ops context, or null when the caller is not signed in / not
 * A2R staff. Use from Server Actions (which return an error result rather
 * than redirect). Read-only: a standing grant is enough — the returned
 * context's `.elevation` may be null. */
export async function getOpsContextOrNull(): Promise<OpsContext | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  // P0 #3 — a forced-rotation operator session is strictly restricted.
  if (session.user.mustChangePassword) throw new PasswordChangeRequiredError();
  if (!(await hasActiveStaffGrant(session.user.id))) return null;
  return toOpsContext(session);
}

/** Redirecting guard for pages/layouts under the (admin) route group.
 * Sends unauthenticated users to /login and authenticated-but-not-staff
 * users back to the client workspace root. Read-only: does not require
 * an elevation (the layout renders in read-only mode when unelevated). */
export async function requireOpsContext(): Promise<OpsContext> {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  // P0 #3 — middleware redirects an /ops page navigation to
  // /change-password; this is the backstop for a direct action/layout call.
  if (session.user.mustChangePassword) throw new PasswordChangeRequiredError();
  if (!(await hasActiveStaffGrant(session.user.id))) redirect('/portfolio');
  return toOpsContext(session);
}

export type OpsGate =
  | { ok: true; ops: OpsContext }
  | { ok: false; reason: 'NOT_AUTHORIZED' | 'ELEVATION_REQUIRED' };

/**
 * The authoritative gate for every **mutating** ops Server Action. Returns
 * `NOT_AUTHORIZED` for a non-staff / signed-out / rotation-locked session,
 * and `ELEVATION_REQUIRED` for a standing operator with no live JIT
 * elevation. The caller maps the reason onto its own result shape.
 */
export async function requireElevatedOps(): Promise<OpsGate> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { ok: false, reason: 'NOT_AUTHORIZED' };
  if (session.user.mustChangePassword) throw new PasswordChangeRequiredError();
  if (!(await hasActiveStaffGrant(session.user.id))) return { ok: false, reason: 'NOT_AUTHORIZED' };

  const ops = await toOpsContext(session);
  if (!ops.elevation) return { ok: false, reason: 'ELEVATION_REQUIRED' };
  return { ok: true, ops };
}
