-- PS-DOS — Read-Only External Integration Adapters (v1.18.0).
--
-- Three new tenant-owned tables: integration_connections (one row per
-- tenant per external provider — Jira/Asana/Monday/NetSuite/Certinia/
-- Kantata/OpenAir/Salesforce), integration_sync_runs (the audit trail
-- behind each pull attempt), and integration_errors (categorized,
-- human-readable failure log for the Ops Console dashboard).
--
-- Composite tenant FKs throughout (organizationId + parent id), matching
-- the WP1 closure pattern (migration 22) — every child row is pinned to
-- its own tenant at the database level, not just by convention.
--
-- Tenant-isolation RLS policies for the 3 new tables are appended at the
-- end of this file, extending migration 17's tenant_isolation policy
-- set (that migration itself is applied and frozen — new tenant tables
-- get their policy from whichever later migration introduces them).
-- tests/security/tenant-model-inventory.test.ts is updated in the same
-- commit to recognize this migration as a second valid source.

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('JIRA', 'ASANA', 'MONDAY', 'NETSUITE', 'CERTINIA', 'KANTATA', 'OPENAIR', 'SALESFORCE');

-- CreateEnum
CREATE TYPE "IntegrationConnectionStatus" AS ENUM ('NOT_CONFIGURED', 'CONNECTED', 'SYNCING', 'ERROR');

-- CreateEnum
CREATE TYPE "IntegrationSyncStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "IntegrationErrorCategory" AS ENUM ('AUTH_EXPIRED', 'RATE_LIMITED', 'NETWORK_TIMEOUT', 'SCHEMA_MISMATCH', 'UNKNOWN');

-- CreateTable
CREATE TABLE "integration_connections" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "IntegrationConnectionStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "config" JSONB NOT NULL DEFAULT '{}',
    "credentialCiphertext" TEXT,
    "credentialFingerprint" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" "IntegrationSyncStatus",
    "lastSyncRecordCount" INTEGER,
    "avgSyncDurationMs" INTEGER,
    "rateLimitRemaining" INTEGER,
    "rateLimitResetAt" TIMESTAMP(3),
    "syncIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_sync_runs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "IntegrationSyncStatus" NOT NULL,
    "recordsIngested" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "triggeredBy" TEXT NOT NULL,

    CONSTRAINT "integration_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_errors" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "syncRunId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "category" "IntegrationErrorCategory" NOT NULL,
    "humanMessage" TEXT NOT NULL,
    "rawDetail" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "integration_errors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "integration_connections_organizationId_idx" ON "integration_connections"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "integration_connections_organizationId_provider_key" ON "integration_connections"("organizationId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "integration_connections_organizationId_id_key" ON "integration_connections"("organizationId", "id");

-- CreateIndex
CREATE INDEX "integration_sync_runs_organizationId_idx" ON "integration_sync_runs"("organizationId");

-- CreateIndex
CREATE INDEX "integration_sync_runs_connectionId_startedAt_idx" ON "integration_sync_runs"("connectionId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "integration_sync_runs_organizationId_id_key" ON "integration_sync_runs"("organizationId", "id");

-- CreateIndex
CREATE INDEX "integration_errors_organizationId_idx" ON "integration_errors"("organizationId");

-- CreateIndex
CREATE INDEX "integration_errors_connectionId_occurredAt_idx" ON "integration_errors"("connectionId", "occurredAt");

-- AddForeignKey
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_sync_runs" ADD CONSTRAINT "integration_sync_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_sync_runs" ADD CONSTRAINT "integration_sync_runs_organizationId_connectionId_fkey" FOREIGN KEY ("organizationId", "connectionId") REFERENCES "integration_connections"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_errors" ADD CONSTRAINT "integration_errors_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_errors" ADD CONSTRAINT "integration_errors_organizationId_connectionId_fkey" FOREIGN KEY ("organizationId", "connectionId") REFERENCES "integration_connections"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ══ Tenant-isolation RLS — extends migration 17's policy set ══════════
-- Same shape as every other tenant table: a row is visible / writable to
-- the `a2r_app` runtime role iff its organizationId equals the
-- transaction's `app.current_org` GUC. Idempotent (DROP IF EXISTS first).
-- Inert until RLS_ENFORCE=1 + the a2r_app role exists on this database —
-- harmless to run before then (CREATE POLICY on a table with RLS not yet
-- enabled just defines the policy for later).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'integration_connections','integration_sync_runs','integration_errors'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    -- Supabase's default privileges auto-grant its own `anon`/`authenticated`
    -- roles on a new table (migration 07's baseline lockdown predates these
    -- tables, so it never touched them) — revoke explicitly, same as every
    -- other new table since (migrations 09, 13, 20).
    EXECUTE format('REVOKE ALL ON public.%I FROM "anon", "authenticated"', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I FOR ALL TO "a2r_app" '
      || 'USING ("organizationId" = current_setting(''app.current_org'', true)) '
      || 'WITH CHECK ("organizationId" = current_setting(''app.current_org'', true))', t);
  END LOOP;
END $$;
