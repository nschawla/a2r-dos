-- A2R Delivery OS — P0-2 (Phase C): per-table tenant-isolation RLS policies.
--
-- ══ NOT APPLIED. DORMANT GROUNDWORK. ═══════════════════════════════════
-- Apply table-group by table-group, with a soak between groups, per
-- docs/RLS_ENFORCEMENT_RUNBOOK.md. Requires migration 16 (the `a2r_app`
-- role) first, and `RLS_ENFORCE=1` on the app so every query arrives
-- inside a tx that has `SET LOCAL app.current_org`.
-- ═════════════════════════════════════════════════════════════════════════
--
-- MODEL. Every one of the 29 tenant-owned tables carries its own
-- `organizationId` (migrations 12 + 14). The policy is the same on all of
-- them: a row is visible / writable iff its `organizationId` equals the
-- transaction's `app.current_org` GUC. `current_setting(_, true)` returns
-- NULL when the GUC is unset; `organizationId = NULL` is NULL → no rows,
-- so an unscoped connection is fail-closed.
--
-- RLS was already ENABLED (no policy = deny-all for non-owners) on every
-- table by migration 07 — that was aimed at the Supabase `anon` /
-- `authenticated` PostgREST roles. This migration ADDS the policies that
-- let the new `a2r_app` role through for its own tenant only. `postgres`
-- (table owner, BYPASSRLS) is unaffected until the FORCE step at the end.
--
-- Idempotent: `DROP POLICY IF EXISTS` before each `CREATE POLICY`.
-- Rollback per table: `DROP POLICY tenant_isolation ON "<t>";`
-- ──────────────────────────────────────────────────────────────────────

-- Helper: assert the GUC is a non-default value for a real tenant session.
-- (Informational — the policy itself is the enforcement.)

