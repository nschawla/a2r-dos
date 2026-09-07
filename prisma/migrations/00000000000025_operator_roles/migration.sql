-- A2R Delivery OS — v1.16.0: A2R organizational roles.
--
-- ══ Applied to STAGING and PRODUCTION. ════════════════════════════════════
-- New enum + one additive column (defaulted) + one enum value. Idempotent.
-- Run via DIRECT_URL (:5432), never the transaction pooler (:6543).
-- ═════════════════════════════════════════════════════════════════════════
--
-- WHY
-- ──────────────────────────────────────────────────────────────────────
-- Operator (`/ops`) access was binary — a `staff_grants` row or nothing.
-- v1.16.0 layers a single role onto each grant (`OperatorRole`), with a
-- capability matrix in src/lib/ops/operator-roles.ts and per-route guards
-- in src/lib/ops-auth.ts + src/middleware.ts. Every existing grant migrates
-- to SUPER_ADMIN, so current operators keep full access unchanged.
--
-- `DeliveryAccessRole` also gains VIEWER — a strict read-only tenant tier
-- (`MembershipRole.VIEWER` resolves to it) for guest / observer memberships.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OperatorRole') THEN
    CREATE TYPE "OperatorRole" AS ENUM (
      'SUPER_ADMIN', 'PROVISIONING', 'SUPPORT', 'AUDITOR', 'BILLING', 'VIEWER'
    );
  END IF;
END $$;

ALTER TABLE "staff_grants"
  ADD COLUMN IF NOT EXISTS "role" "OperatorRole" NOT NULL DEFAULT 'SUPER_ADMIN';

ALTER TYPE "DeliveryAccessRole" ADD VALUE IF NOT EXISTS 'VIEWER';
