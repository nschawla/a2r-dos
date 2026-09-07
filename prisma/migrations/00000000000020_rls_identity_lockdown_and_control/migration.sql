-- A2R Delivery OS — Phase 2 (v1.12.0): identity-table lockdown + break-glass control.
--
-- ══ Applied to STAGING and PRODUCTION. ════════════════════════════════════
-- Requires migrations 16 (the `a2r_app` role) and 17 (the tenant policies).
-- Run via the session pooler / DIRECT_URL (:5432) — the transaction pooler
-- (:6543) times out on the multi-statement DO blocks. Idempotent.
-- See docs/RLS_ENFORCEMENT_RUNBOOK.md.
-- ═════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS CHANGES
-- ──────────────────────────────────────────────────────────────────────
-- 1. `_rls_control` — a one-row control-plane table (NOT a Prisma model;
--    reached only by raw SQL over the `postgres` connection). It carries the
--    break-glass window: `src/lib/db/rls-break-glass.ts` polls it (10s cache)
--    and, while `breakGlassUntil` is in the future, `withTenantTx` skips the
--    `SET LOCAL ROLE a2r_app` switch and runs as `postgres` — tenant
--    isolation falls back to the application tier (exactly `RLS_ENFORCE`
--    unset) and every affected request emits an error-level alert. Expiry is
--    purely time-based: no cron, no redeploy.
--
-- 2. The 9 identity / routing tables move from the permissive
--    `rls_app_plumbing` policy (`USING (true)`, migration 17) to a hard
--    `rls_deny_app` (`USING (false) WITH CHECK (false)`) for `a2r_app`.
--    After the Phase 2 refactor of `signOutEverywhereAction` /
--    `changePasswordAction` (they now `runUnscoped`), the tenant runtime
--    NEVER touches these tables as `a2r_app` — every legitimate access
--    (NextAuth, the ops console, tenant provisioning, SSO JIT, session
--    bootstrap) runs as `postgres`. So `sessions`, `staff_grants`,
--    `staff_elevations`, `impersonation_grants` etc. become unreachable by
--    the base application runtime.
--
-- 3. `a2r_app` → `NOLOGIN`. `SET ROLE` does not need it; nothing connects
--    directly as the role. Converges staging (created WITH LOGIN in
--    migration 16) and production.
--
-- ROLLBACK
-- ──────────────────────────────────────────────────────────────────────
--   -- restore the permissive plumbing policy:
--   DO $$ DECLARE t text; BEGIN
--     FOREACH t IN ARRAY ARRAY['users','accounts','sessions','verification_tokens',
--       'memberships','organizations','staff_grants','staff_elevations','impersonation_grants']
--     LOOP
--       EXECUTE format('DROP POLICY IF EXISTS "rls_deny_app" ON public.%I', t);
--       EXECUTE format('CREATE POLICY "rls_app_plumbing" ON public.%I FOR ALL TO "a2r_app" USING (true) WITH CHECK (true)', t);
--     END LOOP;
--   END $$;
--   ALTER ROLE "a2r_app" WITH LOGIN;
--   DROP TABLE IF EXISTS "_rls_control";
-- ──────────────────────────────────────────────────────────────────────

-- ══ STEP 1 — break-glass control-plane table ═════════════════════════════
CREATE TABLE IF NOT EXISTS "_rls_control" (
  "id"              text PRIMARY KEY DEFAULT 'singleton',
  "breakGlassUntil" timestamptz,
  "reason"          text,
  "actorEmail"      text,
  "engagedAt"       timestamptz,
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "_rls_control_singleton" CHECK ("id" = 'singleton')
);
INSERT INTO "_rls_control" ("id") VALUES ('singleton') ON CONFLICT DO NOTHING;

-- RLS enabled, no policy for a2r_app ⇒ deny-all for the restricted role.
-- `postgres` (table owner, BYPASSRLS) reads/writes it freely — that is the
-- only connection the break-glass check ever uses.
ALTER TABLE "_rls_control" ENABLE ROW LEVEL SECURITY;

-- ══ STEP 2 — identity / routing tables: permissive → deny for a2r_app ════
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','accounts','sessions','verification_tokens','memberships',
    'organizations','staff_grants','staff_elevations','impersonation_grants'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "rls_app_plumbing" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "rls_deny_app" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "rls_deny_app" ON public.%I AS PERMISSIVE FOR ALL TO "a2r_app" '
      || 'USING (false) WITH CHECK (false)', t);
  END LOOP;
END $$;

-- ══ STEP 3 — a2r_app never logs in ══════════════════════════════════════
ALTER ROLE "a2r_app" WITH NOLOGIN;
