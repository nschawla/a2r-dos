/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * ORM-level tenant scoping — the belt-and-suspenders layer over the
 * hand-written `organizationId` filters in server actions and queries.
 *
 * The database itself does NOT enforce Row Level Security for the
 * application's queries (Prisma connects as a BYPASSRLS role — see
 * docs/RLS_ROADMAP.md for the plan to change that). Until then, this
 * module makes it structurally impossible for a Prisma query against a
 * tenant-owned model to run without an org filter:
 *
 *   1. An AsyncLocalStorage cell carries the request's scope — either a
 *      resolved `organizationId`, or an explicit `admin` marker for the
 *      handful of legitimately cross-tenant / pre-session code paths.
 *   2. `src/lib/db.ts` extends the Prisma client so every operation on a
 *      tenant model injects that `organizationId` into its `where` (and,
 *      for `create`, its `data`). A query with NO scope set throws.
 *
 * This is pure query rewriting — no session state is ever attached to a
 * pooled connection, so there is zero cross-request / cross-pool leak
 * surface. It does not replace the existing scoped queries; it backstops
 * a developer forgetting one.
 *
 * Node-only (AsyncLocalStorage). Never imported by the Edge middleware.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export type OrgScope =
  | { readonly kind: 'org'; readonly organizationId: string }
  | { readonly kind: 'admin'; readonly reason: string };

// The scope cell MUST be a process-wide singleton. Next's dev module graph
// (and, historically, HMR) can evaluate this module in more than one
// context; if `runUnscoped()` writes to one `AsyncLocalStorage` instance and
// the Prisma extension's `currentOrgScope()` reads another, a legitimately
// cross-tenant pre-session query (e.g. the NextAuth signIn callback's
// `isSsoEnforcedForEmail`) sees no scope and throws `OrgScopeError`. Pinning
// it on `globalThis` — the same trick `src/lib/db.ts` uses for the client —
// makes `.run()` and `.getStore()` always hit the same instance.
const globalForScope = globalThis as unknown as {
  __a2rOrgScopeStorage?: AsyncLocalStorage<OrgScope>;
};
const storage: AsyncLocalStorage<OrgScope> =
  globalForScope.__a2rOrgScopeStorage ??
  (globalForScope.__a2rOrgScopeStorage = new AsyncLocalStorage<OrgScope>());

const IS_TEST = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

export class OrgScopeError extends Error {
  constructor(model: string, operation: string) {
    super(
      `Prisma ${operation} on "${model}" ran with no tenant scope. Wrap the ` +
        `request in requireOrgContext() / requireOpsContext(), or — for a ` +
        `deliberately cross-tenant path — runUnscoped('<reason>', …).`,
    );
    this.name = 'OrgScopeError';
  }
}

/**
 * Bind the current async context (and everything downstream in this
 * request) to one tenant. Called by requireOrgContext / getOrgContextOrNull
 * once the active org is resolved, and by withApiAuth from the tenant the
 * API key is scoped to. Uses enterWith — the request IS the context
 * boundary, so there is no callback to wrap.
 */
export function setOrgScope(organizationId: string): void {
  storage.enterWith({ kind: 'org', organizationId });
}

/** Mark the current context as legitimately cross-tenant (the A2R Ops
 * Console, resolved by requireOpsContext / getOpsContextOrNull). */
export function setAdminScope(reason: string): void {
  storage.enterWith({ kind: 'admin', reason });
}

/**
 * Run `fn` with an explicit cross-tenant marker, reverting after. For the
 * short, enumerable list of paths that touch tenant models with no
 * session: the NextAuth callbacks, SSO JIT provisioning, the retention
 * sweep, tenant provisioning, and org-context bootstrap itself.
 */
export function runUnscoped<T>(reason: string, fn: () => T): T {
  return storage.run({ kind: 'admin', reason }, fn);
}

/**
 * Run `fn` pinned to one tenant, reverting after. For code that processes a
 * specific tenant outside a request — a background job iterating tenants, a
 * maintenance script, a test. Request handlers use setOrgScope() instead
 * (no callback — the request is the boundary).
 */
export function runWithOrgScope<T>(organizationId: string, fn: () => T): T {
  return storage.run({ kind: 'org', organizationId }, fn);
}

