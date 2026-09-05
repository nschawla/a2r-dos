/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 * Proprietary and confidential. Licensed, not sold, under the A2R Delivery
 * OS Terms of Service & EULA (/terms) — see that document for the full
 * customer-data vs. A2R-IP ownership split and reverse-engineering
 * restrictions this file falls under.
 */

import { cache } from 'react';
import { getServerSession, type Session } from 'next-auth';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { resolveDeliveryRole, type DeliveryRole } from '@/lib/auth/rbac';
import { resolveIsA2rStaff } from '@/lib/ops/staff';
import { IMPERSONATION_COOKIE, resolveImpersonation } from '@/lib/ops/tenant-management';
import { getGovernanceConfig } from '@/lib/governance/service';
import { registerLazyScopeResolver, runUnscoped, setOrgScope } from '@/lib/db/org-scope';
import type { ResolvedGovernanceConfig } from '@/lib/governance/config';
import type { SessionMembership } from '@/types/next-auth';

export const ACTIVE_ORG_COOKIE = 'a2r_active_org';

/** Present when an A2R staff account is viewing a tenant workspace through
 * the Impersonation Gateway — always read-only. */
export interface ImpersonationContext {
  active: true;
  actorEmail: string;
  readOnly: boolean;
  expiresAt: string;
}

export interface OrgContext {
  session: Session;
  userId: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: SessionMembership['role'];
  memberships: SessionMembership[];
  /** WP4 — the effective, real RBAC tier for this membership (never null;
   * see resolveDeliveryRole for the fallback when Membership.deliveryRole
   * is unset). This is what src/lib/auth/rbac.ts's permission matrix and
   * src/lib/db/scoped-portfolio.ts's scoped queries actually key off. */
  deliveryRole: DeliveryRole;
  /** This user's Resource id in the active org, if their login is linked
   * to one (Resource.userId) — null for logins with no roster entry. */
  resourceId: string | null;
  /** The linked resource's own practice, if any. */
  resourcePracticeId: string | null;
  /** Set only when an A2R operator is inside this tenant via the
   * Impersonation Gateway. src/server/authz.ts blocks every write. */
  impersonation: ImpersonationContext | null;
  /** Enterprise Governance — the tenant's resolved Hybrid Configuration
   * (compliance template + Layer-2 module-visibility / financial-masking
   * overrides). See src/lib/governance/config.ts. */
  governance: ResolvedGovernanceConfig;
}

type OrgContextResult =
  | { ok: true; context: OrgContext }
  | { ok: false; reason: 'unauthenticated' | 'no-membership' };

/**
 * Shared resolution logic behind both requireOrgContext (pages/server
 * actions — redirects on failure) and getOrgContextOrNull (route handlers —
 * `redirect()` throws a Next.js-internal signal that only page rendering
 * catches; a route handler must return its own 401/403 JSON instead).
 */
// The body runs UNSCOPED — it is the bootstrap that decides which tenant
// this request belongs to, so it can't be tenant-scoped yet (it reads
// Resource / GovernanceConfig / ImpersonationGrant before the org is
// known). requireOrgContext / getOrgContextOrNull below then call
// setOrgScope() on the result, which pins every subsequent db call in
// the request.
const resolveOrgContext = cache(async (): Promise<OrgContextResult> => {
  return runUnscoped('resolve-org-context', () => resolveOrgContextInner());
});

const cachedServerSession = cache(() => getServerSession(authOptions));

// Backstop for the org-scope Prisma extension: if a tenant-model query runs
// with no scope explicitly set but inside a live request, this hands the
// extension the right scope. enterWith() set inside the async
// requireOrgContext() / requireOpsContext() guards is not *guaranteed* to
// propagate back across every App Router async boundary to the page /
// server-action body, so this resolver — not those setOrgScope /
// setAdminScope fast-path calls — is the dependable request-time mechanism.
// Kept to one real resolution per request by cache(). Returns undefined
// outside a request (scripts / jobs / tests scope explicitly) or for an
// unauthenticated one.
registerLazyScopeResolver(async () => {
  // Ops Console — middleware stamps this header on every /ops/* request
  // (page navigations and server-action POSTs alike). Legitimately
  // cross-tenant; middleware already verified the staff token, re-check here.
  let onOpsConsole = false;
  try {
    onOpsConsole = headers().get('x-a2r-scope') === 'ops';
  } catch {
    /* not in a request */
  }
  if (onOpsConsole) {
    const session = await cachedServerSession();
    const staff =
      session?.user != null &&
      (session.user.isA2rStaff === true ||
        resolveIsA2rStaff({ email: session.user.email, isA2rStaff: session.user.isA2rStaff }));
    if (staff) return { kind: 'admin', reason: 'ops-console' };
    return undefined;
  }

  const result = await resolveOrgContext();
  if (!result.ok) return undefined;
  return { kind: 'org', organizationId: result.context.organizationId };
});

