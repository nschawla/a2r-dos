-- A2R Delivery OS — Enterprise Governance Architecture, Step 1:
-- the Hybrid Configuration Model (dual-layer + pre-built compliance
-- templates). Hand-derived from prisma/schema.prisma for local
-- verification (see 00000000000000_init's note); applied with
-- `npx prisma db push` against the live Postgres instance.

CREATE TYPE "GovernanceTemplate" AS ENUM ('STANDARD', 'STRICT_FINANCIAL', 'AGILE_DELIVERY', 'BOARD_ONLY', 'CUSTOM');

CREATE TABLE "governance_configs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "template" "GovernanceTemplate" NOT NULL DEFAULT 'STANDARD',
    "hiddenModules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maskFinancialsForDelivery" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),

    CONSTRAINT "governance_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "governance_configs_organizationId_key" ON "governance_configs"("organizationId");

ALTER TABLE "governance_configs" ADD CONSTRAINT "governance_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