export function currentOrgScope(): OrgScope | undefined {
  return storage.getStore();
}

// ── Lazy request-scope resolution ───────────────────────────────────────
// `enterWith` set from inside an async guard (requireOrgContext resolves the
// session over several awaits, THEN calls setOrgScope) does NOT propagate
// back to the caller's frame — Node reverts to the caller's context when the
// guard's promise resolves. So the explicit setOrgScope / setAdminScope /
// runUnscoped calls are a fast path, and this is the backstop: when a
// tenant-model query runs with no scope set but inside a live request, the
// extension asks this resolver (registered by src/lib/session.ts) to work
// out the active tenant from the session + a2r_active_org cookie. React
// cache() in the resolver keeps it to one real resolution per request.

export type LazyScopeResolver = () => Promise<OrgScope | undefined>;

let lazyScopeResolver: LazyScopeResolver | null = null;

/** Called once by src/lib/session.ts at module load. */
export function registerLazyScopeResolver(fn: LazyScopeResolver): void {
  lazyScopeResolver = fn;
}

/**
 * Best-effort scope resolution for a query that reached the extension with
 * nothing in the AsyncLocalStorage cell. Returns undefined outside a request
 * (scripts, jobs, tests — those must scope explicitly) or when the request
 * has no authenticated tenant.
 */
export async function resolveScopeLazily(): Promise<OrgScope | undefined> {
  if (!lazyScopeResolver) {
    // The resolver lives in session.ts; force it to load if some entry point
    // reached a tenant query without importing it first.
    try {
      await import('@/lib/session');
    } catch {
      /* not resolvable */
    }
  }
  if (!lazyScopeResolver) return undefined;
  try {
    return await lazyScopeResolver();
  } catch {
    return undefined;
  }
}

// ── Model classification ────────────────────────────────────────────────
// PascalCase model names, as the Prisma client extension sees them.

/** Identity / tenant-plumbing models — never auto-scoped. A user spans
 * organizations; Membership and Organization are how "which tenant" is
 * resolved in the first place. Their protection is the app's JWT-based
 * membership checks (and, later, DB RLS). */
export const UNSCOPED_MODELS: ReadonlySet<string> = new Set([
  'User',
  'Account',
  'Session',
  'VerificationToken',
  'Membership',
  'Organization',
  // Platform-operator entitlement + JIT elevation — not tenant data.
  'StaffGrant',
  'StaffElevation',
]);

/** Models with an `organizationId` column of their own.
 *
 * P1 (migration 00000000000012) added the column + FK to the 8
 * formerly project-scoped models and to `DataImportRow`, so they now scope
 * with a direct scalar filter and get `organizationId` auto-injected on
 * create (applyOrgToCreateData). The transitive sets below are kept for
 * back-compat but are now empty. */
export const DIRECT_ORG_MODELS: ReadonlySet<string> = new Set([
  'ActivityLogEntry',
  'ApiKey',
  'AuditEntry',
  'AuditLog',
  'ControlLabel',
  'CustomKpi',
  'DataImportBatch',
  'DataImportRow',
  'DeliveryRole',
  'EffortCell',
  'FinancialActual',
  'GovernanceConfig',
  'IdentityProvider',
  'ImmutableAuditLedger',
  'ImpersonationGrant',
  'OrganizationHoliday',
  'OrgPolicy',
  'Practice',
  'Project',
  'ProjectContributor',
  'RaidEntry',
  'Resource',
  'RoleUtilizationPolicy',
  'SchedulePhase',
  'ScopeItem',
  'SsoGroupMapping',
  'SteerCoDecision',
  'TimesheetEntry',
  'WeeklyAssignmentSlot',
]);

/** Models scoped transitively through a `project` relation. Emptied by P1
 * — every entry now carries its own `organizationId` (DIRECT_ORG_MODELS).
 * Retained (exported, empty) so importers and `orgWhereFragment` keep
 * compiling; a model re-added here would scope via `project: { organizationId }`. */
export const PROJECT_SCOPED_MODELS: ReadonlySet<string> = new Set<string>([]);

/** Models scoped transitively through a `batch` relation. Emptied by P1
 * (`DataImportRow` now carries its own `organizationId`). */
export const BATCH_SCOPED_MODELS: ReadonlySet<string> = new Set<string>([]);

