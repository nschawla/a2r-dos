-- A2R Delivery OS — Work Package 4: RBAC Scoped Portfolios.
-- Hand-derived from prisma/schema.prisma for local verification in an
-- environment where `prisma migrate dev` could not run (no npm registry
-- access) — see the note in 00000000000000_init/migration.sql. This was
-- applied and verified against a real local Postgres instance. Regenerate
-- the authoritative migration history with `npx prisma migrate dev` the
-- first time this project is built somewhere with registry access.

-- ==================== NEW ENUM ====================
CREATE TYPE "DeliveryAccessRole" AS ENUM (
  'ADMIN',
  'VP_EXECUTIVE',
  'PRACTICE_DIRECTOR',
  'DELIVERY_MANAGER',
  'PROJECT_MANAGER'
);

-- ==================== MEMBERSHIP: real RBAC tier ====================
-- Nullable — existing memberships keep working with no backfill;
-- src/lib/auth/rbac.ts#resolveDeliveryRole() supplies a default derived
-- from MembershipRole when this is unset.
ALTER TABLE "memberships" ADD COLUMN "deliveryRole" "DeliveryAccessRole";

-- ==================== RESOURCE: login link + reporting line ====================
ALTER TABLE "resources" ADD COLUMN "userId" TEXT REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "resources" ADD COLUMN "managerId" TEXT REFERENCES "resources"("id") ON DELETE SET NULL;

-- At most one Resource per (org, user) — a person is one roster entry per
-- tenant, though the same User can be a different Resource in another org.
-- NULLs (resources with no linked login) are unconstrained by this index,
-- per standard SQL NULL-distinctness in unique indexes.
CREATE UNIQUE INDEX "resources_organizationId_userId_key" ON "resources"("organizationId", "userId");
CREATE INDEX "resources_managerId_idx" ON "resources"("managerId");

-- ==================== PROJECT: home practice ====================
ALTER TABLE "projects" ADD COLUMN "practiceId" TEXT REFERENCES "practices"("id") ON DELETE SET NULL;
CREATE INDEX "projects_practiceId_idx" ON "projects"("practiceId");

-- ==================== PROJECT CONTRIBUTORS (explicit, non-PD/DM/PM-of-record) ====================
CREATE TABLE "project_contributors" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "resourceId" TEXT NOT NULL REFERENCES "resources"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  UNIQUE ("projectId", "resourceId")
);
CREATE INDEX "project_contributors_resourceId_idx" ON "project_contributors"("resourceId");
