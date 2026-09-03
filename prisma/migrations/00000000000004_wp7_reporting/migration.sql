-- A2R Delivery OS — Work Package 7: Executive Reporting Hub, Flight Path
-- Variance & Decision Governance.
-- Hand-derived from prisma/schema.prisma for local verification (no npm
-- registry access in this sandbox — see 00000000000000_init's note).
-- Applied and verified against a real local Postgres instance. Regenerate
-- the authoritative migration history with `npx prisma migrate dev` the
-- first time this project is built somewhere with registry access.

-- ==================== STEERCO DECISION & ACTION TRACKER ====================
CREATE TYPE "SteerCoDecisionStatus" AS ENUM ('OPEN', 'RESOLVED');

CREATE TABLE "steerco_decisions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "decisionRequired" TEXT NOT NULL,
    "decisionOwnerId" TEXT,
    "resolutionTargetDate" TIMESTAMP(3),
    "status" "SteerCoDecisionStatus" NOT NULL DEFAULT 'OPEN',
    "resolutionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),

    CONSTRAINT "steerco_decisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "steerco_decisions_projectId_idx" ON "steerco_decisions"("projectId");

ALTER TABLE "steerco_decisions" ADD CONSTRAINT "steerco_decisions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "steerco_decisions" ADD CONSTRAINT "steerco_decisions_decisionOwnerId_fkey" FOREIGN KEY ("decisionOwnerId") REFERENCES "resources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