export function isTenantModel(model: string): boolean {
  return (
    DIRECT_ORG_MODELS.has(model) ||
    PROJECT_SCOPED_MODELS.has(model) ||
    BATCH_SCOPED_MODELS.has(model)
  );
}

/** The `where`-fragment that pins a model to one organization. */
export function orgWhereFragment(model: string, organizationId: string): Record<string, unknown> {
  if (PROJECT_SCOPED_MODELS.has(model)) return { project: { organizationId } };
  if (BATCH_SCOPED_MODELS.has(model)) return { batch: { organizationId } };
  return { organizationId };
}

/**
 * `findUnique`/`findUniqueOrThrow` accept a compound-key selector
 * (`{ projectId_roleKey: { projectId, roleKey } }`) that `findFirst` does
 * not. Since the org-scope wrapper reroutes unique reads through `findFirst`
 * (to AND the tenant filter in), flatten any such compound entry into its
 * scalar components first. Only the top level is touched, and only entries
 * whose value is an object of primitives — a shape a `findUnique` where can
 * only produce for a compound key.
 */
export function flattenUniqueWhere(where: unknown): Record<string, unknown> {
  if (!where || typeof where !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(where as Record<string, unknown>)) {
    const isCompound =
      key.includes('_') &&
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !(value instanceof Date) &&
      Object.values(value as Record<string, unknown>).every(
        (v) => v === null || v instanceof Date || ['string', 'number', 'boolean'].includes(typeof v),
      );
    if (isCompound) {
      Object.assign(out, value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * AND the org fragment into an existing `where` (or create one). For the
 * filter operations (findMany / findFirst / count / aggregate / groupBy /
 * updateMany / deleteMany) — `AND` is always accepted there. Pure.
 */
export function mergeOrgWhere(
  model: string,
  where: unknown,
  organizationId: string,
): Record<string, unknown> {
  const fragment = orgWhereFragment(model, organizationId);
  if (where && typeof where === 'object' && Object.keys(where).length > 0) {
    return { AND: [where as Record<string, unknown>, fragment] };
  }
  return fragment;
}

/**
 * Scope the `where` of a unique-target op (`update` / `delete` / `upsert`).
 * Prisma's "extended where unique" requires the unique selector to stay at
 * the TOP level of `where` (it can't be buried inside an `AND`), so the org
 * constraint is added beside it — as a scalar for own-column models, or via
 * `AND` for relation-scoped ones (so an existing relation filter isn't
 * clobbered). A cross-tenant target then simply doesn't match → P2025. Pure.
 */
export function mergeOrgWhereUnique(
  model: string,
  where: unknown,
  organizationId: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = where && typeof where === 'object' ? { ...where } : {};
  const fragment = orgWhereFragment(model, organizationId);
  if ('organizationId' in fragment) {
    out.organizationId = fragment.organizationId;
    return out;
  }
  const existingAnd = Array.isArray(out.AND) ? out.AND : out.AND ? [out.AND] : [];
  out.AND = [...existingAnd, fragment];
  return out;
}

/**
 * For a `create` on a DIRECT_ORG model: ensure `data.organizationId` is
 * this org. Throws on a cross-tenant mismatch; injects it when absent.
 * Pure. As of P1 every tenant model is DIRECT_ORG (the transitive sets are
 * empty), so this covers all creates. Nested relation-form creates
 * (`project: { connect }`) still pass through untouched — Prisma rejects a
 * scalar FK alongside its relation, and the action code owns that path.
 */
export function applyOrgToCreateData(
  model: string,
  data: unknown,
  organizationId: string,
  { inject = true }: { inject?: boolean } = {},
): unknown {
  if (!DIRECT_ORG_MODELS.has(model)) return data;
  const rows = Array.isArray(data) ? data : [data];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    if (typeof r.organizationId === 'string' && r.organizationId !== organizationId) {
      // A create/update that tries to home the row to another tenant.
      throw new OrgScopeError(model, 'create');
    }
    // Relation form (`organization: { connect: { id } }`) — leave it alone;
    // Prisma rejects having both the scalar FK and the relation. The
    // existing action code owns that path.
    if (inject && r.organizationId === undefined && r.organization === undefined) {
      r.organizationId = organizationId;
    }
  }
  return data;
}

export const __testing = { IS_TEST };
