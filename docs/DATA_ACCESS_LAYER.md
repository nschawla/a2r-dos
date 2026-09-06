# The Data Access Layer (DAL)

_Status: shipped in v1.7.0 (P1). Builds on P0 #1 (ORM tenant auto-scoping) and the
composite-tenant-key migration `00000000000012`._
_Audience: engineering + security audit._

## 1. Purpose

Every database read and write in the product is funnelled through a small,
named, server-only layer that (a) has a server-verified tenant context and
(b) can only ever see or touch one tenant's rows. A page, route handler, or
UI component **cannot** reach the Prisma client directly.

## 2. The layers

| # | Layer | What it guarantees | Where |
| - | ----- | ------------------ | ----- |
| 1 | **Verified context** | Every reachable path resolves the active tenant through `requireOrgContext()` / `getOrgContextOrNull()` / `requireOpsContext()` / `withApiAuth()` before any DB call, and passes `organizationId` into each `where`. `assertTenantContext()` is the fail-closed gate each query function calls first — a missing / blank / non-string `organizationId` throws `TenantContextError`, never falls through. | `src/lib/session.ts`, `src/lib/ops-auth.ts`, `src/lib/api-auth.ts`, `src/lib/dal/index.ts` |
| 2 | **ORM auto-scoping** | A Prisma client extension rewrites **every** query on a tenant-owned model to include the request's `organizationId` (injected into `where`, and into `data` on `create`), and **throws `OrgScopeError`** if a tenant query runs with no resolved scope. Fed by an `AsyncLocalStorage` cell + a lazy session/cookie resolver. | `src/lib/db/org-scope.ts`, `src/lib/db.ts` |
| 3 | **Composite tenant keys** | All 29 tenant-owned models carry their own `organization_id` column + FK to `organizations(id)` `ON DELETE CASCADE` + index. No model is scoped only through a join. This is the same-table target a future DB-level RLS policy needs. | `prisma/schema.prisma`, migration `00000000000012` |
| 3b | **Composite parent FKs** | v1.8.0 (migration `00000000000014`) — every project-/batch-scoped child carries a composite FK `("organizationId", <parentId>)` → `parent("organizationId", "id")`, so Postgres rejects a child whose tenant ≠ its parent's. | `prisma/schema.prisma`, migration 14 |
| 4 | **DB-level RLS** | **Enforced on staging (v1.9.0)** via `SET LOCAL ROLE a2r_app` + `SET LOCAL app.current_org` in `withTenantTx`; `a2r_app` is NOBYPASSRLS. Production unset pending cutover. | `src/lib/db/with-tenant-tx.ts`, `docs/RLS_ROADMAP.md`, `docs/RLS_ENFORCEMENT_RUNBOOK.md` |

## 3. The module boundary

```
src/lib/dal/index.ts        ← the named entry point: tenantDb, assertTenantContext,
                              requireResolvedScope, TenantContextError
src/server/queries/**        ← all reads. One function per surface; each takes a
                              verified context / organizationId and calls
                              assertTenantContext first.
src/server/actions/**        ← all writes (Server Actions). Already gated by
                              src/server/authz.ts.
src/lib/**  (services)       ← may use @/lib/db directly (identity, governance,
                              audit-ledger, capacity — they are part of the data tier)
```

**`src/app/**` and `src/components/**` may not import `@/lib/db`** (or
`@/lib/db/*`, or `PrismaClient`). Enforced two ways:

- **ESLint** — a `no-restricted-imports` rule in `.eslintrc.json`, scoped via
  `overrides` to those two trees, banning `@/lib/db` and `@/lib/db/org-scope`.
  `import type` from `@prisma/client` stays legal.
- **vitest** — `tests/dal-boundary.test.ts` walks the trees and fails on any
  non-type `@/lib/db` import, so `vitest run` catches it too.

**Allowlist** (documented exceptions, still in the ESLint config):

- `src/app/api/health/ready/route.ts` — a raw `SELECT 1` liveness ping, no
  tenant data.
- `src/app/api/v1/**` — the Bearer-token ingestion API. It has its own
  verified tenant context via `withApiAuth` and passes `organizationId` on
  every query; its multi-statement `$transaction` writes live in the route.

## 4. Fail-closed behaviour

| Situation | Result |
| --------- | ------ |
| Query function called with no / blank `organizationId` | `assertTenantContext` throws `TenantContextError` |
| A tenant-model query reaches the extension with no resolved scope | `OrgScopeError` thrown (dev/prod); warn + passthrough only under `NODE_ENV=test` so the security suites can seed |
| `create` / `update` that names another tenant's `organizationId` | `OrgScopeError` (create) / `P2025` no-rows (update) |
| Cross-tenant `findFirst` / `findUnique` by id | `null` |
| Cross-tenant `updateMany` / `deleteMany` | `count: 0` |

## 5. Adding a new query

1. Add a function to the right `src/server/queries/**` module.
2. First line: `assertTenantContext(context)` (or `requireResolvedScope()` if
   it takes no context object).
3. Read through `tenantDb` (from `@/lib/dal`), always with an explicit
   `where: { organizationId }` on the top-level model — the extension is the
   backstop, not the primary filter.
4. The page / route imports **that function**, never `@/lib/db`.

## 6. Verification

- `tests/dal.test.ts` — `assertTenantContext` / `requireResolvedScope` /
  `tenantDb` identity.
- `tests/dal-boundary.test.ts` — the import-boundary guard.
- `tests/security/tenant-isolation.test.ts` — live-DB cross-tenant sweep,
  now parameterised over the 9 newly-keyed child models as well.
- `tests/org-scope.test.ts` — the extension's helpers + live enforcement.
- `e2e/dal-tenant-isolation.spec.ts` (Suite O) — a signed-in tenant-A user
  is blocked from tenant-B data at the API and page layers.

See also `docs/SESSION_STATE_MACHINE.md`, `docs/RLS_ROADMAP.md`.
