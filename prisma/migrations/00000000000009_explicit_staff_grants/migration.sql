-- A2R Delivery OS — P0 #2: replace implicit A2R-staff authorization with
-- explicit, auditable grants.
--
-- BEFORE
-- ──────────────────────────────────────────────────────────────────────
--   An account could reach the internal /ops Operator Control Plane if
--   EITHER `users.isA2rStaff` was true OR its email ended in
--   `@a2rventures.com` (the wildcard in src/lib/ops/staff.ts). A single
--   compromised corporate inbox therefore meant fleet-wide access to
--   every tenant's data.
--
-- AFTER
-- ──────────────────────────────────────────────────────────────────────
--   Staff access is one explicit row in `staff_grants`, tied to a
--   specific user id, attributed to the operator who granted it, with a
--   reason and a soft-revoke. No email-domain path exists any more. An
--   account is staff iff it holds a `staff_grants` row with
--   `revokedAt` IS NULL. The NextAuth jwt callback resolves that into the
--   session each request; src/lib/ops-auth.ts re-checks the table on every
--   /ops render and action.
--
-- Data-preserving: every current `isA2rStaff = true` account is migrated
-- to a grant row BEFORE the column is dropped, so no operator loses access.
--
-- Hand-derived (see 00000000000000_init). Apply with:
--   npx prisma db execute --file prisma/migrations/00000000000009_explicit_staff_grants/migration.sql --schema prisma/schema.prisma
--   npx prisma generate
-- ──────────────────────────────────────────────────────────────────────

-- 1. The grant table.
CREATE TABLE IF NOT EXISTS "staff_grants" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "grantedByUserId" TEXT,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "revokedAt" TIMESTAMP(3),
  "revokedByUserId" TEXT
);

CREATE INDEX IF NOT EXISTS "staff_grants_userId_revokedAt_idx"
  ON "staff_grants" ("userId", "revokedAt");

-- 2. Match the RLS posture set by 00000000000007_rls_lockdown: enable RLS
--    (deny-all for non-owner / non-BYPASSRLS roles — Prisma's `postgres`
--    role is unaffected) and revoke the web-exposed Supabase roles.
ALTER TABLE "staff_grants" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "staff_grants" FROM "anon", "authenticated";

-- 3. Preserve existing staff. cuid-shaped ids are generated in the app;
--    a migrated row just needs a unique text id, so a prefixed uuid is fine.
INSERT INTO "staff_grants" ("id", "userId", "reason", "createdAt")
SELECT
  'sg_mig_' || replace(gen_random_uuid()::text, '-', ''),
  "id",
  'Migrated from users.isA2rStaff at the P0 #2 explicit-grant cutover',
  now()
FROM "users"
WHERE "isA2rStaff" = true
  AND NOT EXISTS (
    SELECT 1 FROM "staff_grants" g
    WHERE g."userId" = "users"."id" AND g."revokedAt" IS NULL
  );

-- 4. Drop the wildcard-era column.
ALTER TABLE "users" DROP COLUMN IF EXISTS "isA2rStaff";
