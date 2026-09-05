/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Types for the Custom KPI Definition Engine (Admin & Org Setup → Custom
 * KPIs, `/admin/kpis`) — pure types and the metric catalog, no
 * React/Next/Prisma imports, matching the split every other
 * `src/lib/*`/`src/types/*` config module in this app already uses.
 *
 * A custom KPI is a *binding*, not a formula language: an admin picks one
 * pre-computed metric from one of the four real data domains this app
 * already calculates (see `KPI_METRICS` below), two thresholds, a
 * direction, and which personas the resulting card should render for.
 * There is no arbitrary expression evaluation anywhere in this engine —
 * see src/lib/kpi-engine.ts for why that's a deliberate scope line.
 */
import type { RbacPersona } from '@/lib/governance/rbacMatrix';

export type { RbacPersona };

// ============================================================ data source

/** The four real data domains this app already computes portfolio-level
 * numbers for — the sidebar's own "Engagement Governance" modules minus
 * Control Audit, which isn't one of the four named intake streams. */
export type KpiDataSource = 'FINANCIALS' | 'SCHEDULE' | 'RAID' | 'CAPACITY';

export const KPI_DATA_SOURCES: readonly KpiDataSource[] = ['FINANCIALS', 'SCHEDULE', 'RAID', 'CAPACITY'] as const;

export const KPI_DATA_SOURCE_LABEL: Record<KpiDataSource, string> = {
  FINANCIALS: 'Financial Realization',
  SCHEDULE: 'Schedule & Milestones',
  RAID: 'RAID Cockpit',
  CAPACITY: 'Resource & Capacity',
};

// ================================================================ metrics

export type KpiMetricUnit = 'pct' | 'count';

export type KpiMetricKey =
  | 'blendedMarginPct'
  | 'highRiskProjectCount'
  | 'onTrackPhasePct'
  | 'delayedPhaseCount'
  | 'openCriticalRaidCount'
  | 'escalatedRaidCount'
  | 'blendedUtilizationPct'
  | 'overloadedResourceCount';

export interface KpiMetricDef {
  key: KpiMetricKey;
  dataSource: KpiDataSource;
  label: string;
  unit: KpiMetricUnit;
  /** The formula-type direction this metric naturally reads in — the
   * admin can still override it, but this seeds a sensible default when
   * a metric is first picked (e.g. a count of overloaded people defaults
   * to "lower is better"). */
  defaultFormulaType: KpiFormulaType;
  description: string;
}

/** The full catalog, one entry per KpiMetricKey — every dataSource gets
 * exactly two metrics, kept deliberately small and concrete rather than
 * an open-ended list, matching this engine's "curated picker, not a
 * formula language" scope. */
export const KPI_METRICS: readonly KpiMetricDef[] = [
  {
    key: 'blendedMarginPct',
    dataSource: 'FINANCIALS',
    label: 'Blended Baseline Margin',
    unit: 'pct',
    defaultFormulaType: 'DIRECT',
    description: 'Average baseline margin across every project in scope, weighted by contract value.',
  },
  {
    key: 'highRiskProjectCount',
    dataSource: 'FINANCIALS',
    label: 'High-Risk (Red) Projects',
    unit: 'count',
    defaultFormulaType: 'INVERSE',
    description: 'Count of projects at Red health.',
  },
  {
    key: 'onTrackPhasePct',
    dataSource: 'SCHEDULE',
    label: 'On-Track Phase %',
    unit: 'pct',
    defaultFormulaType: 'DIRECT',
    description: 'Share of delivery phases across scoped projects that are not marked Delayed.',
  },
  {
    key: 'delayedPhaseCount',
    dataSource: 'SCHEDULE',
    label: 'Delayed Phases',
    unit: 'count',
    defaultFormulaType: 'INVERSE',
    description: 'Count of delivery phases currently marked Delayed.',
  },
  {
    key: 'openCriticalRaidCount',
    dataSource: 'RAID',
    label: 'Open Critical RAID Items',
    unit: 'count',
    defaultFormulaType: 'INVERSE',
    description: 'Count of open (not Closed) Critical-severity RAID entries.',
  },
  {
    key: 'escalatedRaidCount',
    dataSource: 'RAID',
    label: 'Escalated RAID Items',
    unit: 'count',
    defaultFormulaType: 'INVERSE',
    description: 'Count of open RAID entries flagged for SteerCo escalation.',
  },
  {
    key: 'blendedUtilizationPct',
    dataSource: 'CAPACITY',
    label: 'Blended Billable Utilization',
    unit: 'pct',
    defaultFormulaType: 'DIRECT',
    description: 'Blended billable utilization across the roster, trailing 13 weeks.',
  },
  {
    key: 'overloadedResourceCount',
    dataSource: 'CAPACITY',
    label: 'Overloaded Resources',
    unit: 'count',
    defaultFormulaType: 'INVERSE',
    description: 'Count of resources concurrently staffed beyond the concurrency threshold.',
  },
] as const;

export function metricsForSource(source: KpiDataSource): KpiMetricDef[] {
  return KPI_METRICS.filter((m) => m.dataSource === source);
}

export function getMetricDef(key: string): KpiMetricDef | undefined {
  return KPI_METRICS.find((m) => m.key === key);
}

// ============================================================= formula type

/** DIRECT: at/above `targetValue` is on-track (higher is better).
 * INVERSE: at/below `targetValue` is on-track (lower is better). */
export type KpiFormulaType = 'DIRECT' | 'INVERSE';

export const KPI_FORMULA_TYPE_LABEL: Record<KpiFormulaType, string> = {
  DIRECT: 'Higher is better',
  INVERSE: 'Lower is better',
};

// ================================================================ the KPI

export interface CustomKpiDef {
  id: string;
  name: string;
  dataSource: KpiDataSource;
  metricKey: KpiMetricKey;
  formulaType: KpiFormulaType;
  targetValue: number;
  warningValue: number;
  targetPersonas: RbacPersona[];
}

/** Shape a create/update form submits — `id` is assigned server-side. */
export type CustomKpiInput = Omit<CustomKpiDef, 'id'>;

// ================================================================ results

export type KpiStatus = 'on-track' | 'at-risk' | 'critical' | 'no-data';

export const KPI_STATUS_LABEL: Record<KpiStatus, string> = {
  'on-track': 'On track',
  'at-risk': 'At risk',
  critical: 'Critical',
  'no-data': 'No data',
};

export interface KpiResult {
  kpi: CustomKpiDef;
  /** The raw metric value, or null when the data source had nothing to
   * compute from (e.g. zero scoped projects). */
  value: number | null;
  status: KpiStatus;
}
