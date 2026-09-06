# Database-level Row Level Security — implementation roadmap

_Status: **authored, dormant** as of v1.8.0 (Phase B). The code and SQL
below are committed but inert; enforcement is Phase C._
_Owner: platform / security. Audience: engineering + the security auditor._

## What shipped in v1.8.0 (Phase B)

| Artefact | Purpose | State |
| --- | --- | --- |
| `prisma/migrations/00000000000014_composite_fk_tenant_guard` | Composite `(organizationId, id)` FKs on all 11 project/batch child tables — the DB physically rejects a child row whose tenant ≠ its parent's. | **APPLIED** |
| `src/lib/db/rls-transaction.ts` | The per-request `SET LOCAL app.current_org` Prisma extension. No-op unless `RLS_ENFORCE=1`. | committed, dormant |
| `prisma/migrations/00000000000016_rls_restricted_role` | `CREATE ROLE a2r_app` (NOSUPERUSER NOBYPASSRLS) + grants + `app.current_org` GUC default. | **NOT applied** |
| `prisma/migrations/00000000000017_rls_tenant_policies` | `tenant_isolation` policy on all 29 tenant tables, staged in 4 steps + a commented `FORCE` block. | **NOT applied** |
| `scripts/rls-smoke.ts` (`npm run db:rls:smoke`) + `tests/security/rls-policies.test.ts` | Direct-SQL enforcement verification for the `a2r_app` role — bypasses the ORM. Skips cleanly when `RLS_APP_DATABASE_URL` is unset. | committed, skipped |
| `docs/RLS_ENFORCEMENT_RUNBOOK.md` | The ordered Phase-C rollout (rehearsal DB → role → policies step-by-step → `RLS_ENFORCE=1` → `FORCE`). | — |

Phase C is gated on a **rehearsal database** (there is none today — the app
shares one Supabase project through the transaction pooler) and a
maintenance window. Do not set `RLS_ENFORCE=1` against the shared database.

## 1. Where we are today (v1.7.0)

Tenant isolation is enforced at **three** layers, all in the application tier:

| Layer | Mechanism | File |
| --- | --- | --- |
| 1 — hand-written scoping | Every server component / action / route resolves the active tenant through `requireOrgContext()` / `requireOpsContext()` / `withApiAuth()` and passes `organizationId` into each Prisma `where`. Role narrowing on top via `getScopedProjectWhere` / `getScopedResourceWhere`. | `src/lib/session.ts`, `src/lib/db/scoping.ts` |
| 2 — ORM auto-scoping (v1.7.0) | A Prisma client extension (`$allModels.$allOperations`) rewrites **every** query on a tenant-owned model to include the request's `organizationId`, and **throws** if a tenant query runs with no scope resolved. Fed by an `AsyncLocalStorage` cell + a lazy session/cookie resolver. | `src/lib/db/org-scope.ts`, `src/lib/db.ts` |
| 3 — named DAL boundary (v1.7.0) | `src/app/**` / `src/components/**` may not import `@/lib/db` (ESLint + `tests/dal-boundary.test.ts`). Reads go through `src/server/queries/**`, writes through `src/server/actions/**`; the query fns fail closed on a missing tenant context. | `src/lib/dal/`, `docs/DATA_ACCESS_LAYER.md` |

Migration `00000000000012` (v1.7.0) added an own `organization_id` column + FK to the
9 formerly join-scoped tables, so **every** tenant table can now take a same-table RLS
policy — §2 below is updated to match, and the composite-key prep work this roadmap
called for is done.

The database **does not** enforce isolation for the application's own queries. Prisma
connects as the Supabase `postgres` role, which has `BYPASSRLS` and owns every table,
so RLS is inert for our connection. Migration `00000000000007_rls_lockdown` enabled
RLS + revoked grants on all tables, but that was aimed at the **out-of-band** threat
(the Supabase `anon` / `authenticated` PostgREST endpoint), not at our app tier.

**Goal of this roadmap:** make the database itself reject a cross-tenant row, so a
bug in either application layer cannot leak data — true defence in depth.

## 2. Model → tenant classification

35 models. The extension already encodes this split (`src/lib/db/org-scope.ts`); the
RLS policies must mirror it exactly.

> **P1 update (composite tenant keys).** Migration `00000000000012` added an
> own `organization_id` column + FK + index to the 8 formerly project-scoped
> models and to `data_import_rows`. They are now **direct-policy** tables
> (§2b), not join-policy — so §2c is empty and §2d is folded in. Every tenant
> table can take the simple same-table `USING (organization_id = …)` policy;
> no `EXISTS (SELECT 1 FROM projects …)` sub-queries are needed anywhere.

