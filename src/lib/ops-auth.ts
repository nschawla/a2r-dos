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
 */
import { getServerSession, type Session } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { hasActiveStaffGrant } from '@/lib/ops/staff-grants';
import { PasswordChangeRequiredError } from '@/lib/auth/password-rotation';
import { setAdminScope } from '@/lib/db/org-scope';

export interface OpsContext {
  session: Session;
  userId: string;
  email: string;
  name: string;
}

function toOpsContext(session: Session): OpsContext {
  // The Ops Console is legitimately cross-tenant (telemetry aggregates
  // every org, provisioning creates them). Mark the request so the
  // org-scope Prisma extension lets these queries through.
  setAdminScope('ops-console');
  return {
    session,
    userId: session.user.id,
    email: session.user.email ?? '',
    name: session.user.name ?? session.user.email ?? 'Operator',
  };
}

/** Returns the ops context, or null when the caller is not signed in / not
 * A2R staff. Use from Server Actions (which return an error result rather
 * than redirect). */
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
 * users back to the client workspace root. */
export async function requireOpsContext(): Promise<OpsContext> {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  // P0 #3 — middleware redirects an /ops page navigation to
  // /change-password; this is the backstop for a direct action/layout call.
  if (session.user.mustChangePassword) throw new PasswordChangeRequiredError();
  if (!(await hasActiveStaffGrant(session.user.id))) redirect('/portfolio');
  return toOpsContext(session);
}
