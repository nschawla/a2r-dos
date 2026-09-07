-- A2R Delivery OS — WP1 (v1.13.0): composite-FK closure (P1).
--
-- ══ Applied to STAGING and PRODUCTION. ════════════════════════════════════
-- Run via the session pooler / DIRECT_URL (:5432). Idempotent.
-- Requires PostgreSQL 15+ for the `ON DELETE SET NULL (column)` form
-- (Supabase runs 17). See docs/TENANT_MODEL_INVENTORY.md.
-- ═════════════════════════════════════════════════════════════════════════
--
-- WHY
-- ──────────────────────────────────────────────────────────────────────
-- Migration 14 (Phase B) added composite `(organizationId, projectId)` FKs
-- to the 11 project/batch children. ~21 other intra-tenant references were
-- still single-column, so the database could not reject a child row that
-- points at a parent in a DIFFERENT organization (only the app tier did).
-- This migration makes every intra-tenant FK composite
-- `(organizationId, <col>)` → `<parent>(organizationId, id)`.
--
-- FKs to `users` stay single-column — a User spans tenants (no organizationId).
--
-- ON DELETE
-- ──────────────────────────────────────────────────────────────────────
-- Preserves today's behaviour exactly:
--   * NOT NULL children  → ON DELETE CASCADE  (unchanged)
--   * nullable children  → ON DELETE SET NULL ("<col>")  — the PG15+
--     column-list form: only the reference column is nulled, never the
--     row's own required `organizationId`. Prisma models these as
--     `onDelete: NoAction` (the DB owns the action; Prisma Client does not
--     emulate referential actions on Postgres, so the annotation is inert).
--
-- ROLLBACK: drop each `*_organizationId_*_fkey` and re-add the original
-- single-column `*_<col>_fkey` with its prior ON DELETE (see the table in
-- docs/TENANT_MODEL_INVENTORY.md).
-- ──────────────────────────────────────────────────────────────────────

-- ══ 0 — PRE-FLIGHT: refuse to run if any existing row would be orphaned ═
DO $$
DECLARE bad bigint;
BEGIN
  SELECT count(*) INTO bad FROM (
    SELECT 1 FROM "resources" c JOIN "delivery_roles" p ON p."id"=c."roleId"
      WHERE c."roleId" IS NOT NULL AND p."organizationId"<>c."organizationId"
    UNION ALL SELECT 1 FROM "resources" c JOIN "practices" p ON p."id"=c."practiceId"
      WHERE c."practiceId" IS NOT NULL AND p."organizationId"<>c."organizationId"
    UNION ALL SELECT 1 FROM "resources" c JOIN "resources" p ON p."id"=c."managerId"
      WHERE c."managerId" IS NOT NULL AND p."organizationId"<>c."organizationId"
    UNION ALL SELECT 1 FROM "resources" c JOIN "role_utilization_policies" p ON p."id"=c."rolePolicyId"
      WHERE c."rolePolicyId" IS NOT NULL AND p."organizationId"<>c."organizationId"
    UNION ALL SELECT 1 FROM "projects" c JOIN "resources" p ON p."id"=c."practiceDirectorId"
      WHERE c."practiceDirectorId" IS NOT NULL AND p."organizationId"<>c."organizationId"
    UNION ALL SELECT 1 FROM "projects" c JOIN "resources" p ON p."id"=c."deliveryManagerId"
      WHERE c."deliveryManagerId" IS NOT NULL AND p."organizationId"<>c."organizationId"
    UNION ALL SELECT 1 FROM "projects" c JOIN "resources" p ON p."id"=c."projectManagerId"
      WHERE c."projectManagerId" IS NOT NULL AND p."organizationId"<>c."organizationId"
    UNION ALL SELECT 1 FROM "projects" c JOIN "practices" p ON p."id"=c."practiceId"
      WHERE c."practiceId" IS NOT NULL AND p."organizationId"<>c."organizationId"
    UNION ALL SELECT 1 FROM "projects" c JOIN "projects" p ON p."id"=c."parentId"
      WHERE c."parentId" IS NOT NULL AND p."organizationId"<>c."organizationId"
    UNION ALL SELECT 1 FROM "delivery_roles" c JOIN "practices" p ON p."id"=c."practiceId"
      WHERE c."practiceId" IS NOT NULL AND p."organizationId"<>c."organizationId"
    UNION ALL SELECT 1 FROM "raid_entries" c JOIN "resources" p ON p."id"=c."ownerId"
      WHERE c."ownerId" IS NOT NULL AND p."organizationId"<>c."organizationId"
    UNION ALL SELECT 1 FROM "financial_actuals" c JOIN "delivery_roles" p ON p."id"=c."roleId"
      WHERE c."roleId" IS NOT NULL AND p."organizationId"<>c."organizationId"
    UNION ALL SELECT 1 FROM "steerco_decisions" c JOIN "resources" p ON p."id"=c."decisionOwnerId"
      WHERE c."decisionOwnerId" IS NOT NULL AND p."organizationId"<>c."organizationId"
    UNION ALL SELECT 1 FROM "sso_group_mappings" c JOIN "identity_providers" p ON p."id"=c."identityProviderId"
      WHERE p."organizationId"<>c."organizationId"
    UNION ALL SELECT 1 FROM "sso_group_mappings" c JOIN "practices" p ON p."id"=c."practiceId"
      WHERE c."practiceId" IS NOT NULL AND p."organizationId"<>c."organizationId"
    UNION ALL SELECT 1 FROM "activity_log_entries" c JOIN "projects" p ON p."id"=c."projectId"
      WHERE c."projectId" IS NOT NULL AND p."organizationId"<>c."organizationId"
    UNION ALL SELECT 1 FROM "audit_logs" c JOIN "projects" p ON p."id"=c."projectId"
      WHERE c."projectId" IS NOT NULL AND p."organizationId"<>c."organizationId"
    UNION ALL SELECT 1 FROM "weekly_assignment_slots" c JOIN "resources" p ON p."id"=c."resourceId"
      WHERE p."organizationId"<>c."organizationId"
    UNION ALL SELECT 1 FROM "timesheet_entries" c JOIN "resources" p ON p."id"=c."resourceId"
      WHERE p."organizationId"<>c."organizationId"
    UNION ALL SELECT 1 FROM "project_contributors" c JOIN "resources" p ON p."id"=c."resourceId"
      WHERE p."organizationId"<>c."organizationId"
    UNION ALL SELECT 1 FROM "effort_cells" c JOIN "delivery_roles" p ON p."id"=c."roleId"
      WHERE p."organizationId"<>c."organizationId"
  ) v;
  IF bad > 0 THEN
    RAISE EXCEPTION 'composite-FK closure pre-flight: % existing cross-tenant reference(s) — resolve before applying', bad;
  END IF;
