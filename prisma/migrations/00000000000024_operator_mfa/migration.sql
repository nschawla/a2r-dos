-- A2R Delivery OS — Batch 2: mandatory operator second factor (TOTP) for
-- JIT privilege elevation.
--
-- ══ Applied to STAGING and PRODUCTION. ════════════════════════════════════
-- New platform table + one additive column. Idempotent. Run via DIRECT_URL
-- (:5432), never the transaction pooler (:6543).
-- ═════════════════════════════════════════════════════════════════════════
--
-- WHY
-- ──────────────────────────────────────────────────────────────────────
-- Elevation previously required only a password re-check (AAL1). It now
-- additionally requires an **activated** `operator_mfa` row and a valid
-- RFC 6238 TOTP (or single-use recovery) code. The TOTP secret is stored
-- AES-256-GCM encrypted (`secretCiphertext`) — it cannot be hashed because
-- verification needs the original. `lastStepCounter` is the anti-replay
-- high-water mark. `activatedAt` stays null until the operator confirms one
-- live code, so a half-finished enrollment does not satisfy the requirement.
--
-- ROLLOUT: hard cut-over. An operator with no activated row cannot elevate
-- until they enroll at /ops/security (self-service — standing grant + a
-- fresh password re-check, no elevation needed). Break-glass:
-- `npm run ops:mfa:reset -- <email>` (direct DB access, like the bootstrap
-- staff grant).

CREATE TABLE IF NOT EXISTS "operator_mfa" (
  "id"                      TEXT NOT NULL,
  "userId"                  TEXT NOT NULL,
  "secretCiphertext"        TEXT,
  "pendingSecretCiphertext" TEXT,
  "activatedAt"             TIMESTAMP(3),
  "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt"              TIMESTAMP(3),
  "lastStepCounter"         BIGINT,
  "recoveryCodeHashes"      JSONB,
  CONSTRAINT "operator_mfa_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "operator_mfa_userId_key" ON "operator_mfa"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'operator_mfa_userId_fkey'
  ) THEN
    ALTER TABLE "operator_mfa"
      ADD CONSTRAINT "operator_mfa_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "staff_elevations"
  ADD COLUMN IF NOT EXISTS "secondFactorAt" TIMESTAMP(3);
