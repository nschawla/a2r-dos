/**
 * A2R Operator Control Plane — request-time access guard for /ops/*.
 *
 * The internal ops console is gated on being an A2R Ventures staff account
 * (User.isA2rStaff, or an @a2rventures.com email — see src/lib/ops/staff.ts).
 * It is a platform-operator capability with no relationship to any client
 * tenant's MembershipRole / DeliveryAccessRole, so this guard deliberately
 * does NOT call requireOrgContext() — an operator commonly holds no client
 * Membership at all.
 *
 * middleware.ts does a first-pass check on the JWT for defence in depth, but
 * this is the authoritative gate: the (admin) route-group layout and every
 * ops Server Action call it.
 */
import { getServerSession, type Session } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { resolveIsA2rStaff } from '@/lib/ops/staff';

export interface OpsContext {
  session: Session;
  userId: string;
  email: string;
  name: string;
}

function toOpsContext(session: Session): OpsContext {
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
  const staff =
    session.user.isA2rStaff === true ||
    resolveIsA2rStaff({ email: session.user.email, isA2rStaff: session.user.isA2rStaff });
  if (!staff) return null;
  return toOpsContext(session);
}

/** Redirecting guard for pages/layouts under the (admin) route group.
 * Sends unauthenticated users to /login and authenticated-but-not-staff
 * users back to the client workspace root. */
export async function requireOpsContext(): Promise<OpsContext> {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  const staff =
    session.user.isA2rStaff === true ||
    resolveIsA2rStaff({ email: session.user.email, isA2rStaff: session.user.isA2rStaff });
  if (!staff) redirect('/portfolio');
  return toOpsContext(session);
}
