-- A2R Delivery OS — preserve security & operator-access history on delete.
--
-- BEFORE
-- ──────────────────────────────────────────────────────────────────────
--   staff_grants.userId          → users(id)          ON DELETE CASCADE
--   staff_elevations.userId      → users(id)          ON DELETE CASCADE
--   impersonation_grants.orgId   → organizations(id)  ON DELETE CASCADE
--
--   A raw `DELETE FROM users …` silently wiped that operator's entire
--   entitlement + JIT-elevation history; a raw org DELETE wiped the
--   operator → tenant impersonation record.
--
-- AFTER
-- ──────────────────────────────────────────────────────────────────────
--   All three become ON DELETE RESTRICT — mirroring the CMP-1 RESTRICT
--   already on audit_logs / activity_log_entries / immutable_audit_ledger.
--   These rows ARE the security-audit trail and must outlive the principal
--   they describe. Normal lifecycle is unaffected: staff access is
--   soft-revoked (staff_grants.revokedAt), elevations soft-end
--   (staff_elevations.endedAt), and tenant offboarding is the soft Purge
--   Protocol (organizations.purgedAt) — none of which delete rows. GDPR
--   erasure for an operator is an in-place anonymise of the users row, not
--   a hard delete.
--
--   The retention sweep (src/server/services/data-retention.ts) also stops
--   deleting ended impersonation_grants — operator-access history is now
--   retained indefinitely, with the immutable_audit_ledger
--   ADMIN_IMPERSONATION_ACCESS entry as the permanent, tamper-evident record.
--
-- Hand-derived. Apply with:
--   npx prisma db execute --file prisma/migrations/00000000000019_preserve_security_history/migration.sql --schema prisma/schema.prisma
--   npx prisma generate
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE "staff_grants" DROP CONSTRAINT IF EXISTS "staff_grants_userId_fkey";
ALTER TABLE "staff_grants" ADD CONSTRAINT "staff_grants_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "staff_elevations" DROP CONSTRAINT IF EXISTS "staff_elevations_userId_fkey";
ALTER TABLE "staff_elevations" ADD CONSTRAINT "staff_elevations_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "impersonation_grants" DROP CONSTRAINT IF EXISTS "impersonation_grants_organizationId_fkey";
ALTER TABLE "impersonation_grants" ADD CONSTRAINT "impersonation_grants_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
