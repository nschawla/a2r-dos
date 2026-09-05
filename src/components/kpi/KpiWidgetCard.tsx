/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Custom KPI Definition Engine — the dashboard widget. A server component
 * (no interactivity needed to just display a computed value), dropped
 * onto the Control Tower and the Executive Hub, filtered to whichever
 * custom KPIs are bound to the viewer's RbacPersona
 * (src/lib/governance/rbacMatrix.ts) via `filterKpisForPersona`.
 */
import clsx from 'clsx';
import type { RbacPersona } from '@/lib/governance/rbacMatrix';
import { evaluateKpi, type KpiMetricValues } from '@/lib/kpi-engine';
import { getMetricDef, KPI_STATUS_LABEL, type CustomKpiDef, type KpiStatus } from '@/types/kpi';

/** The custom KPIs bound to this persona, in stored order — a plain
 * array filter, kept here (rather than in kpi-engine.ts) since "which
 * persona is viewing" is a rendering concern, not a calculation one. */
export function filterKpisForPersona(kpis: CustomKpiDef[], persona: RbacPersona): CustomKpiDef[] {
  return kpis.filter((k) => k.targetPersonas.includes(persona));
}

const STATUS_STYLE: Record<KpiStatus, { dot: string; text: string; ring: string }> = {
  'on-track': { dot: 'bg-success', text: 'text-success', ring: 'border-success/30' },
  'at-risk': { dot: 'bg-warning', text: 'text-warning', ring: 'border-warning/30' },
  critical: { dot: 'bg-critical', text: 'text-critical', ring: 'border-critical/30' },
  'no-data': { dot: 'bg-na', text: 'text-na', ring: 'border-border-soft' },
};

function formatValue(value: number | null, unit: 'pct' | 'count'): string {
  if (value === null) return '—';
  return unit === 'pct' ? `${value.toFixed(1)}%` : Math.round(value).toLocaleString('en-US');
}

export function KpiWidgetCard({ kpi, values }: { kpi: CustomKpiDef; values: KpiMetricValues }) {
  const result = evaluateKpi(kpi, values);
  const metric = getMetricDef(kpi.metricKey);
  const style = STATUS_STYLE[result.status];

  return (
    <div className={clsx('rounded-lg border bg-surface-1 p-4 flex flex-col gap-1.5', style.ring)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] uppercase tracking-wide text-ink-faint font-semibold truncate">{kpi.name}</span>
        <span className={clsx('w-2 h-2 rounded-full flex-none', style.dot)} aria-hidden />
      </div>
      <div className="text-2xl font-bold text-ink tabular-nums">{formatValue(result.value, metric?.unit ?? 'count')}</div>
      <div className={clsx('text-[11px] font-semibold', style.text)}>{KPI_STATUS_LABEL[result.status]}</div>
      {metric && <div className="text-[10.5px] text-ink-faint mt-0.5">{metric.label}</div>}
    </div>
  );
}

export function KpiWidgetRow({
  kpis,
  values,
  persona,
}: {
  kpis: CustomKpiDef[];
  values: KpiMetricValues;
  persona: RbacPersona;
}) {
  const visible = filterKpisForPersona(kpis, persona);
  if (visible.length === 0) return null;

  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-2">Custom KPIs</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {visible.map((kpi) => (
          <KpiWidgetCard key={kpi.id} kpi={kpi} values={values} />
        ))}
      </div>
    </div>
  );
}