### 2a. Identity / tenant-plumbing — **no tenant policy** (6)
`User`, `Account`, `Session`, `VerificationToken`, `Membership`, `Organization`.
A user spans tenants; `Membership` / `Organization` are how "which tenant" is resolved.
These stay protected by the app's JWT membership checks. RLS here would be
membership-based (`Membership` visible where `user_id = auth_uid() OR
organization_id IN (my_orgs())`), added last and carefully.

### 2b. Own `organization_id` column — **direct policy** (29, was 20)
`ActivityLogEntry`, `ApiKey`, `AuditEntry`, `AuditLog`, `ControlLabel`,
`CustomKpi`, `DataImportBatch`, `DataImportRow`, `DeliveryRole`, `EffortCell`,
`FinancialActual`, `GovernanceConfig`, `IdentityProvider`,
`ImmutableAuditLedger`, `ImpersonationGrant`, `OrganizationHoliday`, `OrgPolicy`,
`Practice`, `Project`, `ProjectContributor`, `RaidEntry`, `Resource`,
`RoleUtilizationPolicy`, `SchedulePhase`, `ScopeItem`, `SsoGroupMapping`,
`SteerCoDecision`, `TimesheetEntry`, `WeeklyAssignmentSlot`.

```sql
CREATE POLICY tenant_isolation ON <table>
  USING (organization_id = current_setting('app.current_org', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org', true)::uuid);
```

### 2c. Scoped through `project` — **join policy** (0, removed by P1)
_Was: `AuditEntry`, `EffortCell`, `FinancialActual`, `ProjectContributor`,
`RaidEntry`, `SchedulePhase`, `ScopeItem`, `SteerCoDecision`._ Migration
`00000000000012` gave each its own `organization_id` column + FK + index, so
they moved to §2b and take the plain direct policy. The join-policy pattern
is kept here only as a reference for any future model added project-scoped
without its own column:

```sql
CREATE POLICY tenant_isolation ON <table>
  USING (EXISTS (SELECT 1 FROM projects p
                 WHERE p.id = <table>.project_id
                   AND p.organization_id = current_setting('app.current_org', true)::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM projects p
                 WHERE p.id = <table>.project_id
                   AND p.organization_id = current_setting('app.current_org', true)::uuid));
```

### 2d. Scoped through `batch` → `project`'s sibling — **join policy** (0, removed by P1)
_Was: `DataImportRow` → `DataImportBatch.organization_id`._ Also given its own
`organization_id` column by migration `00000000000012`; now §2b.

## 3. Connection & role strategy

The blocker: Prisma holds a **pooled** connection as `postgres`. RLS needs a
per-request identity. Options, in order of preference:

1. **`SET LOCAL app.current_org` inside a transaction** — Prisma `$transaction`.
   - Pro: no new DB role, works with PgBouncer transaction pooling.
   - Con: every read must be in a transaction; **interactive `$transaction(fn)`
     callbacks and our 14 multi-statement flows need wrapping**; a bare
     `db.project.findMany()` outside a tx has no `SET LOCAL` and would see zero rows
     (fail-closed — acceptable, but a big call-site sweep).
   - Requires a Prisma client extension that opens a tx + `SET LOCAL` for every
     operation, or the `prisma-extension-rls` community pattern.

2. **`SET ROLE` + `SET LOCAL "request.jwt.claims"`** to a non-bypass role
   (`authenticated`) per transaction, letting `auth.uid()` / Supabase helpers work.
   - Pro: closest to Supabase-native; policies can use `auth.jwt()`.
   - Con: `authenticated` currently has every grant revoked (migration 07) — must
     re-grant table DML to it behind the policies; still transaction-bound; the
     `postgres`→`authenticated` `SET ROLE` needs `GRANT authenticated TO postgres`.

3. **A dedicated `app_rls` login role** (`NOSUPERUSER NOBYPASSRLS`), Prisma connects
   as it, `SET app.current_org` per tx.
   - Pro: clean separation, no reliance on Supabase's role grants.
   - Con: new role + full grant matrix + connection-string swap + Supabase may not
     allow creating login roles on all plans.

**Recommendation:** option 1 (SET LOCAL in a tx), implemented as a Prisma extension
that wraps every tenant-model operation, reusing the `AsyncLocalStorage` scope cell
this release already introduced (`currentOrgScope()`). The `admin` scope maps to a
`SET LOCAL app.current_org = ''` + a `bypass` policy branch, or simply runs as
`postgres` on a second client.