async function resolveOrgContextInner(): Promise<OrgContextResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { ok: false, reason: 'unauthenticated' };

  const cookieStore = cookies();
  const memberships = session.memberships ?? [];

  // ── Impersonation Gateway override (A2R staff only) ──
  // A live grant carried in the a2r_impersonation cookie puts a staff
  // account inside the target tenant, read-only, regardless of whether
  // they hold a Membership in it.
  const impToken = cookieStore.get(IMPERSONATION_COOKIE)?.value;
  if (impToken && session.user.isA2rStaff) {
    const grant = await resolveImpersonation(impToken);
    if (grant) {
      const org = await db.organization.findUnique({
        where: { id: grant.organizationId },
        select: { id: true, name: true, slug: true },
      });
      if (org) {
        return {
          ok: true,
          context: {
            session,
            userId: session.user.id,
            organizationId: org.id,
            organizationName: org.name,
            organizationSlug: org.slug,
            role: 'VIEWER',
            memberships,
            deliveryRole: 'VP_EXECUTIVE', // read-only tier
            resourceId: null,
            resourcePracticeId: null,
            impersonation: {
              active: true,
              actorEmail: session.user.email ?? '',
              readOnly: grant.readOnly,
              expiresAt: grant.expiresAt.toISOString(),
            },
            governance: await getGovernanceConfig(org.id),
          },
        };
      }
    }
  }

  if (memberships.length === 0) return { ok: false, reason: 'no-membership' };

  const requestedOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const active: SessionMembership =
    memberships.find((m) => m.organizationId === requestedOrgId) ?? memberships[0]!;

  // WP4: resolve this login's Resource link (if any) for the active org —
  // a single indexed lookup, not carried in the JWT, since a Resource can
  // be (re-)linked to a login at any time by an admin and should take
  // effect on the next request, not just after re-login.
  const [resource, governance] = await Promise.all([
    db.resource.findFirst({
      where: { organizationId: active.organizationId, userId: session.user.id },
      select: { id: true, practiceId: true },
    }),
    getGovernanceConfig(active.organizationId),
  ]);

  return {
    ok: true,
    context: {
      session,
      userId: session.user.id,
      organizationId: active.organizationId,
      organizationName: active.organizationName,
      organizationSlug: active.organizationSlug,
      role: active.role,
      memberships,
      deliveryRole: resolveDeliveryRole(active),
      resourceId: resource?.id ?? null,
      resourcePracticeId: resource?.practiceId ?? null,
      impersonation: null,
      governance,
    },
  };
}

/**
 * Resolves the signed-in user's session plus which organization (tenant)
 * the current request is scoped to. Every server component / server action
 * that touches org-scoped data should call this rather than querying Prisma
 * with an org id taken from the client — the active org id here always
 * comes from a membership the session actually holds.
 *
 * Redirects to /login when unauthenticated, and to /onboarding when the
 * user has no organization yet (fresh signup, no org created/joined).
 */
export async function requireOrgContext(): Promise<OrgContext> {
  const result = await resolveOrgContext();
  if (!result.ok) {
    if (result.reason === 'unauthenticated') redirect('/login');
    // No membership: A2R staff belong in the ops console (they commonly
    // hold no client Membership at all); everyone else onboards a tenant.
    const session = await getServerSession(authOptions);
    redirect(session?.user?.isA2rStaff ? '/ops' : '/onboarding');
  }
  // Pin every db call in the rest of this request to this tenant.
  setOrgScope(result.context.organizationId);
  return result.context;
}

/**
 * Same resolution as requireOrgContext, but returns null instead of
 * redirecting — use this from route handlers (src/app/api/**\/route.ts),
 * where you want to return a 401/404 JSON response rather than a redirect.
 */
export async function getOrgContextOrNull(): Promise<OrgContext | null> {
  const result = await resolveOrgContext();
  if (!result.ok) return null;
  setOrgScope(result.context.organizationId);
  return result.context;
}
