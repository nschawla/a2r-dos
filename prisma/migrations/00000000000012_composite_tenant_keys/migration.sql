-- A2R Delivery OS — P1: composite tenant keys on the transitively-scoped models.
--
-- BEFORE
-- ──────────────────────────────────────────────────────────────────────
--   8 project-scoped models (audit_entries, effort_cells, financial_actuals,
--   project_contributors, raid_entries, schedule_phases, scope_items,
--   steerco_decisions) and data_import_rows carried NO organizationId of
--   their own. Tenant isolation for them was a JOIN through `projects`
--   (or `data_import_batches`) — enforced by the app tier + the P0 #1
--   org-scope Prisma extension, but with no same-table FK tying each row
--   to its tenant, and no target for a same-table RLS policy.
--
-- AFTER
-- ──────────────────────────────────────────────────────────────────────
--   Each of the 9 tables has a NOT NULL "organizationId" column with a
--   FK to organizations(id) ON DELETE CASCADE, backfilled from its parent.
--   src/lib/db/org-scope.ts reclassifies them as DIRECT_ORG models, so the
--   extension now scopes them with a direct scalar filter and auto-injects
--   the column on create. docs/RLS_ROADMAP.md §2 updated to match.
--
-- Data-preserving: the column is added nullable, backfilled from the parent
-- row's organizationId (every parent FK is NOT NULL), THEN set NOT NULL.
--
-- Hand-derived (see 00000000000000_init). Apply with:
--   npx prisma db execute --file prisma/migrations/00000000000012_composite_tenant_keys/migration.sql --schema prisma/schema.prisma
--   npx prisma generate
-- ──────────────────────────────────────────────────────────────────────

-- ── audit_entries ─────────────────────────────────────────────────────
ALTER TABLE "audit_entries" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
UPDATE "audit_entries" c
  SET "organizationId" = p."organizationId"
  FROM "projects" p
  WHERE p."id" = c."projectId" AND c."organizationId" IS NULL;
ALTER TABLE "audit_entries" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "audit_entries" DROP CONSTRAINT IF EXISTS "audit_entries_organizationId_fkey";
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "audit_entries_organizationId_idx" ON "audit_entries" ("organizationId");

-- ── effort_cells ──────────────────────────────────────────────────────
ALTER TABLE "effort_cells" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
UPDATE "effort_cells" c
  SET "organizationId" = p."organizationId"
  FROM "projects" p
  WHERE p."id" = c."projectId" AND c."organizationId" IS NULL;
ALTER TABLE "effort_cells" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "effort_cells" DROP CONSTRAINT IF EXISTS "effort_cells_organizationId_fkey";
ALTER TABLE "effort_cells" ADD CONSTRAINT "effort_cells_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "effort_cells_organizationId_idx" ON "effort_cells" ("organizationId");

-- ── financial_actuals ─────────────────────────────────────────────────
ALTER TABLE "financial_actuals" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
UPDATE "financial_actuals" c
  SET "organizationId" = p."organizationId"
  FROM "projects" p
  WHERE p."id" = c."projectId" AND c."organizationId" IS NULL;
ALTER TABLE "financial_actuals" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "financial_actuals" DROP CONSTRAINT IF EXISTS "financial_actuals_organizationId_fkey";
ALTER TABLE "financial_actuals" ADD CONSTRAINT "financial_actuals_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "financial_actuals_organizationId_idx" ON "financial_actuals" ("organizationId");

-- ── project_contributors ──────────────────────────────────────────────
ALTER TABLE "project_contributors" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
UPDATE "project_contributors" c
  SET "organizationId" = p."organizationId"
  FROM "projects" p
  WHERE p."id" = c."projectId" AND c."organizationId" IS NULL;
ALTER TABLE "project_contributors" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "project_contributors" DROP CONSTRAINT IF EXISTS "project_contributors_organizationId_fkey";
ALTER TABLE "project_contributors" ADD CONSTRAINT "project_contributors_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "project_contributors_organizationId_idx" ON "project_contributors" ("organizationId");

-- ── raid_entries ──────────────────────────────────────────────────────
ALTER TABLE "raid_entries" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
UPDATE "raid_entries" c
  SET "organizationId" = p."organizationId"
  FROM "projects" p
  WHERE p."id" = c."projectId" AND c."organizationId" IS NULL;
ALTER TABLE "raid_entries" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "raid_entries" DROP CONSTRAINT IF EXISTS "raid_entries_organizationId_fkey";
ALTER TABLE "raid_entries" ADD CONSTRAINT "raid_entries_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "raid_entries_organizationId_idx" ON "raid_entries" ("organizationId");

-- ── schedule_phases ───────────────────────────────────────────────────
ALTER TABLE "schedule_phases" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
UPDATE "schedule_phases" c
  SET "organizationId" = p."organizationId"
  FROM "projects" p
  WHERE p."id" = c."projectId" AND c."organizationId" IS NULL;
ALTER TABLE "schedule_phases" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "schedule_phases" DROP CONSTRAINT IF EXISTS "schedule_phases_organizationId_fkey";
ALTER TABLE "schedule_phases" ADD CONSTRAINT "schedule_phases_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "schedule_phases_organizationId_idx" ON "schedule_phases" ("organizationId");

-- ── scope_items ───────────────────────────────────────────────────────
ALTER TABLE "scope_items" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
UPDATE "scope_items" c
  SET "organizationId" = p."organizationId"
  FROM "projects" p
  WHERE p."id" = c."projectId" AND c."organizationId" IS NULL;
ALTER TABLE "scope_items" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "scope_items" DROP CONSTRAINT IF EXISTS "scope_items_organizationId_fkey";
ALTER TABLE "scope_items" ADD CONSTRAINT "scope_items_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "scope_items_organizationId_idx" ON "scope_items" ("organizationId");

-- ── steerco_decisions ─────────────────────────────────────────────────
ALTER TABLE "steerco_decisions" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
UPDATE "steerco_decisions" c
  SET "organizationId" = p."organizationId"
  FROM "projects" p
  WHERE p."id" = c."projectId" AND c."organizationId" IS NULL;
ALTER TABLE "steerco_decisions" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "steerco_decisions" DROP CONSTRAINT IF EXISTS "steerco_decisions_organizationId_fkey";
ALTER TABLE "steerco_decisions" ADD CONSTRAINT "steerco_decisions_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "steerco_decisions_organizationId_idx" ON "steerco_decisions" ("organizationId");

-- ── data_import_rows (scoped through data_import_batches, not projects) ─
ALTER TABLE "data_import_rows" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
UPDATE "data_import_rows" c
  SET "organizationId" = b."organizationId"
  FROM "data_import_batches" b
  WHERE b."id" = c."batchId" AND c."organizationId" IS NULL;
ALTER TABLE "data_import_rows" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "data_import_rows" DROP CONSTRAINT IF EXISTS "data_import_rows_organizationId_fkey";
ALTER TABLE "data_import_rows" ADD CONSTRAINT "data_import_rows_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "data_import_rows_organizationId_idx" ON "data_import_rows" ("organizationId");
