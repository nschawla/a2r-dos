-- A2R Delivery OS — force a password change on first sign-in for accounts
-- whose password was set by someone other than the user (an
-- operator-provisioned tenant admin who received a temp password).
--
-- Additive, nullable-with-default → existing rows get `false` (no forced
-- change for anyone already using the product). Enforced in
-- src/middleware.ts; cleared by changePasswordAction (src/server/actions/
-- auth.ts). Hand-derived (see 00000000000000_init) and applied with
-- `npx prisma db push`.

ALTER TABLE "users" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
