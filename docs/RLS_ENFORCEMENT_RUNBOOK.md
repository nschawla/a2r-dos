# RLS Enforcement Runbook

_Companion to `docs/RLS_ROADMAP.md` and `docs/TENANT_MODEL_INVENTORY.md`.
Turning DB-level Row-Level Security on, and the break-glass to turn it off._

## Status

- **Staging** (`urdlkmlhjhvoxsphvwte`) — **ENFORCED** (v1.9.0). `RLS_ENFORCE=1`,
  migrations 16 + 17 + 20 applied, `npm run db:rls:smoke` green, full suite green.
- **Production** (`xoaabhqsbfetffyawayw`) — migrations 16 + 17 + 20 **APPLIED
  (inert)** as of v1.12.0; the app still connects/acts as `postgres`. The
  enforcement flip (`RLS_ENFORCE=1` on Vercel) is the remaining step —
  "Production cutover" below.

## Design (as shipped)

The app keeps its single `postgres` connection pool. When `RLS_ENFORCE=1`,
every tenant-scoped transaction runs two `SET LOCAL` statements first:

```sql
SELECT set_config('role', 'a2r_app', true);          -- NOBYPASSRLS from here
SELECT set_config('app.current_org', '<org-id>', true);
```

- `src/lib/db/with-tenant-tx.ts` — `withTenantTx(fn)` / `withTenantTxFor(org, fn)`.
  Every former `db.$transaction(fn)` that touches a tenant model was converted.
- `src/lib/db/rls-transaction.ts` — the extension that wraps a **bare**
  `db.model.op()` (no surrounding tx) in its own per-op transaction.
- Cross-tenant / pre-session flows (`admin` scope or none — ops console,
  provisioning, SSO JIT, retention sweep, `signOutEverywhereAction` /
  `changePasswordAction`) resolve to "no role switch" and run as `postgres`.
- Migration 17: `tenant_isolation` on the 28 tenant tables
  (`organizationId = current_setting('app.current_org', true)`, fail-closed
  on NULL).
- Migration 20: the 9 identity/routing tables carry **`rls_deny_app`**
  (`USING (false) WITH CHECK (false)`) for `a2r_app` — the tenant runtime
  cannot read or write `sessions` / `staff_grants` / `staff_elevations` /
  `impersonation_grants` / `users` / … at all. Plus the `_rls_control`
  break-glass table.

## Applying to a fresh database (what was done on staging)

```bash
# 1. schema + the anon/PostgREST lockdown + seed
DATABASE_URL=<pg> DIRECT_URL=<pg-5432> npx prisma db push --skip-generate
npx prisma db execute --url "<pg-5432>" --file prisma/migrations/00000000000007_rls_lockdown/migration.sql
npm run db:seed

# 2. restricted role + policies + lockdown (via the session pooler / :5432 —
#    the transaction pooler times out on multi-statement DDL)
npx prisma db execute --url "<pg-5432>" --file prisma/migrations/00000000000016_rls_restricted_role/migration.sql
npx prisma db execute --url "<pg-5432>" --file prisma/migrations/00000000000017_rls_tenant_policies/migration.sql
npx prisma db execute --url "<pg-5432>" --file prisma/migrations/00000000000020_rls_identity_lockdown_and_control/migration.sql

# 3. flip the app on
#    .env:  RLS_ENFORCE=1   (+ SESSION_LOOKUP_TIMEOUT_MS=8000 for a remote/high-latency DB)
npm run db:rls:smoke        # → "OK — all 28 tenant tables enforce isolation"
npx vitest run && npx playwright test && npm run build
```

## Production cutover

### 1. Apply the migrations (done in v1.12.0 — inert)

```bash
PROD_DIRECT="postgresql://postgres.xoaabhqsbfetffyawayw:<pw>@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require"

# rehearse — every statement, rolled back
psql "$PROD_DIRECT" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
\i prisma/migrations/00000000000016_rls_restricted_role/migration.sql
\i prisma/migrations/00000000000017_rls_tenant_policies/migration.sql
\i prisma/migrations/00000000000020_rls_identity_lockdown_and_control/migration.sql
ROLLBACK;
SQL

# apply for real
npx prisma db execute --url "$PROD_DIRECT" --file prisma/migrations/00000000000016_rls_restricted_role/migration.sql
npx prisma db execute --url "$PROD_DIRECT" --file prisma/migrations/00000000000017_rls_tenant_policies/migration.sql
npx prisma db execute --url "$PROD_DIRECT" --file prisma/migrations/00000000000020_rls_identity_lockdown_and_control/migration.sql
```

