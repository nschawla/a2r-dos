# RLS Enforcement Runbook (Phase C)

_Companion to `docs/RLS_ROADMAP.md`. This is the ordered, reversible
procedure for turning DB-level Row-Level Security **on**. Everything it
needs was authored in v1.8.0 (Phase B) and is currently dormant._

> **Precondition that does not exist yet:** a **rehearsal database** — a
> throwaway Postgres with a representative data shape (seed + a scrubbed
> prod snapshot). The app currently shares one Supabase project through
> the transaction pooler with no staging tier. Steps 2–7 MUST be walked
> end-to-end on the rehearsal DB, including the load test in step 5, before
> any of it touches production.

## 0. Inventory

- 29 tenant tables, each with its own `organizationId` (migrations 12 + 14).
- `src/lib/db/rls-transaction.ts` — wraps every tenant-model op in a tx that
  runs `set_config('app.current_org', <org>, true)`. Gated on `RLS_ENFORCE=1`.
- `src/lib/db/org-scope.ts` — the existing app-tier scope cell this bridge
  reuses; `admin` scope → empty GUC.

## 1. Audit the multi-statement flows

`grep -rn '\$transaction' src/` — ~18 interactive callbacks. The RLS bridge
**cannot** open a nested tx, so each of these must set the GUC itself. Add a
`withTenantTx(orgId, fn)` helper (opens the tx, sets the GUC, runs `fn`) and
convert every `db.$transaction(fn)` in a tenant-scoped path to it. The
cross-tenant ops paths (`requireOpsContext`) stay on `postgres` / a bypass
role. Land this as its own PR and soak it with `RLS_ENFORCE` still unset
(no behaviour change — the helper just sets a GUC nobody reads yet).

## 2. Rehearsal DB — role + GUC

```
npx prisma db execute --url "$REHEARSAL_DIRECT_URL" \
  --file prisma/migrations/00000000000016_rls_restricted_role/migration.sql
ALTER ROLE "a2r_app" WITH PASSWORD '<generated>';
```

Point `RLS_APP_DATABASE_URL` at the `a2r_app` string. `npm run db:rls:smoke`
should now report **"missing policy"** for every table (role exists, no
policies yet) — that is the expected pre-policy state.

## 3. Policies — step by step

Apply migration 17 one `-- STEP n` block at a time (edit the file or split
it). After each block:

```
RLS_APP_DATABASE_URL=… npm run db:rls:smoke     # the covered tables flip to OK
RLS_APP_DATABASE_URL=… npx vitest run tests/security/rls-policies.test.ts
```

Order: STEP 1 (config tables) → soak → STEP 2 (project hierarchy) → soak →
STEP 3 (ingestion + audit). Watch the ledger append path especially
(`src/lib/audit-ledger.ts` reads the previous row — same tenant, so the
policy allows it, but verify).

## 4. Turn the bridge on (preview only)

Set `RLS_ENFORCE=1` **and** `DATABASE_URL` → the `a2r_app` pooler string on
a **preview** deployment. Run the full E2E suite (`npx playwright test`).
Every tenant query is now a transaction; every cross-tenant ops action must
still work via the `postgres` `DIRECT_URL` path.

## 5. Load test

Measure p95 on `/portfolio` and `/reports` before/after — every read is now
a round-trip-heavier transaction. Budget: < 15% p95 regression. If worse,
revisit batching in the hot query functions before going further.

## 6. Production

1. Apply migrations 16 + 17 (all steps) via `DIRECT_URL`.
2. Set `a2r_app` password; create the Supavisor credential.
3. Flip `DATABASE_URL` → `a2r_app` and `RLS_ENFORCE=1` in one deploy.
4. Soak 48h. `npm run db:rls:smoke` from a cron.
5. Uncomment + apply the `FORCE ROW LEVEL SECURITY` block in migration 17.
   Now even a stray `postgres` connection is policy-bound. Keep one
   BYPASSRLS maintenance role for break-glass, documented separately.

## 7. Rollback (any point)

```sql
-- per table, or all:
ALTER TABLE public.<t> NO FORCE ROW LEVEL SECURITY;
DROP POLICY tenant_isolation ON public.<t>;
```

Then `RLS_ENFORCE` unset + `DATABASE_URL` back to `postgres`. RLS stays
*enabled* (migration 07) so the anon/PostgREST lockdown is intact; the app
is back to app-tier-only isolation, exactly as v1.8.0 shipped.
