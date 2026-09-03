-- A2R Delivery OS — Work Package 6: Data Pipelines, Audit Trails,
-- Contractor Tagging & Governance Integrity.
-- Hand-derived from prisma/schema.prisma for local verification (no npm
-- registry access in this sandbox — see 00000000000000_init's note).
-- Applied and verified against a real local Postgres instance. Regenerate
-- the authoritative migration history with `npx prisma migrate dev` the
-- first time this project is built somewhere with registry access.

-- ==================== DELIVERY ROLE: FTE vs Contractor ====================
CREATE TYPE "ResourceEmploymentType" AS ENUM ('FTE', 'CONTRACTOR');

ALTER TABLE "delivery_roles" ADD COLUMN "employmentType" "ResourceEmploymentType" NOT NULL DEFAULT 'FTE';

-- ==================== AUDIT LOG (immutable governance trail) ====================
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "previousState" JSONB,
    "newState" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON "audit_logs"("organizationId", "createdAt");
CREATE INDEX "audit_logs_projectId_createdAt_idx" ON "audit_logs"("projectId", "createdAt");

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
