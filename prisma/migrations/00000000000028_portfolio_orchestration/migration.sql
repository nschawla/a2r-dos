-- PS Orchestration & Decision Engine (v1.20.0)
-- Hand-authored (not a raw `prisma migrate diff`) — a live-DB diff also
-- proposed dropping and recreating ~15 unrelated pre-existing composite FK
-- constraints (a cosmetic ordering artifact of diffing from a live
-- database rather than replaying migration history), which is unnecessary
-- blast radius for what is otherwise a purely additive change. This file
-- contains only the actual delta: one new enum, two new columns, and one
-- new table with its own FKs/indexes.

-- CreateEnum
CREATE TYPE "ClientTier" AS ENUM ('STRATEGIC', 'STANDARD');

-- AlterTable: Project.clientTier — explicit account-strategic-weight flag,
-- default STANDARD so every existing row backfills safely.
ALTER TABLE "projects" ADD COLUMN "clientTier" "ClientTier" NOT NULL DEFAULT 'STANDARD';

-- AlterTable: GovernanceConfig.interventionApprovalThresholdUsd — tenant-
-- configurable $ threshold above which a Decision Card option requires
-- project:approve authority to execute.
ALTER TABLE "governance_configs" ADD COLUMN "interventionApprovalThresholdUsd" DECIMAL(14,2) NOT NULL DEFAULT 25000;

-- CreateTable
CREATE TABLE "portfolio_interventions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "driver" TEXT NOT NULL,
    "optionKey" TEXT NOT NULL,
    "optionLabel" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "domino" JSONB NOT NULL,
    "guardrailPassed" BOOLEAN NOT NULL,
    "guardrailNotes" TEXT NOT NULL,
    "financialImpactUsd" DECIMAL(14,2),
    "decidedById" TEXT,
    "decidedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolio_interventions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portfolio_interventions_projectId_idx" ON "portfolio_interventions"("projectId");

-- CreateIndex
CREATE INDEX "portfolio_interventions_organizationId_idx" ON "portfolio_interventions"("organizationId");

-- AddForeignKey
ALTER TABLE "portfolio_interventions" ADD CONSTRAINT "portfolio_interventions_organizationId_projectId_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "projects"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_interventions" ADD CONSTRAINT "portfolio_interventions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_interventions" ADD CONSTRAINT "portfolio_interventions_organizationId_decidedById_fkey" FOREIGN KEY ("organizationId", "decidedById") REFERENCES "resources"("organizationId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
