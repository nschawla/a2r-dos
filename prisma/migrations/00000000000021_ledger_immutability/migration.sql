-- A2R Delivery OS — WP1 (v1.13.0): engine-level immutability for the compliance ledger.
--
-- ══ Applied to STAGING and PRODUCTION. ════════════════════════════════════
-- Run via the session pooler / DIRECT_URL (:5432). Idempotent.
-- See docs/SECURITY.md §4 and docs/RLS_ENFORCEMENT_RUNBOOK.md.
-- ═════════════════════════════════════════════════════════════════════════
--
-- WHY
-- ──────────────────────────────────────────────────────────────────────
-- Before this, `immutable_audit_ledger` was immutable *by convention*: no
-- application code path issues an UPDATE/DELETE (verified by grep), but the
-- restricted `a2r_app` role still held `UPDATE`/`DELETE` (migration 16
-- granted them on ALL tables) and nothing at the engine rejected a row
-- edit. An auditor wants a hard stop.
--
-- WHAT
-- ──────────────────────────────────────────────────────────────────────
--  1. `a2r_app` keeps SELECT + INSERT on the ledger, loses UPDATE + DELETE.
--  2. A BEFORE UPDATE/DELETE/TRUNCATE trigger rejects the operation for
--     EVERY role. The only bypass is a deliberate, greppable, transaction-
--     local opt-in — `SET LOCAL "a2r.ledger_admin" = 'on'` — for lawful
--     GDPR/CCPA data-subject erasure and the tamper-detection test. The
--     `a2r_app` role can never bypass (no grant + the `current_user` guard).
--  3. Drops the v1.12.0 `_rls_control` global break-glass table — the
--     break-glass mechanism is removed in WP1 (the incident lever is now
--     the `RLS_ENFORCE` env var + redeploy; see the runbook).
--
-- The hash chain (currentHash / previousHash, verifyLedgerIntegrity) is
-- unchanged; this is an independent, engine-level second lock.
--
-- ROLLBACK
-- ──────────────────────────────────────────────────────────────────────
--   DROP TRIGGER IF EXISTS trg_ledger_no_mutate   ON "immutable_audit_ledger";
--   DROP TRIGGER IF EXISTS trg_ledger_no_truncate ON "immutable_audit_ledger";
--   DROP FUNCTION IF EXISTS _a2r_reject_ledger_mutation();
--   DROP FUNCTION IF EXISTS _a2r_reject_ledger_truncate();
--   GRANT UPDATE, DELETE ON "immutable_audit_ledger" TO "a2r_app";
-- ──────────────────────────────────────────────────────────────────────

-- ══ 1 — a2r_app: SELECT + INSERT only ═══════════════════════════════════
REVOKE UPDATE, DELETE ON "immutable_audit_ledger" FROM "a2r_app";

-- ══ 2 — engine-level rejection of row mutation / truncation ═════════════
CREATE OR REPLACE FUNCTION _a2r_reject_ledger_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- deliberate, transaction-local opt-in — never available to a2r_app
  IF current_user <> 'a2r_app'
     AND current_setting('a2r.ledger_admin', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION
    'immutable_audit_ledger is append-only: % rejected (id %)',
    TG_OP, COALESCE(OLD."id", NEW."id")
    USING ERRCODE = 'restrict_violation';
END $$;

DROP TRIGGER IF EXISTS trg_ledger_no_mutate ON "immutable_audit_ledger";
CREATE TRIGGER trg_ledger_no_mutate
  BEFORE UPDATE OR DELETE ON "immutable_audit_ledger"
  FOR EACH ROW EXECUTE FUNCTION _a2r_reject_ledger_mutation();

CREATE OR REPLACE FUNCTION _a2r_reject_ledger_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('a2r.ledger_admin', true) = 'on' THEN RETURN NULL; END IF;
  RAISE EXCEPTION 'immutable_audit_ledger cannot be truncated'
    USING ERRCODE = 'restrict_violation';
END $$;

DROP TRIGGER IF EXISTS trg_ledger_no_truncate ON "immutable_audit_ledger";
CREATE TRIGGER trg_ledger_no_truncate
  BEFORE TRUNCATE ON "immutable_audit_ledger"
  FOR EACH STATEMENT EXECUTE FUNCTION _a2r_reject_ledger_truncate();

-- ══ 3 — drop the removed v1.12.0 global break-glass table ══════════════
DROP TABLE IF EXISTS "_rls_control";
