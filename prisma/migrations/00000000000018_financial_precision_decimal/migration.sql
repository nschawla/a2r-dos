-- A2R Delivery OS — Financial precision: Float (double precision) → Decimal (NUMERIC).
--
-- BEFORE
-- ──────────────────────────────────────────────────────────────────────
--   13 monetary / rate / margin / EAC / BAC columns were `double
--   precision`. IEEE-754 doubles cannot represent every cents value
--   exactly, and a float `SUM()` accumulates representation error as a
--   portfolio grows — not the posture a financial auditor expects.
--
-- AFTER
-- ──────────────────────────────────────────────────────────────────────
--   $ amounts        → NUMERIC(14,2)   (bac, actualsCost, unscheduledBacklog,
--                                       vac, directIntakeTargetRevenue,
--                                       financial_actuals.cost)
--   $/hr rates       → NUMERIC(12,4)   (delivery_roles.billRate / costRate)
--   percentages      → NUMERIC(7,4)    (contingencyPct, directIntakeBlendedMarginPct,
--                                       org_policies.marginCritPct)
--   generic KPI      → NUMERIC(18,6)   (custom_kpis.targetValue / warningValue)
--
--   Exact at rest and under SQL aggregation. The application converts to a
--   plain `number` at ONE boundary — src/server/queries/calc-adapters.ts —
--   so the calc engine (src/lib/calculations) is unchanged. Hours / FTE /
--   utilisation / pctComplete stay `double precision` (non-monetary).
--
-- DATA-PRESERVING. `double precision → numeric` is an assignment cast;
-- existing values are re-stored at the target scale (e.g. 210 → 210.0000).
-- Column DEFAULTs (0 / 5 / 12) survive a compatible type change untouched.
--
-- Hand-derived (see 00000000000000_init). Apply with:
--   npx prisma db execute --file prisma/migrations/00000000000018_financial_precision_decimal/migration.sql --schema prisma/schema.prisma
--   npx prisma generate
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE "delivery_roles"
  ALTER COLUMN "billRate" SET DATA TYPE NUMERIC(12,4),
  ALTER COLUMN "costRate" SET DATA TYPE NUMERIC(12,4);

ALTER TABLE "projects"
  ALTER COLUMN "bac"                          SET DATA TYPE NUMERIC(14,2),
  ALTER COLUMN "actualsCost"                  SET DATA TYPE NUMERIC(14,2),
  ALTER COLUMN "unscheduledBacklog"           SET DATA TYPE NUMERIC(14,2),
  ALTER COLUMN "vac"                          SET DATA TYPE NUMERIC(14,2),
  ALTER COLUMN "directIntakeTargetRevenue"    SET DATA TYPE NUMERIC(14,2),
  ALTER COLUMN "contingencyPct"               SET DATA TYPE NUMERIC(7,4),
  ALTER COLUMN "directIntakeBlendedMarginPct" SET DATA TYPE NUMERIC(7,4);

ALTER TABLE "org_policies"
  ALTER COLUMN "marginCritPct" SET DATA TYPE NUMERIC(7,4);

ALTER TABLE "financial_actuals"
  ALTER COLUMN "cost" SET DATA TYPE NUMERIC(14,2);

ALTER TABLE "custom_kpis"
  ALTER COLUMN "targetValue"  SET DATA TYPE NUMERIC(18,6),
  ALTER COLUMN "warningValue" SET DATA TYPE NUMERIC(18,6);
