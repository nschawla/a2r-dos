/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Role-Based Scoped Filtering — the central "who sees what portfolio
 * data" utility. A server-side module, deliberately not a React context:
 * scoping is a trust boundary (which rows a query is even allowed to
 * return), and the only thing that can be trusted to decide it is the
 * signed-in session the server already holds (`OrgContext` — see
 * src/lib/session.ts) — never client state, which a browser can tamper
 * with. Every export here is either a pure function (unit-tested,
 * DB-free) or a thin, mechanical translation of that same pure logic
 * into a Prisma `where` clause, so the two can never silently drift.
 *
 * The two-tier model, from the real `DeliveryRole` enum
 * (src/lib/auth/rbac.ts) — there is no separate "PMO Head" / "PS Ops"
 * role in the schema; those are business-language stand-ins for the
 * existing **global** tier, granted today to ADMIN and VP_EXECUTIVE:
 *
 *   - **Global** (ADMIN, VP_EXECUTIVE) — every project, every resource,
 *     tenant-wide. "VPs, PMO Heads, PS Ops" in plain-English terms.
 *   - **Practice-scoped** (PRACTICE_DIRECTOR, DELIVERY_MANAGER) —
 *     restricted to their own `practiceId` (PD) or their direct reports
 *     (DM). "Practice Directors and Managers" in plain-English terms.
 *   - PROJECT_MANAGER sits below both — scoped to their own assignments
 *     only, included here for completeness since every consumer of this
 *     module needs a total, not partial, switch.
 *
 * Project-level scoping (`getScopedProjectWhere` /
 * `getScopedProjectsForUser`) already existed in
 * src/lib/db/scoped-portfolio.ts (built for the Control Tower and
 * Executive Hub) — re-exported here rather than duplicated, so this file
 * is genuinely the *one* place "is X in scope for this session" is
 * decided, for both projects and (newly) resources. `isProjectInScope`
 * below is a distinct axis from src/lib/auth/rbac.ts's `canEditProject`:
 * that answers "can this session *write* to this project"; this answers
 * "should this session ever *see* it" — a PROJECT_MANAGER might read a
 * teammate's engagement they're a contributor on without being able to
 * edit it, and a VP_EXECUTIVE sees the whole portfolio while editing
 * none of it.
 */
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import type { OrgContext } from '@/lib/session';
import type { DeliveryRole } from '@/lib/auth/rbac';
import {
  getScopedProjectWhere,
  getScopedProjectsForUser,
  getScopedPortfolioSummary,
  type ScopedProject,
  type ScopedPortfolioSummary,
  type ProgramRollupWithParent,
} from '@/lib/db/scoped-portfolio';

export {
  getScopedProjectWhere,
  getScopedProjectsForUser,
  getScopedPortfolioSummary,
  type ScopedProject,
  type ScopedPortfolioSummary,
  type ProgramRollupWithParent,
};

/** The global-visibility tier — everything else is practice/assignment
 * scoped. See this file's own doc comment for the PMO/PS-Ops mapping. */
export function isGlobalRole(deliveryRole: DeliveryRole): boolean {
  return deliveryRole === 'ADMIN' || deliveryRole === 'VP_EXECUTIVE';
}

/** The two roles this feature calls "Practice Directors and Managers" —
 * scoped by `practiceId` (PD) or direct reports (DM), never the whole
 * tenant. */
export function isPracticeScopedRole(deliveryRole: DeliveryRole): boolean {
  return deliveryRole === 'PRACTICE_DIRECTOR' || deliveryRole === 'DELIVERY_MANAGER';
}

// ------------------------------------------------------- pure predicates

/** The subset of a session's identity that scoping decisions key off —
 * intentionally just three primitives, so the pure predicates below take
 * no live session/DB objects and are trivially unit-testable. */
export interface ScopeIdentity {
  deliveryRole: DeliveryRole;
  resourceId: string | null;
  resourcePracticeId: string | null;
}

export interface ScopableProject {
  practiceDirectorId: string | null;
  practiceId: string | null;
  deliveryManagerId: string | null;
  projectManagerId: string | null;
}

/**
 * Pure equivalent of `getScopedProjectWhere`'s per-role branches — same
 * semantics, checked against a single already-fetched project instead of
 * pushed down into a Prisma `where`. `directReportIds` is only consulted
 * for DELIVERY_MANAGER (their direct reports' own PM-led projects); pass
 * `[]` when the caller doesn't have that list to hand.
 */
