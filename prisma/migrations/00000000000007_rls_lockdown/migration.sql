-- A2R Delivery OS — SEC: Row Level Security lockdown of every `public` table.
--
-- WHY THIS EXISTS
-- ──────────────────────────────────────────────────────────────────────
-- The database is Supabase-hosted, but this app reaches it ONLY through
-- Prisma, connected as the `postgres` role — which has BYPASSRLS and owns
-- every table. The app does NOT use Supabase's PostgREST / GraphQL API,
-- Supabase Auth, or @supabase/supabase-js (there is no `@supabase/*`
-- dependency anywhere).
--
-- Supabase nonetheless grants the web-exposed `anon` and `authenticated`
-- roles full DML on every `public` table by default, and with RLS
-- disabled those roles can read and write everything through
--   https://<ref>.supabase.co/rest/v1/<table>
-- using the publishable anon key. That exposes users.passwordHash,
-- sessions.sessionToken, accounts (OAuth tokens), api_keys,
-- identity_providers (AES-GCM-encrypted SSO secrets), the immutable audit
-- ledger — the lot. This migration closes it.
--
-- WHAT IT DOES (defence in depth)
-- ──────────────────────────────────────────────────────────────────────
--  1. ENABLE — not FORCE — Row Level Security on every `public` table,
--     with NO policies. RLS enabled + no policy = deny-all for any role
--     that is not the table owner and lacks BYPASSRLS. `postgres` is both,
--     so Prisma is entirely unaffected — verified: SELECT and UPDATE as
--     `postgres` return / modify all rows with RLS enabled. Not FORCEd, so
--     the owner keeps its bypass.
--  2. REVOKE every privilege on the existing tables / sequences /
--     functions from `anon` and `authenticated`. Belt and braces: even if
--     a policy were added by mistake later, there is no grant behind it.
--  3. ALTER DEFAULT PRIVILEGES so the next `prisma db push` does not
--     re-grant those roles on newly-created objects.
--
-- `service_role` (BYPASSRLS, secret server-only key — never shipped to a
-- browser) is deliberately left intact for Supabase Studio / trusted
-- admin scripts.
--
-- Optional extra hardening, NOT done here because RLS + the revokes above
-- already deny everything and this step can trip on cross-role ownership:
--   REVOKE USAGE ON SCHEMA public FROM anon, authenticated;
--
-- Hand-derived (see 00000000000000_init) and applied with:
--   npx prisma db execute --file prisma/migrations/00000000000007_rls_lockdown/migration.sql --schema prisma/schema.prisma
-- Idempotent — safe to re-run. To undo: `ALTER TABLE <t> DISABLE ROW LEVEL
-- SECURITY` per table and re-GRANT.
-- ──────────────────────────────────────────────────────────────────────

-- 1. RLS on every current `public` table. `_prisma_migrations` (if it ever
--    appears) is excluded — Prisma manages it as `postgres`, which bypasses
--    RLS anyway, and it holds no tenant data.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname <> '_prisma_migrations'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
  END LOOP;
END $$;

-- 2. Strip the web-exposed roles' privileges on everything that exists now.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- 3. …and on anything the next `prisma db push` creates. The default ACLs
--    that hand out these grants are set FOR ROLE postgres (Prisma is the
--    creator), so this counters them.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
