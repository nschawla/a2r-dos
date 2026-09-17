-- PS-DOS — Enterprise SAML SSO live handshake (v1.19.0).
--
-- Two new tenant-owned tables supporting the live IdP handshake (the
-- follow-on flagged in migration 06 / the v1.2.0 identity-federation
-- feature): saml_auth_requests (replay-protection cache backing the
-- node-saml CacheProvider — see src/lib/identity/saml-cache-provider.ts)
-- and sso_login_errors (categorized, human-readable federated sign-in
-- failure log for the Ops Console, same shape as migration 26's
-- integration_errors).
--
-- Simple FKs only (organizationId -> organizations.id) — neither table is
-- the parent of a composite-keyed child, so no @@unique([organizationId, id])
-- is needed on either, matching the integration_connections /
-- integration_sync_runs / integration_errors precedent.
--
-- Tenant-isolation RLS policies for the 2 new tables are appended at the
-- end of this file, extending migration 17's tenant_isolation policy set
-- (that migration is applied and frozen — new tenant tables get their
-- policy from whichever later migration introduces them, same as
-- migration 26). tests/security/tenant-model-inventory.test.ts is updated
-- in the same commit to recognize this migration as a third valid source.

-- CreateEnum
CREATE TYPE "SsoErrorCategory" AS ENUM ('INVALID_SIGNATURE', 'EXPIRED_ASSERTION', 'REPLAY_DETECTED', 'ISSUER_MISMATCH', 'NO_IDP_CONFIGURED', 'IDP_DISABLED', 'MAPPING_DENIED', 'MALFORMED_RESPONSE', 'UNKNOWN');

-- CreateTable
CREATE TABLE "saml_auth_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saml_auth_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sso_login_errors" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "category" "SsoErrorCategory" NOT NULL,
    "humanMessage" TEXT NOT NULL,
    "rawDetail" TEXT,
    "emailAttempted" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "sso_login_errors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "saml_auth_requests_requestId_key" ON "saml_auth_requests"("requestId");

-- CreateIndex
CREATE INDEX "saml_auth_requests_organizationId_idx" ON "saml_auth_requests"("organizationId");

-- CreateIndex
CREATE INDEX "saml_auth_requests_expiresAt_idx" ON "saml_auth_requests"("expiresAt");

-- CreateIndex
CREATE INDEX "sso_login_errors_organizationId_occurredAt_idx" ON "sso_login_errors"("organizationId", "occurredAt");

-- AddForeignKey
ALTER TABLE "saml_auth_requests" ADD CONSTRAINT "saml_auth_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sso_login_errors" ADD CONSTRAINT "sso_login_errors_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
    'saml_auth_requests','sso_login_errors'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    -- Supabase's default privileges auto-grant its own `anon`/`authenticated`
    -- roles on a new table (migration 07's baseline lockdown predates these
    -- tables, so it never touched them) — revoke explicitly, same as every
    -- other new table since (migrations 09, 13, 20, 26).
    EXECUTE format('REVOKE ALL ON public.%I FROM "anon", "authenticated"', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I FOR ALL TO "a2r_app" '
      || 'USING ("organizationId" = current_setting(''app.current_org'', true)) '
      || 'WITH CHECK ("organizationId" = current_setting(''app.current_org'', true))', t);
  END LOOP;
END $$;
