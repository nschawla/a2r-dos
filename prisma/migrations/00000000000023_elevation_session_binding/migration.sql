-- A2R Delivery OS — WP2 (v1.14.0): JIT staff-elevation step-up + session binding.
--
-- ══ Applied to STAGING and PRODUCTION. ════════════════════════════════════
-- Trivial additive columns. Idempotent. Run via DIRECT_URL (:5432).
-- ═════════════════════════════════════════════════════════════════════════
--
-- WHY
-- ──────────────────────────────────────────────────────────────────────
-- Obtaining a JIT elevation now requires a fresh password verification, and
-- the elevation row is bound to the `users.sessionVersion` epoch it was
-- minted under. `src/lib/ops-auth.ts` rejects an elevation whose epoch no
-- longer matches the live session — so a password change or
-- sign-out-everywhere invalidates every elevation for that operator
-- immediately, on every serverless instance.
--
-- `sessionVersion` defaults to 0 so pre-existing rows (which are minutes
-- from expiry anyway) simply fail the epoch check on their next use and the
-- operator re-elevates.

ALTER TABLE "staff_elevations"
  ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "reauthAt" TIMESTAMP(3);