export function isProjectInScope(
  identity: ScopeIdentity,
  project: ScopableProject,
  directReportIds: readonly string[] = []
): boolean {
  switch (identity.deliveryRole) {
    case 'ADMIN':
    case 'VP_EXECUTIVE':
      return true;

    case 'PRACTICE_DIRECTOR':
      return (
        (identity.resourceId !== null && identity.resourceId === project.practiceDirectorId) ||
        (identity.resourcePracticeId !== null && identity.resourcePracticeId === project.practiceId)
      );

    case 'DELIVERY_MANAGER':
      if (identity.resourceId === null) return false;
      return (
        identity.resourceId === project.deliveryManagerId ||
        (project.projectManagerId !== null && directReportIds.includes(project.projectManagerId))
      );

    case 'PROJECT_MANAGER':
      return identity.resourceId !== null && identity.resourceId === project.projectManagerId;
  }
}

export interface ScopableResource {
  id: string;
  practiceId: string | null;
  managerId: string | null;
}

/**
 * Roster/capacity visibility — new (there was no resource-level
 * equivalent of getScopedProjectWhere before this file). Mirrors
 * `getScopedResourceWhere` below exactly:
 *
 *   - ADMIN / VP_EXECUTIVE: every resource in the tenant.
 *   - PRACTICE_DIRECTOR: resources whose `practiceId` matches their own —
 *     the literal relational field the PS-16 spec names, not
 *     `Resource.psPractice` (the free-text capacity-planning taxonomy
 *     bucket, a different concept — see that field's own schema comment).
 *   - DELIVERY_MANAGER: themself plus their direct reports.
 *   - PROJECT_MANAGER: themself only — a PM has no roster of their own to
 *     manage, only a project.
 */
export function isResourceInScope(identity: ScopeIdentity, resource: ScopableResource): boolean {
  switch (identity.deliveryRole) {
    case 'ADMIN':
    case 'VP_EXECUTIVE':
      return true;

    case 'PRACTICE_DIRECTOR':
      if (identity.resourcePracticeId !== null) return identity.resourcePracticeId === resource.practiceId;
      // No practice on file for this PD's own login — fail toward "at
      // least see yourself" rather than an empty roster.
      return identity.resourceId !== null && identity.resourceId === resource.id;

    case 'DELIVERY_MANAGER':
      return identity.resourceId !== null && (identity.resourceId === resource.id || identity.resourceId === resource.managerId);

    case 'PROJECT_MANAGER':
      return identity.resourceId !== null && identity.resourceId === resource.id;
  }
}

// -------------------------------------------------- Prisma where clauses

/** Matches nothing — used when a role's scope depends on a resource link
 * the session doesn't have (fails closed, never falls through to an
 * unscoped query). Mirrors scoped-portfolio.ts's own MATCH_NOTHING. */
const MATCH_NO_RESOURCE: Prisma.ResourceWhereInput = { id: { in: [] } };

/**
 * The roster/capacity equivalent of `getScopedProjectWhere` — must stay
 * in sync with `isResourceInScope` above (that pure predicate is the
 * tested spec; this is its DB-pushdown translation, kept together in
 * this file specifically so a change to one is hard to make without
 * seeing the other).
 */
export function getScopedResourceWhere(session: OrgContext): Prisma.ResourceWhereInput {
  const { organizationId, deliveryRole, resourceId, resourcePracticeId } = session;

  switch (deliveryRole) {
    case 'ADMIN':
    case 'VP_EXECUTIVE':
      return { organizationId };

    case 'PRACTICE_DIRECTOR': {
      if (resourcePracticeId) return { organizationId, practiceId: resourcePracticeId };
      return resourceId ? { organizationId, id: resourceId } : MATCH_NO_RESOURCE;
    }

    case 'DELIVERY_MANAGER': {
      if (!resourceId) return MATCH_NO_RESOURCE;
      return { organizationId, OR: [{ id: resourceId }, { managerId: resourceId }] };
    }

    case 'PROJECT_MANAGER': {
      return resourceId ? { organizationId, id: resourceId } : MATCH_NO_RESOURCE;
    }
  }
}

/** Convenience wrapper for the common case — a caller needing a custom
 * `select`/`include` should call `getScopedResourceWhere` directly and
 * build its own `db.resource.findMany`, same flexibility
 * `getScopedProjectWhere` already offers alongside
 * `getScopedProjectsForUser`. */
export async function getScopedResourcesForUser(session: OrgContext) {
  return db.resource.findMany({ where: getScopedResourceWhere(session), orderBy: { name: 'asc' } });
}
