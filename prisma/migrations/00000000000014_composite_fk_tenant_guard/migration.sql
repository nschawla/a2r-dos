-- A2R Delivery OS — P0-3: composite tenant foreign keys.
--
-- BEFORE
-- ──────────────────────────────────────────────────────────────────────
--   The 11 project- / batch-scoped child models each carried BOTH an
--   "organizationId" (own column + FK to organizations, added in migration
--   12) AND a "projectId" / "batchId" FK to their parent — but the two
--   were independent. Nothing at the database level stopped a row whose
--   "organizationId" = tenant A from pointing at a "projectId" that
--   belongs to tenant B. Tenant isolation for that shape relied entirely
--   on the app tier + the v1.7.0 org-scope Prisma extension.
--
-- AFTER
-- ──────────────────────────────────────────────────────────────────────
--   Each parent ("projects", "data_import_batches") gets a composite
--   UNIQUE ("organizationId", "id"). Each child's single-column parent FK
--   is replaced by a COMPOSITE FK ("organizationId", <parentId>) →
--   parent("organizationId", "id"). Postgres now physically rejects any
--   child row whose tenant disagrees with its parent's tenant — a bug in
--   either application isolation layer can no longer create one.
--
--   The child's own single-column "*_organizationId_fkey" → organizations
--   stays in place (belt-and-braces; also carries the Organization-level
--   ON DELETE CASCADE).
--
-- DATA-PRESERVING & IDEMPOTENT. Every child row already satisfies the new
-- constraint (the org-scope extension has enforced org==parent.org on
-- every write since v1.7.0); the PRE-FLIGHT block below aborts loudly if
-- that is somehow not true, before any constraint is added.
--
-- Hand-derived (see 00000000000000_init). Apply with:
--   npx prisma db execute --file prisma/migrations/00000000000014_composite_fk_tenant_guard/migration.sql --schema prisma/schema.prisma
--   npx prisma generate
-- ──────────────────────────────────────────────────────────────────────

-- ── PRE-FLIGHT: abort if any child's tenant disagrees with its parent's ──
DO $$
DECLARE
  bad bigint;
BEGIN
  SELECT
    (SELECT count(*) FROM "weekly_assignment_slots" c JOIN "projects" p ON p."id" = c."projectId" WHERE p."organizationId" <> c."organizationId")
  + (SELECT count(*) FROM "timesheet_entries"        c JOIN "projects" p ON p."id" = c."projectId" WHERE p."organizationId" <> c."organizationId")
  + (SELECT count(*) FROM "project_contributors"     c JOIN "projects" p ON p."id" = c."projectId" WHERE p."organizationId" <> c."organizationId")
  + (SELECT count(*) FROM "scope_items"              c JOIN "projects" p ON p."id" = c."projectId" WHERE p."organizationId" <> c."organizationId")
  + (SELECT count(*) FROM "effort_cells"             c JOIN "projects" p ON p."id" = c."projectId" WHERE p."organizationId" <> c."organizationId")
  + (SELECT count(*) FROM "audit_entries"            c JOIN "projects" p ON p."id" = c."projectId" WHERE p."organizationId" <> c."organizationId")
  + (SELECT count(*) FROM "raid_entries"             c JOIN "projects" p ON p."id" = c."projectId" WHERE p."organizationId" <> c."organizationId")
  + (SELECT count(*) FROM "financial_actuals"        c JOIN "projects" p ON p."id" = c."projectId" WHERE p."organizationId" <> c."organizationId")
  + (SELECT count(*) FROM "schedule_phases"          c JOIN "projects" p ON p."id" = c."projectId" WHERE p."organizationId" <> c."organizationId")
  + (SELECT count(*) FROM "steerco_decisions"        c JOIN "projects" p ON p."id" = c."projectId" WHERE p."organizationId" <> c."organizationId")
  + (SELECT count(*) FROM "data_import_rows"         c JOIN "data_import_batches" b ON b."id" = c."batchId" WHERE b."organizationId" <> c."organizationId")
  INTO bad;
  IF bad > 0 THEN
    RAISE EXCEPTION 'composite-FK pre-flight failed: % child row(s) disagree with their parent tenant — resolve before migrating', bad;
  END IF;
END $$;

