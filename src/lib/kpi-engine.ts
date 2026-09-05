/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Custom KPI Definition Engine — pure calculation logic. No React, no
 * Next.js, no Prisma client (same philosophy as src/lib/calculations/*):
 * this file only ever sees plain numbers and the KPI's own definition, so
 * it is fully unit-testable and reusable from both the admin builder's
 * live preview and the real dashboard widgets.
 *
 * Deliberately NOT a formula language. `KpiMetricValues` holds one
 * already-computed number per catalog metric (see src/types/kpi.ts's
 * KPI_METRICS) — the "formula" a custom KPI applies is only ever: read
 * one named metric, then decide on-track/at-risk/critical from two
 * thresholds and a direction. Anything richer (blending two metrics,
 * custom math) is out of scope for this engine by design — it would mean
 * evaluating admin-authored expressions against live tenant data, a much
 * larger security surface for a "pick from a curated list" feature that
 * doesn't need one.
 */
import type { CustomKpiDef, CustomKpiInput, KpiFormulaType, KpiMetricKey, KpiResult, KpiStatus } from '@/types/kpi';
import { getMetricDef } from '@/types/kpi';

/** One pre-computed number per catalog metric — see
 * src/server/queries/kpi-data.ts for the adapter that builds this from
 * real tenant data. A key is omitted (not `null`) when that metric simply
 * hasn't been wired up to a live computation yet; `readMetricValue`
 * treats "omitted" and "explicitly null" the same way. */
export type KpiMetricValues = Partial<Record<KpiMetricKey, number | null>>;

export function readMetricValue(metricKey: KpiMetricKey, values: KpiMetricValues): number | null {
  const v = values[metricKey];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * The one piece of real "formula" logic in this engine: given a value and
 * a KPI's thresholds/direction, which of the three bands does it fall
 * into. DIRECT reads thresholds as floors (value must be *at or above* to
 * pass); INVERSE reads them as ceilings (value must be *at or below*).
 * `targetValue` is always the on-track boundary and `warningValue` the
 * at-risk boundary — validateKpiDefinition below is what keeps
 * `warningValue` on the correct side of `targetValue` for the chosen
 * direction, not this function (it just evaluates whatever it's given).
 */
export function evaluateKpiStatus(
  kpi: Pick<CustomKpiDef, 'formulaType' | 'targetValue' | 'warningValue'>,
  value: number | null
): KpiStatus {
  if (value === null) return 'no-data';

  if (kpi.formulaType === 'DIRECT') {
    if (value >= kpi.targetValue) return 'on-track';
    if (value >= kpi.warningValue) return 'at-risk';
    return 'critical';
  }

  // INVERSE — lower is better.
  if (value <= kpi.targetValue) return 'on-track';
  if (value <= kpi.warningValue) return 'at-risk';
  return 'critical';
}

/** Reads the KPI's bound metric out of `values` and evaluates its status
 * in one step — the function both the admin builder's live preview and
 * the real dashboard widgets call. */
export function evaluateKpi(kpi: CustomKpiDef, values: KpiMetricValues): KpiResult {
  const value = readMetricValue(kpi.metricKey, values);
  return { kpi, value, status: evaluateKpiStatus(kpi, value) };
}

/**
 * Validation for the admin builder — every rule here is a genuine
 * modeling error, not a style preference, so a form should block submit
 * on any of these rather than merely warn.
 */
export function validateKpiDefinition(input: CustomKpiInput): string[] {
  const errors: string[] = [];

  if (input.name.trim().length === 0) errors.push('Name is required.');

  const metric = getMetricDef(input.metricKey);
  if (!metric) {
    errors.push('Unknown metric.');
  } else if (metric.dataSource !== input.dataSource) {
    errors.push(`"${metric.label}" belongs to ${metric.dataSource}, not ${input.dataSource}.`);
  }

  if (!Number.isFinite(input.targetValue)) errors.push('Target value must be a number.');
  if (!Number.isFinite(input.warningValue)) errors.push('Warning value must be a number.');

  if (Number.isFinite(input.targetValue) && Number.isFinite(input.warningValue)) {
    if (input.formulaType === 'DIRECT' && input.warningValue > input.targetValue) {
      errors.push('For "higher is better", the warning value must be at or below the target value.');
    }
    if (input.formulaType === 'INVERSE' && input.warningValue < input.targetValue) {
      errors.push('For "lower is better", the warning value must be at or above the target value.');
    }
  }

  if (input.targetPersonas.length === 0) errors.push('Choose at least one persona this KPI should render for.');

  return errors;
}

export function isValidFormulaType(value: unknown): value is KpiFormulaType {
  return value === 'DIRECT' || value === 'INVERSE';
}
