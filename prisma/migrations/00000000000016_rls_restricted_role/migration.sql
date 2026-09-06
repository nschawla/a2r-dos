-- A2R Delivery OS — P0-2 (Phase C): restricted runtime database role.
--
-- ══ Applied to STAGING (v1.9.0). NOT applied to production. ═════════════
-- Production cutover is the tail of docs/RLS_ENFORCEMENT_RUNBOOK.md.
-- After CREATE ROLE, set the password out-of-band (never commit it):
--   ALTER ROLE "a2r_app" WITH PASSWORD '<generated>';
-- ═════════════════════════════════════════════════════════════════════════
--
-- WHY
-- ──────────────────────────────────────────────────────────────────────
-- Prisma connects as Supabase's `postgres` role, which has BYPASSRLS and
-- owns every table — so the RLS policies in migration 17 are inert for the
-- app's own connection. This migration creates a dedicated login role with
-- NO superuser and NO bypass. The app does NOT reconnect as it — instead
-- every tenant transaction runs `SET LOCAL ROLE "a2r_app"` (see
-- src/lib/db/rls-transaction.ts), which needs `postgres` to be a member of
-- `a2r_app` (the final GRANT below). This "SET ROLE in a tx" approach works
-- through the standard connection pooler with no second pool and no
-- Supavisor custom-role support.
--
-- AFTER APPLYING (manual, Phase C)
-- ──────────────────────────────────────────────────────────────────────
--  1. `ALTER ROLE "a2r_app" WITH PASSWORD '<generated>';` (kept only so the
--     role can also be connected to directly by scripts/rls-smoke.ts if
--     ever wanted; the runtime never logs in as it).
--  2. Deploy with `RLS_ENFORCE=1` (src/lib/db/rls-transaction.ts).
--     `DATABASE_URL` stays the `postgres` pooler string.
--
-- To roll back: `RLS_ENFORCE` unset, then
--   `REVOKE "a2r_app" FROM "postgres"; DROP OWNED BY "a2r_app"; DROP ROLE "a2r_app";`
-- ──────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'a2r_app') THEN
    -- NOBYPASSRLS is the default; NOSUPERUSER/NOCREATEDB/NOCREATEROLE keep
    -- it least-privilege. (Explicit NOREPLICATION / forcing BYPASSRLS needs
    -- superuser on managed Postgres, so they are omitted.)
    CREATE ROLE "a2r_app" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO "a2r_app";

-- Table DML — the policies in migration 17 do the tenant filtering on top.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "a2r_app";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "a2r_app";

-- …and on anything a later `prisma db execute` / `db push` creates while
-- connected as `postgres` (the object owner).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "a2r_app";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO "a2r_app";

-- The GUC the policies read is `app.current_org`. No database-level default
-- is set (managed Postgres blocks `ALTER DATABASE … SET` for a custom
-- parameter): the policies use `current_setting('app.current_org', true)`,
-- which returns NULL when unset, so `"organizationId" = NULL` → no rows
-- (fail-closed) without any server configuration.

-- The runtime does `SET LOCAL ROLE "a2r_app"` as `postgres`, which requires
-- membership. (WITH ADMIN OPTION is rejected — postgres created the role and
-- is already its implicit administrator.)
GRANT "a2r_app" TO "postgres";