-- ── parents: composite UNIQUE target ──────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "projects_organizationId_id_key"
  ON "projects" ("organizationId", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "data_import_batches_organizationId_id_key"
  ON "data_import_batches" ("organizationId", "id");

-- ── children: single-column parent FK → composite (organizationId, parentId) ──
-- projects children
ALTER TABLE "weekly_assignment_slots" DROP CONSTRAINT IF EXISTS "weekly_assignment_slots_projectId_fkey";
ALTER TABLE "weekly_assignment_slots" DROP CONSTRAINT IF EXISTS "weekly_assignment_slots_organizationId_projectId_fkey";
ALTER TABLE "weekly_assignment_slots" ADD CONSTRAINT "weekly_assignment_slots_organizationId_projectId_fkey"
  FOREIGN KEY ("organizationId", "projectId") REFERENCES "projects"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "timesheet_entries" DROP CONSTRAINT IF EXISTS "timesheet_entries_projectId_fkey";
ALTER TABLE "timesheet_entries" DROP CONSTRAINT IF EXISTS "timesheet_entries_organizationId_projectId_fkey";
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_organizationId_projectId_fkey"
  FOREIGN KEY ("organizationId", "projectId") REFERENCES "projects"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_contributors" DROP CONSTRAINT IF EXISTS "project_contributors_projectId_fkey";
ALTER TABLE "project_contributors" DROP CONSTRAINT IF EXISTS "project_contributors_organizationId_projectId_fkey";
ALTER TABLE "project_contributors" ADD CONSTRAINT "project_contributors_organizationId_projectId_fkey"
  FOREIGN KEY ("organizationId", "projectId") REFERENCES "projects"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scope_items" DROP CONSTRAINT IF EXISTS "scope_items_projectId_fkey";
ALTER TABLE "scope_items" DROP CONSTRAINT IF EXISTS "scope_items_organizationId_projectId_fkey";
ALTER TABLE "scope_items" ADD CONSTRAINT "scope_items_organizationId_projectId_fkey"
  FOREIGN KEY ("organizationId", "projectId") REFERENCES "projects"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "effort_cells" DROP CONSTRAINT IF EXISTS "effort_cells_projectId_fkey";
ALTER TABLE "effort_cells" DROP CONSTRAINT IF EXISTS "effort_cells_organizationId_projectId_fkey";
ALTER TABLE "effort_cells" ADD CONSTRAINT "effort_cells_organizationId_projectId_fkey"
  FOREIGN KEY ("organizationId", "projectId") REFERENCES "projects"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_entries" DROP CONSTRAINT IF EXISTS "audit_entries_projectId_fkey";
ALTER TABLE "audit_entries" DROP CONSTRAINT IF EXISTS "audit_entries_organizationId_projectId_fkey";
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_organizationId_projectId_fkey"
  FOREIGN KEY ("organizationId", "projectId") REFERENCES "projects"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "raid_entries" DROP CONSTRAINT IF EXISTS "raid_entries_projectId_fkey";
ALTER TABLE "raid_entries" DROP CONSTRAINT IF EXISTS "raid_entries_organizationId_projectId_fkey";
ALTER TABLE "raid_entries" ADD CONSTRAINT "raid_entries_organizationId_projectId_fkey"
  FOREIGN KEY ("organizationId", "projectId") REFERENCES "projects"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "financial_actuals" DROP CONSTRAINT IF EXISTS "financial_actuals_projectId_fkey";
ALTER TABLE "financial_actuals" DROP CONSTRAINT IF EXISTS "financial_actuals_organizationId_projectId_fkey";
ALTER TABLE "financial_actuals" ADD CONSTRAINT "financial_actuals_organizationId_projectId_fkey"
  FOREIGN KEY ("organizationId", "projectId") REFERENCES "projects"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "schedule_phases" DROP CONSTRAINT IF EXISTS "schedule_phases_projectId_fkey";
ALTER TABLE "schedule_phases" DROP CONSTRAINT IF EXISTS "schedule_phases_organizationId_projectId_fkey";
ALTER TABLE "schedule_phases" ADD CONSTRAINT "schedule_phases_organizationId_projectId_fkey"
  FOREIGN KEY ("organizationId", "projectId") REFERENCES "projects"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "steerco_decisions" DROP CONSTRAINT IF EXISTS "steerco_decisions_projectId_fkey";
ALTER TABLE "steerco_decisions" DROP CONSTRAINT IF EXISTS "steerco_decisions_organizationId_projectId_fkey";
ALTER TABLE "steerco_decisions" ADD CONSTRAINT "steerco_decisions_organizationId_projectId_fkey"
  FOREIGN KEY ("organizationId", "projectId") REFERENCES "projects"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- data_import_batches child
ALTER TABLE "data_import_rows" DROP CONSTRAINT IF EXISTS "data_import_rows_batchId_fkey";
ALTER TABLE "data_import_rows" DROP CONSTRAINT IF EXISTS "data_import_rows_organizationId_batchId_fkey";
ALTER TABLE "data_import_rows" ADD CONSTRAINT "data_import_rows_organizationId_batchId_fkey"
  FOREIGN KEY ("organizationId", "batchId") REFERENCES "data_import_batches"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── housekeeping: normalise two FKs to ON UPDATE CASCADE so `prisma
--    migrate diff` stays quiet after this migration (no behaviour change —
--    users.id is immutable). ──
ALTER TABLE "staff_grants" DROP CONSTRAINT IF EXISTS "staff_grants_userId_fkey";
ALTER TABLE "staff_grants" ADD CONSTRAINT "staff_grants_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_elevations" DROP CONSTRAINT IF EXISTS "staff_elevations_userId_fkey";
ALTER TABLE "staff_elevations" ADD CONSTRAINT "staff_elevations_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
