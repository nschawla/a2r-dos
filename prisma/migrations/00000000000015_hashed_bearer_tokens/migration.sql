-- A2R Delivery OS — P0-5: hashed bearer tokens (staff elevation + impersonation).
--
-- BEFORE
-- ──────────────────────────────────────────────────────────────────────
--   "staff_elevations"."token" and "impersonation_grants"."token" stored
--   the opaque bearer secret in PLAINTEXT. Any read of the row — a
--   mis-scoped query, a leaked backup, a `SELECT` by an over-privileged
--   role — yielded a token usable to impersonate the operator's elevation
--   or a tenant session for the rest of its (≤ 60 min) window.
--
-- AFTER
-- ──────────────────────────────────────────────────────────────────────
--   The column holds ONLY sha256(secret) as hex ("tokenHash"). The
--   plaintext lives solely in the Set-Cookie response + the browser jar;
--   `resolveActiveElevation` / `resolveImpersonation` look the row up by
--   hashToken(cookieValue) (src/lib/crypto/bearer-token.ts). Matches the
--   long-standing "ApiKey.hashedKey" pattern.
--
-- MIGRATION STRATEGY — no backfill (approved). Existing rows' plaintext is
-- rewritten to a sentinel that can never equal a real sha256 hex digest,
-- so every in-flight cookie stops resolving on deploy; live rows are also
-- marked ended so the /ops history reads cleanly. Operators re-request an
-- elevation once (the windows are ≤ 60 min regardless).
--
-- Hand-derived (see 00000000000000_init). Apply with:
--   npx prisma db execute --file prisma/migrations/00000000000015_hashed_bearer_tokens/migration.sql --schema prisma/schema.prisma
--   npx prisma generate
-- ──────────────────────────────────────────────────────────────────────

-- ── staff_elevations ─────────────────────────────────────────────────
ALTER TABLE "staff_elevations" ADD COLUMN IF NOT EXISTS "tokenHash" TEXT;
UPDATE "staff_elevations"
  SET "tokenHash" = 'stale:' || "id",
      "endedAt"   = COALESCE("endedAt", now()),
      "endedReason" = COALESCE("endedReason", 'expired-sweep')
  WHERE "tokenHash" IS NULL;
ALTER TABLE "staff_elevations" ALTER COLUMN "tokenHash" SET NOT NULL;
ALTER TABLE "staff_elevations" DROP COLUMN IF EXISTS "token";
DROP INDEX IF EXISTS "staff_elevations_token_key";
CREATE UNIQUE INDEX IF NOT EXISTS "staff_elevations_tokenHash_key" ON "staff_elevations" ("tokenHash");

-- ── impersonation_grants ─────────────────────────────────────────────
ALTER TABLE "impersonation_grants" ADD COLUMN IF NOT EXISTS "tokenHash" TEXT;
UPDATE "impersonation_grants"
  SET "tokenHash" = 'stale:' || "id",
      "endedAt"   = COALESCE("endedAt", now())
  WHERE "tokenHash" IS NULL;
ALTER TABLE "impersonation_grants" ALTER COLUMN "tokenHash" SET NOT NULL;
ALTER TABLE "impersonation_grants" DROP COLUMN IF EXISTS "token";
DROP INDEX IF EXISTS "impersonation_grants_token_key";
CREATE UNIQUE INDEX IF NOT EXISTS "impersonation_grants_tokenHash_key" ON "impersonation_grants" ("tokenHash");
