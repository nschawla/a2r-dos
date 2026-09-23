-- Closes an RLS/tenant-inventory gap on `portfolio_interventions`
-- (created by migration 28, PS Orchestration & Decision Engine, v1.20.0):
-- that migration added the table with its own `organizationId` column
-- and composite FKs, but — unlike every other tenant table added after
-- the RLS baseline (migrations 17, 26, 27) — never gave it a
-- tenant_isolation policy, and the table was never added to
-- scripts/rls-smoke.ts's TENANT_TABLES list or src/lib/db/org-scope.ts's
-- DIRECT_ORG_MODELS allowlist. Caught by tests/security/
-- tenant-model-inventory.test.ts (a deterministic schema-drift guard)
-- while auditing schema/RLS documentation accuracy for the executive-
-- triage doc sweep.
--
-- No application-level query against this table has ever omitted an
-- explicit organizationId filter (every read/write site was hand-written
-- with one — see src/server/queries/commercial-triage.ts,
-- src/server/queries/decision-context.ts, src/server/actions/
-- portfolio-interventions.ts), so this was never an exploited or
-- exploitable gap in practice. It IS a real gap in the two independent,
-- fail-closed layers this app otherwise holds every tenant table to: the
-- Prisma $extends org-scope guardrail (app-level, always active) and
-- Postgres RLS (DB-level, active once RLS_ENFORCE=1). Closing both here.
--
-- Same shape as every other tenant table (migrations 17, 26, 27): a row
-- is visible / writable to the `a2r_app` runtime role iff its
-- organizationId equals the transaction's `app.current_org` GUC.
-- Idempotent (DROP IF EXISTS first). Inert until RLS_ENFORCE=1 + the
-- a2r_app role exists on this database — harmless to run before then
-- (CREATE POLICY on a table with RLS not yet enabled just defines the
-- policy for later).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'portfolio_interventions'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    -- Supabase's default privileges auto-grant its own `anon`/`authenticated`
    -- roles on a new table (migration 07's baseline lockdown predates this
    -- table, so it never touched it) — revoke explicitly, same as every
    -- other new table since (migrations 09, 13, 20, 26, 27).
    EXECUTE format('REVOKE ALL ON public.%I FROM "anon", "authenticated"', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I FOR ALL TO "a2r_app" '
      || 'USING ("organizationId" = current_setting(''app.current_org'', true)) '
      || 'WITH CHECK ("organizationId" = current_setting(''app.current_org'', true))', t);
  END LOOP;
END $$;