No `a2r_app` password on production — migration 20 STEP 3 makes it `NOLOGIN`.
Inert while the app is `postgres`; the only new capability is `SET ROLE a2r_app`.

### 2. Pre-cutover verification matrix (the go/no-go gate)

`DATABASE_URL="<prod-6543>" npm run db:rls:smoke` — must print
**`OK — all 28 tenant tables enforce isolation for a2r_app`**. It exercises,
as `a2r_app` with the GUC set, directly against production:

| # | Check | Expected |
| --- | --- | --- |
| 1 | Scoped `SELECT count(*)` on all 28 tenant tables | equals tenant-A ground truth |
| 2 | Empty-GUC connection | 0 rows everywhere (fail-closed) |
| 3 | Cross-tenant `INSERT` | rejected (`42501` / row-level security) |
| 4 | Cross-tenant `UPDATE` | 0 rows |
| 5 | Cross-tenant `DELETE` | 0 rows |
| 6 | `UPSERT` keyed on a B-owned row while scoped to A | B's row never mutated |
| 7 | Child row (`scope_items`) pointing at a B project, scoped to A | rejected |
| 8 | Ingestion-shape `INSERT` for A | lands for A, invisible to B |

Plus manually confirm: the retention sweep (`GET /api/internal/retention`)
still reports counts across **all** tenants (runs as `postgres`), and a
`/api/v1/ingest/timesheets` call with a real key writes to the right tenant.

### 3. Flip enforcement on (Vercel — operator action)

- Vercel → Project → Settings → Environment Variables → **Production**:
  `RLS_ENFORCE = 1`. Keep the `postgres` `DATABASE_URL`. Leave
  `SESSION_LOOKUP_TIMEOUT_MS` unset (same-region Vercel↔Supabase).
- Redeploy Production.
- Post-deploy: `npm run db:rls:smoke` on a cron (hourly); watch the error
  rate and p95 for 48 h; run a synthetic tenant login + a project read.

### 4. FORCE ROW LEVEL SECURITY (deferred)

Migration 17's commented block. Only after a full soak **and** provisioning
an owner-side break-glass BYPASSRLS role + owner-side policies — FORCE
subjects `postgres` (and thus the cross-tenant admin path) to RLS.

## Break-glass — disable enforcement fast

`_rls_control` (migration 20) holds a time-boxed window. While it is open,
`withTenantTx` runs as `postgres` and DB-level RLS is inert; **app-tier
tenant scoping (`src/lib/db/org-scope.ts`) still fully applies** — this is
the exact posture of `RLS_ENFORCE` unset, not "no isolation". Every affected
request emits an `error`-level observability event (throttled per process),
so the on-call is paged. The window **auto-expires** (≤ 60 min, time-based —
no cron, no redeploy); propagation is ≤ 10 s (the in-process cache TTL).

```bash
# incident shell (no app dependency — writes over DIRECT_URL)
npx tsx scripts/rls-break-glass.ts status
npx tsx scripts/rls-break-glass.ts engage --minutes 30 --reason "SEV1: cross-tenant 500s on /projects"
npx tsx scripts/rls-break-glass.ts disengage      # or just let it expire
```

Or from the Ops Console (needs a live JIT elevation):
`engageRlsBreakGlassAction` / `disengageRlsBreakGlassAction` /
`getRlsBreakGlassStatus`.

**Rehearsal** (run on staging before relying on it): `engage --minutes 5` →
confirm the app still serves tenant data and an `error` alert fired →
`npx vitest run` still green → `disengage` → `npm run db:rls:smoke` green.

## Rollback (any point)

`.env` / Vercel: unset `RLS_ENFORCE`. The app is back to app-tier-only
isolation (exactly v1.8.0) with zero policy redeploy. To also remove the DB
objects:

```sql
-- restore permissive plumbing, then drop the role + control table
-- (full script in migration 20's header comment)
REVOKE "a2r_app" FROM "postgres"; DROP OWNED BY "a2r_app"; DROP ROLE "a2r_app";
DROP TABLE IF EXISTS "_rls_control";
```

RLS stays *enabled* (migration 07) so the anon/PostgREST lockdown is intact.