END $$;

-- ══ 1 — composite-FK targets: UNIQUE (organizationId, id) on the parents ═
CREATE UNIQUE INDEX IF NOT EXISTS "practices_organizationId_id_key"                 ON "practices"                 ("organizationId","id");
CREATE UNIQUE INDEX IF NOT EXISTS "delivery_roles_organizationId_id_key"            ON "delivery_roles"            ("organizationId","id");
CREATE UNIQUE INDEX IF NOT EXISTS "resources_organizationId_id_key"                 ON "resources"                 ("organizationId","id");
CREATE UNIQUE INDEX IF NOT EXISTS "role_utilization_policies_organizationId_id_key" ON "role_utilization_policies" ("organizationId","id");
CREATE UNIQUE INDEX IF NOT EXISTS "identity_providers_organizationId_id_key"        ON "identity_providers"        ("organizationId","id");

-- ══ 2 — nullable references → composite + ON DELETE SET NULL ("<col>") ══
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('resources',              'roleId',            'resources_roleId_fkey',                     'delivery_roles'),
    ('resources',              'practiceId',        'resources_practiceId_fkey',                 'practices'),
    ('resources',              'managerId',         'resources_managerId_fkey',                  'resources'),
    ('resources',              'rolePolicyId',      'resources_rolePolicyId_fkey',              'role_utilization_policies'),
    ('projects',               'practiceDirectorId','projects_practiceDirectorId_fkey',          'resources'),
    ('projects',               'deliveryManagerId', 'projects_deliveryManagerId_fkey',           'resources'),
    ('projects',               'projectManagerId',  'projects_projectManagerId_fkey',            'resources'),
    ('projects',               'practiceId',        'projects_practiceId_fkey',                  'practices'),
    ('projects',               'parentId',          'projects_parentId_fkey',                    'projects'),
    ('delivery_roles',         'practiceId',        'delivery_roles_practiceId_fkey',            'practices'),
    ('raid_entries',           'ownerId',           'raid_entries_ownerId_fkey',                 'resources'),
    ('financial_actuals',      'roleId',            'financial_actuals_roleId_fkey',             'delivery_roles'),
    ('steerco_decisions',      'decisionOwnerId',   'steerco_decisions_decisionOwnerId_fkey',    'resources'),
    ('activity_log_entries',   'projectId',         'activity_log_entries_projectId_fkey',       'projects'),
    ('audit_logs',             'projectId',         'audit_logs_projectId_fkey',                 'projects'),
    ('sso_group_mappings',     'practiceId',        'sso_group_mappings_practiceId_fkey',        'practices')
  ) AS t(child, col, oldname, parent)
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', r.child, r.oldname);
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', r.child,
      r.child || '_organizationId_' || r.col || '_fkey');
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("organizationId", %I) '
      || 'REFERENCES %I ("organizationId","id") ON DELETE SET NULL (%I) ON UPDATE CASCADE',
      r.child, r.child || '_organizationId_' || r.col || '_fkey', r.col, r.parent, r.col);
  END LOOP;
END $$;

-- ══ 3 — NOT NULL references → composite + ON DELETE CASCADE ════════════
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('weekly_assignment_slots', 'resourceId',        'weekly_assignment_slots_resourceId_fkey',   'resources'),
    ('timesheet_entries',       'resourceId',        'timesheet_entries_resourceId_fkey',         'resources'),
    ('project_contributors',    'resourceId',        'project_contributors_resourceId_fkey',       'resources'),
    ('effort_cells',            'roleId',            'effort_cells_roleId_fkey',                   'delivery_roles'),
    ('sso_group_mappings',      'identityProviderId','sso_group_mappings_identityProviderId_fkey', 'identity_providers')
  ) AS t(child, col, oldname, parent)
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', r.child, r.oldname);
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', r.child,
      r.child || '_organizationId_' || r.col || '_fkey');
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("organizationId", %I) '
      || 'REFERENCES %I ("organizationId","id") ON DELETE CASCADE ON UPDATE CASCADE',
      r.child, r.child || '_organizationId_' || r.col || '_fkey', r.col, r.parent);
  END LOOP;
END $$;
