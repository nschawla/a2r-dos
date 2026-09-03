-- A2R Delivery OS — Enterprise Identity & Governance, Step 2:
-- Enterprise SSO / identity federation (SAML + OIDC), per-tenant IdP
-- configuration, security-group -> role mappings, and JIT provisioning
-- provenance on Membership. Hand-derived from prisma/schema.prisma (see
-- 00000000000000_init's note); applied with `npx prisma db push`.

CREATE TYPE "IdpProtocol" AS ENUM ('SAML', 'OIDC');
CREATE TYPE "IdpVendor" AS ENUM ('AZURE_AD', 'OKTA', 'GOOGLE_WORKSPACE', 'GENERIC');
CREATE TYPE "ProvisioningSource" AS ENUM ('MANUAL', 'SSO_JIT');

ALTER TABLE "memberships"
  ADD COLUMN "provisionedVia" "ProvisioningSource" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "lastJitSyncAt" TIMESTAMP(3);

CREATE TABLE "identity_providers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "protocol" "IdpProtocol" NOT NULL,
    "vendor" "IdpVendor" NOT NULL DEFAULT 'GENERIC',
    "displayName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "enforced" BOOLEAN NOT NULL DEFAULT false,
    "emailDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "jitEnabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultDeliveryRole" "DeliveryAccessRole" NOT NULL DEFAULT 'PROJECT_MANAGER',
    "defaultMembershipRole" "MembershipRole" NOT NULL DEFAULT 'MEMBER',
    "samlEntityId" TEXT,
    "samlSsoUrl" TEXT,
    "samlCertificate" TEXT,
    "oidcIssuer" TEXT,
    "oidcClientId" TEXT,
    "oidcClientSecretCiphertext" TEXT,
    "oidcDiscoveryUrl" TEXT,
    "oidcAuthEndpoint" TEXT,
    "oidcTokenEndpoint" TEXT,
    "oidcJwksUri" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "metadataFingerprint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),

    CONSTRAINT "identity_providers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "identity_providers_organizationId_key" ON "identity_providers"("organizationId");

CREATE TABLE "sso_group_mappings" (
    "id" TEXT NOT NULL,
    "identityProviderId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "claimValue" TEXT NOT NULL,
    "deliveryRole" "DeliveryAccessRole" NOT NULL,
    "membershipRole" "MembershipRole" NOT NULL DEFAULT 'MEMBER',
    "practiceId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sso_group_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sso_group_mappings_identityProviderId_claimValue_key" ON "sso_group_mappings"("identityProviderId", "claimValue");
CREATE INDEX "sso_group_mappings_organizationId_idx" ON "sso_group_mappings"("organizationId");

ALTER TABLE "identity_providers" ADD CONSTRAINT "identity_providers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sso_group_mappings" ADD CONSTRAINT "sso_group_mappings_identityProviderId_fkey" FOREIGN KEY ("identityProviderId") REFERENCES "identity_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