## 4. Call-site work

The v1.7.0 ORM extension already inventoried and tagged every entry point:

- **~40** `requireOrgContext()` callers → already funnel through one resolver.
- **~13** `requireOpsContext()` callers → cross-tenant; need the `bypass`/`postgres`
  path.
- Pre-session / cross-tenant paths already wrapped in `runUnscoped(...)`:
  NextAuth `authorize` + `jwt` + `signIn`, SSO JIT (`identity-jit.ts`), retention
  sweep (`data-retention.ts`), tenant provisioning (`actions/auth.ts`),
  `resolveOrgContext` bootstrap, API-key validation (`api-auth.ts`).
- **3** raw-SQL spots (`health/ready`, `platform-pulse`, `audit-ledger` advisory
  lock) — none carry tenant data; leave as `postgres`.
- **14** files using `$transaction` — audit each: interactive callbacks compose
  with SET LOCAL, but any `$transaction([...])` array form needs conversion.

Because layer 2 (the extension) already throws on an unscoped tenant query, the
call-site classification is **done and test-enforced** — the RLS project inherits it
rather than re-deriving it.

## 5. Migration sequence (staged, reversible)

1. **Prep** — add missing composite indexes for the join policies; add a
   `app_rls` GUC (`ALTER DATABASE ... SET app.current_org = ''`).
2. **Shadow mode** — deploy the SET-LOCAL extension writing the GUC on every
   request, but **do not** add policies yet. Verify via logs that every tenant
   query carries a non-empty `app.current_org`. (The v1.7.0 extension's throw
   already guarantees this; this step is belt-and-braces telemetry.)
3. **Policies on read-mostly tables first** — `ControlLabel`, `DeliveryRole`,
   `Practice`, `GovernanceConfig`, `OrgPolicy`. Low write volume, easy rollback.
4. **Policies on the core hierarchy** — `Project`, then the 8 project-scoped
   tables + `DataImportRow`, then `Resource` / capacity tables.
5. **Policies on audit/security tables** — `ImmutableAuditLedger` (careful: the
   hash-chain append reads the previous row — policy must not hide it),
   `AuditLog`, `ActivityLogEntry`, `ApiKey`, `IdentityProvider`,
   `ImpersonationGrant`.
6. **`FORCE ROW LEVEL SECURITY`** on all of the above so even the table owner is
   subject to policy (the final lockdown).
7. **Plumbing tables** (`Membership`, `Organization`) last, with membership-based
   policies.

Each step is one `prisma db execute` file (hand-derived, matching the existing
`prisma/migrations/*` convention) and is independently revertible with
`ALTER TABLE <t> DISABLE ROW LEVEL SECURITY` / `DROP POLICY`.

## 6. Test plan

- Extend `tests/security/tenant-isolation.test.ts` and `tests/org-scope.test.ts`
  to run with the SET-LOCAL extension active and assert:
  - a query with `app.current_org = <A>` returns zero of tenant B's rows for all
    29 tenant tables (parameterised);
  - a `WITH CHECK` violation (insert/update row into another tenant) raises
    `42501` / Prisma `P2010`;
  - `admin` scope (ops console) sees all tenants;
  - the audit-ledger append still chains under a policy.
- A `psql` smoke script run in CI against a seeded DB: `SET ROLE`/`SET app.current_org`
  then `SELECT count(*)` per table, expecting only the scoped tenant's count.
- Load test the transaction-wrapping overhead (every read becomes a tx) — measure
  p95 on `/portfolio` and `/reports` before/after.

## 7. Rollback

Because RLS is added table-by-table and only step 6 uses `FORCE`, at any point:

```sql
ALTER TABLE <table> NO FORCE ROW LEVEL SECURITY;   -- if forced
DROP POLICY tenant_isolation ON <table>;
-- RLS stays ENABLED (migration 07) so the anon/authenticated lockdown is intact;
-- the app is back to app-tier-only isolation, exactly as v1.7.0 shipped.
```

The SET-LOCAL Prisma extension is feature-flagged (`RLS_SET_LOCAL=1`); turning it
off reverts to the v1.7.0 behaviour with no redeploy of policies.

## 8. Estimate

| Phase | Effort |
| --- | --- |
| Prep + shadow-mode extension | ~3 days |
| Policy authoring + per-table migration files (30 tables) | ~4 days |
| Test suite + CI smoke script | ~3 days |
| Staged rollout + load validation + FORCE | ~1 week (elapsed, mostly soak time) |

~2–3 focused weeks. The v1.7.0 ORM auto-scoping layer is the prerequisite and is
now in place.
