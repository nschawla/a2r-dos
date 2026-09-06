-- A2R Delivery OS — P1: Just-In-Time (JIT) staff privilege elevation.
--
-- BEFORE
-- ──────────────────────────────────────────────────────────────────────
--   A live `staff_grants` row = permanent standing /ops access. An
--   operator could provision / impersonate / export / purge / rewrite
--   identity federation at any time, no per-action ceremony.
--
-- AFTER
-- ──────────────────────────────────────────────────────────────────────
--   `staff_grants` is now only *eligibility*. Every mutating /ops action
--   requires a live `staff_elevations` row — requested with a reason,
--   bound to the operator's session (userId + httpOnly a2r_ops_elevation
--   cookie), auto-expiring after a strict TTL (default 30 min, ≤ 60).
--   The rows are the audit trail (src/lib/ops/staff-elevation.ts).
--
-- Hand-derived (see 00000000000000_init). Apply with:
--   npx prisma db execute --file prisma/migrations/00000000000013_jit_staff_elevation/migration.sql --schema prisma/schema.prisma
--   npx prisma generate
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "staff_elevations" (
  "id"              TEXT PRIMARY KEY,
  "userId"          TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token"           TEXT NOT NULL,
  "reason"          TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT now(),
  "expiresAt"       TIMESTAMP(3) NOT NULL,
  "endedAt"         TIMESTAMP(3),
  "endedReason"     TEXT,
  "requestedFromIp" TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS "staff_elevations_token_key"
  ON "staff_elevations" ("token");

CREATE INDEX IF NOT EXISTS "staff_elevations_userId_expiresAt_idx"
  ON "staff_elevations" ("userId", "expiresAt");

-- Match the RLS posture of 00000000000007_rls_lockdown / staff_grants:
-- enable RLS (deny-all for non-owner, non-BYPASSRLS roles — Prisma's
-- `postgres` role is unaffected) and revoke the web-exposed Supabase roles.
ALTER TABLE "staff_elevations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "staff_elevations" FROM "anon", "authenticated";
