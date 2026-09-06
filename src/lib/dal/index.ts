/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * ── The Data Access Layer (DAL) ────────────────────────────────────────
 *
 * The single, named entry point for tenant database access. Server
 * components, route handlers, and UI components MUST NOT import
 * `@/lib/db` directly — an ESLint `no-restricted-imports` rule + the
 * `tests/dal-boundary.test.ts` guard enforce that. They call a query
 * function from `src/server/queries/**` (reads) or a server action from
 * `src/server/actions/**` (writes); those, and this module, are the only
 * places `@/lib/db` is imported.
 *
 * Two independent layers keep a query inside its tenant:
 *
 *   1. Verified context. Every reachable path resolves a server-verified
 *      tenant through `requireOrgContext()` / `getOrgContextOrNull()` /
 *      `requireOpsContext()` / `withApiAuth()` before touching the DB, and
 *      passes `organizationId` into each `where`. `assertTenantContext()`
 *      below is the fail-closed gate a DAL/query function calls first.
 *
 *   2. ORM auto-scoping (src/lib/db/org-scope.ts). The Prisma client
 *      extension rewrites EVERY query on a tenant-owned model to include
 *      the request's `organizationId`, and THROWS `OrgScopeError` if a
 *      tenant query runs with no resolved scope. Fail-closed in every
 *      environment except `NODE_ENV=test` (warn + passthrough, so the
 *      security suites can seed fixtures).
 *
 * After P1 (migration 00000000000012) all 29 tenant-owned models carry
 * their own `organizationId` column + FK to `organizations(id)` — there
 * is no join-scoped model left, so the DB itself ties every row to its
 * tenant. See docs/DATA_ACCESS_LAYER.md and docs/RLS_ROADMAP.md.
 *
 * Node-only (pulls in AsyncLocalStorage via @/lib/db). Never imported by
 * the Edge middleware.
 */
import { db } from '@/lib/db';
import { currentOrgScope } from '@/lib/db/org-scope';

/**
 * The tenant-scoped Prisma client. Identical instance to `@/lib/db`'s
 * `db` — re-exported under a name that marks the call site as living
 * inside the DAL. Every operation on a tenant model is org-scoped by the
 * extension; a query with no resolved scope throws.
 */
export const tenantDb = db;

/** Thrown when a DAL / query function is called without a usable tenant
 * context, or reaches a bare query with no resolved org scope. Callers
 * treat this as a 401/redirect, never a 500 they swallow. */
export class TenantContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantContextError';
  }
}

/** The minimal shape a query function needs from an `OrgContext`. */
export interface TenantScoped {
  organizationId: string;
}

/**
 * Fail-closed gate. Call this first in every `src/server/queries/**`
 * function that accepts a resolved context. A missing, null, non-string,
 * or blank `organizationId` throws rather than falling through to an
 * unscoped query.
 */
export function assertTenantContext(
  context: { organizationId?: string | null } | null | undefined,
): asserts context is TenantScoped {
  if (
    !context ||
    typeof context.organizationId !== 'string' ||
    context.organizationId.trim() === ''
  ) {
    throw new TenantContextError(
      'DAL call with missing / ambiguous tenant context — resolve requireOrgContext() first',
    );
  }
}

/**
 * Assert the AsyncLocalStorage scope cell is populated before running a
 * bare (no-`where`) query that relies entirely on the extension to inject
 * the tenant filter. Cheap belt-and-suspenders for query functions that
 * don't take an explicit context object.
 */
export function requireResolvedScope(): void {
  if (!currentOrgScope()) {
    throw new TenantContextError('DAL query reached with no resolved org scope');
  }
}
