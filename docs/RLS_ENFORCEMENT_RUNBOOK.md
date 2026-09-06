# RLS Enforcement Runbook

_Companion to `docs/RLS_ROADMAP.md`. Turning DB-level Row-Level Security on._

## Status

- **Staging** (`urdlkmlhjhvoxsphvwte`) — **DONE** (v1.9.0). `RLS_ENFORCE=1`,
  migrations 16 + 17 applied, `npm run db:rls:smoke` green, full suite green.
- **Production** — not started. Steps below, "Production" section.

## Design (as shipped)

The app keeps its single `postgres` connection pool. When `RLS_ENFORCE=1`,
every tenant-scoped transaction runs two `SET LOCAL` statements first:

```sql
SELECT set_config('role', 'a2r_app', true);          -- NOBYPASSRLS from here
SELECT set_config('app.current_org', '<org-id>', true);
```

- `src/lib/db/with-tenant-tx.ts` — `withTenantTx(fn)` / `withTenantTxFor(org, fn)`.
  Every former `db.$transaction(fn)` that touches a tenant model was
  converted to `withTenantTx`.
- `src/lib/db/rls-transaction.ts` — the extension that wraps a **bare**
  `db.model.op()` (no surrounding tx) in its own per-op transaction, and
  skips that when already inside a `withTenantTx` (`isGucSet()`).
- Cross-tenant / pre-session flows (`admin` scope or none — ops console,
  tenant provisioning, SSO JIT, the retention sweep) resolve to "no role
  switch" and run as `postgres` (BYPASSRLS).
- Migration 17 policies: `tenant_isolation` on the 28 org-owned tables
  (`organizationId = current_setting('app.current_org', true)`, fail-closed
  on NULL), `rls_app_plumbing` (`USING (true)`) on `users` / `accounts` /
  `sessions` / `verification_tokens` / `memberships` / `organizations` /
  `staff_grants` / `staff_elevations` / `impersonation_grants` (a user spans
  tenants — these stay protected by the app's JWT + membership checks).

## Applying to a fresh database (what was done on staging)

```bash
# 1. schema + the anon/PostgREST lockdown + seed
DATABASE_URL=<pg> DIRECT_URL=<pg-5432> npx prisma db push --skip-generate
npx prisma db execute --url "<pg-5432>" --file prisma/migrations/00000000000007_rls_lockdown/migration.sql
npm run db:seed

# 2. restricted role + policies (via the session pooler / DIRECT_URL —
#    the transaction pooler times out on multi-statement DDL)
npx prisma db execute --url "<pg-5432>" --file prisma/migrations/00000000000016_rls_restricted_role/migration.sql
npx prisma db execute --url "<pg-5432>" --stdin <<< "ALTER ROLE \"a2r_app\" WITH PASSWORD '<generated>';"
npx prisma db execute --url "<pg-5432>" --file prisma/migrations/00000000000017_rls_tenant_policies/migration.sql

# 3. flip the app on
#    .env:  RLS_ENFORCE=1   (+ SESSION_LOOKUP_TIMEOUT_MS=8000 for a remote/high-latency DB)
npm run db:rls:smoke        # → "OK — all 28 tenant tables enforce isolation for a2r_app"
npx vitest run && npx playwright test && npm run build
```

## Production

1. Apply 16 + 17 via prod `DIRECT_URL`. Inert while the app acts as
   `postgres`; the only new grant is `a2r_app` membership for `postgres`.
2. Deploy `RLS_ENFORCE=1`. Keep the `postgres` `DATABASE_URL`. Same-region
   latency → default `SESSION_LOOKUP_TIMEOUT_MS` is fine.
3. Soak 48h; `npm run db:rls:smoke` on a cron.
4. `FORCE ROW LEVEL SECURITY` (migration 17's commented block) — only after
   provisioning a break-glass BYPASSRLS role and owner-side policies, since
   FORCE subjects `postgres` (and thus the cross-tenant admin path) to RLS.

## Rollback (any point)

`.env`: unset `RLS_ENFORCE`. The app is back to app-tier-only isolation
(exactly v1.8.0) with zero redeploy of policies. To also remove the DB
objects: `DROP POLICY … ; REVOKE "a2r_app" FROM "postgres"; DROP ROLE "a2r_app";`
RLS stays *enabled* (migration 07) so the anon/PostgREST lockdown is intact.