-- ══ STEP 1 — read-mostly config tables (lowest write volume) ═══════════
DROP POLICY IF EXISTS tenant_isolation ON "control_labels";
CREATE POLICY tenant_isolation ON "control_labels"
  USING ("organizationId" = current_setting('app.current_org', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org', true));

DROP POLICY IF EXISTS tenant_isolation ON "delivery_roles";
CREATE POLICY tenant_isolation ON "delivery_roles"
  USING ("organizationId" = current_setting('app.current_org', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org', true));

DROP POLICY IF EXISTS tenant_isolation ON "practices";
CREATE POLICY tenant_isolation ON "practices"
  USING ("organizationId" = current_setting('app.current_org', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org', true));

DROP POLICY IF EXISTS tenant_isolation ON "governance_configs";
CREATE POLICY tenant_isolation ON "governance_configs"
  USING ("organizationId" = current_setting('app.current_org', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org', true));

DROP POLICY IF EXISTS tenant_isolation ON "org_policies";
CREATE POLICY tenant_isolation ON "org_policies"
  USING ("organizationId" = current_setting('app.current_org', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org', true));

DROP POLICY IF EXISTS tenant_isolation ON "organization_holidays";
CREATE POLICY tenant_isolation ON "organization_holidays"
  USING ("organizationId" = current_setting('app.current_org', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org', true));

DROP POLICY IF EXISTS tenant_isolation ON "role_utilization_policies";
CREATE POLICY tenant_isolation ON "role_utilization_policies"
  USING ("organizationId" = current_setting('app.current_org', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org', true));

DROP POLICY IF EXISTS tenant_isolation ON "custom_kpis";
CREATE POLICY tenant_isolation ON "custom_kpis"
  USING ("organizationId" = current_setting('app.current_org', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org', true));

DROP POLICY IF EXISTS tenant_isolation ON "sso_group_mappings";
CREATE POLICY tenant_isolation ON "sso_group_mappings"
  USING ("organizationId" = current_setting('app.current_org', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org', true));

DROP POLICY IF EXISTS tenant_isolation ON "identity_providers";
CREATE POLICY tenant_isolation ON "identity_providers"
  USING ("organizationId" = current_setting('app.current_org', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org', true));

-- ══ STEP 2 — the core project hierarchy ═══════════════════════════════
DROP POLICY IF EXISTS tenant_isolation ON "projects";
CREATE POLICY tenant_isolation ON "projects"
  USING ("organizationId" = current_setting('app.current_org', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org', true));

DROP POLICY IF EXISTS tenant_isolation ON "project_contributors";
CREATE POLICY tenant_isolation ON "project_contributors"
  USING ("organizationId" = current_setting('app.current_org', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org', true));

DROP POLICY IF EXISTS tenant_isolation ON "scope_items";
CREATE POLICY tenant_isolation ON "scope_items"
  USING ("organizationId" = current_setting('app.current_org', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org', true));

DROP POLICY IF EXISTS tenant_isolation ON "effort_cells";
CREATE POLICY tenant_isolation ON "effort_cells"
  USING ("organizationId" = current_setting('app.current_org', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org', true));

DROP POLICY IF EXISTS tenant_isolation ON "audit_entries";
CREATE POLICY tenant_isolation ON "audit_entries"
  USING ("organizationId" = current_setting('app.current_org', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org', true));

DROP POLICY IF EXISTS tenant_isolation ON "raid_entries";
CREATE POLICY tenant_isolation ON "raid_entries"
  USING ("organizationId" = current_setting('app.current_org', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org', true));

DROP POLICY IF EXISTS tenant_isolation ON "financial_actuals";
CREATE POLICY tenant_isolation ON "financial_actuals"
  USING ("organizationId" = current_setting('app.current_org', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org', true));

DROP POLICY IF EXISTS tenant_isolation ON "schedule_phases";
CREATE POLICY tenant_isolation ON "schedule_phases"
  USING ("organizationId" = current_setting('app.current_org', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org', true));

DROP POLICY IF EXISTS tenant_isolation ON "steerco_decisions";
CREATE POLICY tenant_isolation ON "steerco_decisions"
  USING ("organizationId" = current_setting('app.current_org', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org', true));

DROP POLICY IF EXISTS tenant_isolation ON "resources";
CREATE POLICY tenant_isolation ON "resources"
  USING ("organizationId" = current_setting('app.current_org', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org', true));

DROP POLICY IF EXISTS tenant_isolation ON "weekly_assignment_slots";
CREATE POLICY tenant_isolation ON "weekly_assignment_slots"
  USING ("organizationId" = current_setting('app.current_org', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org', true));

DROP POLICY IF EXISTS tenant_isolation ON "timesheet_entries";
CREATE POLICY tenant_isolation ON "timesheet_entries"
  USING ("organizationId" = current_setting('app.current_org', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org', true));

-- ══ STEP 3 — ingestion + audit / security tables ═════════════════════
-- Note ImmutableAuditLedger: the hash-chain append reads the tenant's
-- previous row — that read is within the same tenant, so the policy does
-- not break it. The genesis-row insert has organizationId set, fine.
DROP POLICY IF EXISTS tenant_isolation ON "data_import_batches";
CREATE POLICY tenant_isolation ON "data_import_batches"
  USING ("organizationId" = current_setting('app.current_org', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org', true));

DROP POLICY IF EXISTS tenant_isolation ON "data_import_rows";
CREATE POLICY tenant_isolation ON "data_import_rows"
  USING ("organizationId" = current_setting('app.current_org', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org', true));

DROP POLICY IF EXISTS tenant_isolation ON "activity_log_entries";
CREATE POLICY tenant_isolation ON "activity_log_entries"
  USING ("organizationId" = current_setting('app.current_org', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org', true));

DROP POLICY IF EXISTS tenant_isolation ON "audit_logs";
CREATE POLICY tenant_isolation ON "audit_logs"
  USING ("organizationId" = current_setting('app.current_org', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org', true));

DROP POLICY IF EXISTS tenant_isolation ON "immutable_audit_ledger";
CREATE POLICY tenant_isolation ON "immutable_audit_ledger"
  USING ("organizationId" = current_setting('app.current_org', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org', true));

DROP POLICY IF EXISTS tenant_isolation ON "api_keys";
CREATE POLICY tenant_isolation ON "api_keys"
  USING ("organizationId" = current_setting('app.current_org', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org', true));

DROP POLICY IF EXISTS tenant_isolation ON "impersonation_grants";
CREATE POLICY tenant_isolation ON "impersonation_grants"
  USING ("organizationId" = current_setting('app.current_org', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org', true));

-- ══ STEP 4 — FINAL LOCKDOWN (run only after a full soak) ══════════════
-- FORCE makes even the table owner (`postgres`) subject to the policy, so
-- the ops console + admin scripts MUST connect through a path that sets
-- `app.current_org` (or a dedicated BYPASSRLS maintenance role). Leave
-- commented until docs/RLS_ENFORCEMENT_RUNBOOK.md step 6.
--
-- DO $$
-- DECLARE r record;
-- BEGIN
--   FOR r IN SELECT unnest(ARRAY[
--     'control_labels','delivery_roles','practices','governance_configs','org_policies',
--     'organization_holidays','role_utilization_policies','custom_kpis','sso_group_mappings',
--     'identity_providers','projects','project_contributors','scope_items','effort_cells',
--     'audit_entries','raid_entries','financial_actuals','schedule_phases','steerco_decisions',
--     'resources','weekly_assignment_slots','timesheet_entries','data_import_batches',
--     'data_import_rows','activity_log_entries','audit_logs','immutable_audit_ledger',
--     'api_keys','impersonation_grants'
--   ]) AS t
--   LOOP EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', r.t); END LOOP;
-- END $$;
