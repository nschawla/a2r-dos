-- A2R Delivery OS — P0-2 (Phase C): per-table tenant-isolation RLS policies.
--
-- ══ Applied to STAGING (v1.9.0). NOT applied to production. ═════════════
-- Requires migration 16 (the `a2r_app` role) first, and `RLS_ENFORCE=1` on
-- the app so every tenant query arrives inside a tx that has run
-- `SELECT set_config('app.current_org', <org>, true)` (src/lib/db/with-tenant-tx.ts).
-- Cross-tenant / pre-session flows run on a BYPASSRLS connection
-- (src/lib/db/admin-db.ts). See docs/RLS_ENFORCEMENT_RUNBOOK.md.
-- ═════════════════════════════════════════════════════════════════════════
--
-- MODEL. Two policy shapes, both scoped `TO "a2r_app"` so the table owner
-- (`postgres`, BYPASSRLS) is untouched until a later `FORCE` step:
--
--  1. tenant_isolation (29 tenant tables) — a row is visible / writable iff
--     its `organizationId` equals the tx GUC `app.current_org`.
--     `current_setting(_, true)` is NULL when unset → `col = NULL` → no rows
--     (fail-closed). `impersonation_grants` is NOT here — it is resolved
--     pre-scope during session bootstrap, so it takes the plumbing policy.
--
--  2. rls_app_plumbing (identity / tenant-routing tables) — `USING (true)`.
--     A user spans tenants; `Membership` / `Organization` are how "which
--     tenant" is decided in the first place. These stay protected by the
--     app's JWT + membership checks (RLS_ROADMAP §2a), not by RLS. anon /
--     authenticated still have zero access (RLS enabled, no policy, grants
--     revoked — migration 07).
--
-- Idempotent: `DROP POLICY IF EXISTS` before each `CREATE POLICY`.
-- Rollback per table: `DROP POLICY <name> ON "<t>";`
-- ──────────────────────────────────────────────────────────────────────

-- ══ Plumbing tables — permissive access for a2r_app ═══════════════════
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','accounts','sessions','verification_tokens',
    'memberships','organizations','staff_grants','staff_elevations',
    'impersonation_grants'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS rls_app_plumbing ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY rls_app_plumbing ON public.%I FOR ALL TO "a2r_app" USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- ══ Tenant tables — organizationId = app.current_org ══════════════════
-- STEP 1  read-mostly config  ·  STEP 2  project hierarchy  ·  STEP 3  audit / ingest
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    -- STEP 1
    'control_labels','delivery_roles','practices','governance_configs','org_policies',
    'organization_holidays','role_utilization_policies','custom_kpis','sso_group_mappings',
    'identity_providers',
    -- STEP 2
    'projects','project_contributors','scope_items','effort_cells','audit_entries',
    'raid_entries','financial_actuals','schedule_phases','steerco_decisions','resources',
    'weekly_assignment_slots','timesheet_entries',
    -- STEP 3
    'data_import_batches','data_import_rows','activity_log_entries','audit_logs',
    'immutable_audit_ledger','api_keys'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I FOR ALL TO "a2r_app" '
      || 'USING ("organizationId" = current_setting(''app.current_org'', true)) '
      || 'WITH CHECK ("organizationId" = current_setting(''app.current_org'', true))', t);
  END LOOP;
END $$;

-- ══ STEP 4 — FINAL LOCKDOWN (run only after a full soak) ══════════════
-- FORCE makes even the table owner (`postgres`) subject to policy, so the
-- BYPASSRLS admin connection must then use a role that is exempt, and every
-- plumbing/tenant table needs a matching owner-side policy. Left commented
-- until docs/RLS_ENFORCEMENT_RUNBOOK.md step 6.
--
-- DO $$ DECLARE t text; BEGIN
--   FOREACH t IN ARRAY ARRAY[ /* all 29 tenant tables */ ] LOOP
--     EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
--   END LOOP;
-- END $$;
