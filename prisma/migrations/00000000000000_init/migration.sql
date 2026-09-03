-- A2R Delivery OS — Phase 3 initial schema.
-- Hand-derived from prisma/schema.prisma for local verification in an
-- environment where `prisma migrate dev` could not run (no npm registry
-- access). Regenerate the authoritative migration with
-- `npx prisma migrate dev --name init` the first time this project is
-- built somewhere with package-registry access — that run will supersede
-- this file with Prisma's own generated SQL and history metadata.

-- ==================== ENUMS ====================
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');
CREATE TYPE "Methodology" AS ENUM ('WATERFALL', 'AGILE', 'HYBRID');
CREATE TYPE "CommercialModel" AS ENUM ('FF', 'TM');
CREATE TYPE "GovProfile" AS ENUM ('STANDARD', 'MARQUEE');
CREATE TYPE "EstimationMode" AS ENUM ('MATRIX', 'DIRECT');
CREATE TYPE "HierarchyLevel" AS ENUM ('STANDALONE', 'PARENT', 'CHILD');
CREATE TYPE "ScopeComplexity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "AuditStatus" AS ENUM ('YES', 'PARTIAL', 'NO', 'NA');
CREATE TYPE "RaidType" AS ENUM ('RISK', 'ASSUMPTION', 'ISSUE', 'DEPENDENCY');
CREATE TYPE "RaidSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MED', 'LOW');
CREATE TYPE "RaidStatus" AS ENUM ('OPEN', 'INPROGRESS', 'CLOSED');
CREATE TYPE "ScheduleStatus" AS ENUM ('NOTSTARTED', 'INPROGRESS', 'COMPLETE', 'DELAYED');

-- ==================== AUTH / TENANCY ====================
CREATE TABLE "users" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" TIMESTAMP(3),
  "image" TEXT,
  "passwordHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE TABLE "accounts" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "refresh_token" TEXT,
  "access_token" TEXT,
  "expires_at" INTEGER,
  "token_type" TEXT,
  "scope" TEXT,
  "id_token" TEXT,
  "session_state" TEXT,
  UNIQUE ("provider", "providerAccountId")
);

CREATE TABLE "sessions" (
  "id" TEXT PRIMARY KEY,
  "sessionToken" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "expires" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "verification_tokens" (
  "identifier" TEXT NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "expires" TIMESTAMP(3) NOT NULL,
  UNIQUE ("identifier", "token")
);

CREATE TABLE "organizations" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE TABLE "memberships" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "organizationId" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "role" "MembershipRole" NOT NULL DEFAULT 'MEMBER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  UNIQUE ("userId", "organizationId")
);
CREATE INDEX "memberships_organizationId_idx" ON "memberships"("organizationId");

-- ==================== MODULE 0 — ADMIN & ORG SETUP ====================
CREATE TABLE "org_policies" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL UNIQUE REFERENCES "organizations"("id") ON DELETE CASCADE,
  "slipWarnDays" INTEGER NOT NULL DEFAULT 5,
  "slipCritDays" INTEGER NOT NULL DEFAULT 15,
  "marginCritPct" DOUBLE PRECISION NOT NULL DEFAULT 5,
  "methodology" "Methodology" NOT NULL DEFAULT 'WATERFALL',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE TABLE "control_labels" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "controlKey" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  UNIQUE ("organizationId", "controlKey")
);

CREATE TABLE "practices" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX "practices_organizationId_idx" ON "practices"("organizationId");

CREATE TABLE "delivery_roles" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "billRate" DOUBLE PRECISION NOT NULL,
  "costRate" DOUBLE PRECISION NOT NULL,
  "practiceId" TEXT REFERENCES "practices"("id") ON DELETE SET NULL
);
CREATE INDEX "delivery_roles_organizationId_idx" ON "delivery_roles"("organizationId");

CREATE TABLE "resources" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "roleId" TEXT REFERENCES "delivery_roles"("id") ON DELETE SET NULL,
  "practiceId" TEXT REFERENCES "practices"("id") ON DELETE SET NULL
);
CREATE INDEX "resources_organizationId_idx" ON "resources"("organizationId");

