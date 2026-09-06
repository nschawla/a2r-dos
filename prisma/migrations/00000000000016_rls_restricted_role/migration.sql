-- A2R Delivery OS — P0-2 (Phase C): restricted runtime database role.
--
-- ══ NOT APPLIED. DORMANT GROUNDWORK. ═══════════════════════════════════
-- Do NOT run this against the shared production database without the
-- rehearsal + rollout in docs/RLS_ENFORCEMENT_RUNBOOK.md.
-- ═════════════════════════════════════════════════════════════════════════
--
-- WHY
-- ──────────────────────────────────────────────────────────────────────
-- Prisma currently connects as Supabase's `postgres` role, which has
-- BYPASSRLS and owns every table — so the RLS policies in migration 17 are
-- inert for the app's own connection. This migration creates a dedicated
-- login role with NO superuser and NO bypass, so that once `DATABASE_URL`
-- is repointed at it, the database itself enforces tenant isolation for
-- every query the app makes.
--
-- AFTER APPLYING (manual, Phase C)
-- ──────────────────────────────────────────────────────────────────────
--  1. In the Supabase dashboard → Database → Roles, set a password for
--     `a2r_app` (or `ALTER ROLE "a2r_app" WITH PASSWORD '…';` here).
--  2. Supavisor exposes custom roles at
--       postgresql://a2r_app.<ref>:<pwd>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require
--     Set that as `DATABASE_URL` on the target environment. Keep the
--     `postgres` string as `DIRECT_URL` for migrations + the ops/admin
--     scripts that legitimately need cross-tenant reach.
--  3. Deploy with `RLS_ENFORCE=1` (src/lib/db/rls-transaction.ts).
--
-- To roll back: `DROP OWNED BY "a2r_app"; DROP ROLE "a2r_app";` and restore
-- the `postgres` `DATABASE_URL`.
-- ──────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'a2r_app') THEN
    CREATE ROLE "a2r_app" LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;
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

-- The GUC the policies read. A database-level default of '' means a
-- connection that never calls `set_config('app.current_org', …)` sees
-- NO tenant rows (fail-closed) rather than erroring.
ALTER DATABASE postgres SET "app.current_org" = '';

-- `_prisma_migrations` is not used by this project (hand-derived SQL), but
-- if it is ever introduced, keep it off the restricted role:
-- REVOKE ALL ON TABLE "_prisma_migrations" FROM "a2r_app";