-- ==================== MODULE 1 — DEAL CRAFTING & SIZING ====================
CREATE TABLE "projects" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "client" TEXT,
  "externalId" TEXT,
  "commercialModel" "CommercialModel" NOT NULL DEFAULT 'FF',
  "methodology" "Methodology" NOT NULL DEFAULT 'WATERFALL',
  "govProfile" "GovProfile" NOT NULL DEFAULT 'STANDARD',
  "estimationMode" "EstimationMode" NOT NULL DEFAULT 'MATRIX',
  "contingencyPct" DOUBLE PRECISION NOT NULL DEFAULT 12,
  "practiceDirectorId" TEXT REFERENCES "resources"("id") ON DELETE SET NULL,
  "deliveryManagerId" TEXT REFERENCES "resources"("id") ON DELETE SET NULL,
  "projectManagerId" TEXT REFERENCES "resources"("id") ON DELETE SET NULL,
  "hierarchyLevel" "HierarchyLevel" NOT NULL DEFAULT 'STANDALONE',
  "parentId" TEXT REFERENCES "projects"("id") ON DELETE SET NULL,
  "waveTag" TEXT,
  "locked" BOOLEAN NOT NULL DEFAULT false,
  "lockedAt" TIMESTAMP(3),
  "baselineSnapshot" JSONB,
  "directIntakeSoldHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "directIntakeTargetRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "directIntakeBlendedMarginPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "narrativeAccomplishments" TEXT,
  "narrativeBlockers" TEXT,
  "narrativePriorities" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX "projects_organizationId_idx" ON "projects"("organizationId");
CREATE INDEX "projects_parentId_idx" ON "projects"("parentId");

CREATE TABLE "scope_items" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "included" BOOLEAN NOT NULL DEFAULT true,
  "complexity" "ScopeComplexity" NOT NULL DEFAULT 'MEDIUM',
  "notes" TEXT,
  "custom" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX "scope_items_projectId_idx" ON "scope_items"("projectId");

CREATE TABLE "effort_cells" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "phaseKey" TEXT NOT NULL,
  "roleId" TEXT NOT NULL REFERENCES "delivery_roles"("id") ON DELETE CASCADE,
  "hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
  UNIQUE ("projectId", "phaseKey", "roleId")
);
CREATE INDEX "effort_cells_projectId_idx" ON "effort_cells"("projectId");

-- ==================== MODULE 2 — 10 CONTROLS AUDIT ====================
CREATE TABLE "audit_entries" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "controlKey" TEXT NOT NULL,
  "status" "AuditStatus" NOT NULL DEFAULT 'NO',
  "owner" TEXT,
  "repoLink" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  UNIQUE ("projectId", "controlKey")
);
CREATE INDEX "audit_entries_projectId_idx" ON "audit_entries"("projectId");

-- ==================== MODULE 3 — RAID COCKPIT ====================
CREATE TABLE "raid_entries" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "type" "RaidType" NOT NULL,
  "description" TEXT NOT NULL,
  "severity" "RaidSeverity" NOT NULL DEFAULT 'MED',
  "ownerId" TEXT REFERENCES "resources"("id") ON DELETE SET NULL,
  "targetDate" TIMESTAMP(3),
  "status" "RaidStatus" NOT NULL DEFAULT 'OPEN',
  "escalate" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX "raid_entries_projectId_idx" ON "raid_entries"("projectId");

-- ==================== MODULE 4 — FINANCIAL REALIZATION (EAC) ====================
CREATE TABLE "financial_actuals" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "roleKey" TEXT NOT NULL,
  "roleId" TEXT REFERENCES "delivery_roles"("id") ON DELETE SET NULL,
  "hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "forecastHours" DOUBLE PRECISION,
  "openRRHours" DOUBLE PRECISION,
  UNIQUE ("projectId", "roleKey")
);
CREATE INDEX "financial_actuals_projectId_idx" ON "financial_actuals"("projectId");

-- ==================== MODULE 5 — SCHEDULE & BURNDOWN ====================
CREATE TABLE "schedule_phases" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "phaseKey" TEXT NOT NULL,
  "plannedStart" TIMESTAMP(3),
  "plannedEnd" TIMESTAMP(3),
  "actualStart" TIMESTAMP(3),
  "actualEnd" TIMESTAMP(3),
  "pctComplete" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" "ScheduleStatus" NOT NULL DEFAULT 'NOTSTARTED',
  UNIQUE ("projectId", "phaseKey")
);
CREATE INDEX "schedule_phases_projectId_idx" ON "schedule_phases"("projectId");

-- ==================== ACTIVITY LOG ====================
CREATE TABLE "activity_log_entries" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "projectId" TEXT REFERENCES "projects"("id") ON DELETE SET NULL,
  "userId" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "text" TEXT NOT NULL,
  "tab" TEXT NOT NULL DEFAULT 'home',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX "activity_log_entries_organizationId_createdAt_idx" ON "activity_log_entries"("organizationId", "createdAt");
