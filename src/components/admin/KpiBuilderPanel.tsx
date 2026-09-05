'use client';

/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Custom KPI Definition Engine — the admin builder UI at /admin/kpis.
 * Create/edit/delete against the real server actions
 * (src/server/actions/kpis.ts); the metric picker cascades from the
 * chosen data source (src/types/kpi.ts's KPI_METRICS catalog), and
 * picking a metric seeds a sensible default formula direction rather
 * than asking the admin to guess it.
 */
import { useState } from 'react';
import clsx from 'clsx';
import { useBusyAction, PanelHead } from '@/components/ui/panel-kit';
import { createCustomKpi, updateCustomKpi, deleteCustomKpi } from '@/server/actions/kpis';
import { validateKpiDefinition } from '@/lib/kpi-engine';
import { RBAC_MATRIX, RBAC_PERSONAS, type RbacPersona } from '@/lib/governance/rbacMatrix';
import {
  KPI_DATA_SOURCES,
  KPI_DATA_SOURCE_LABEL,
  KPI_FORMULA_TYPE_LABEL,
  metricsForSource,
  getMetricDef,
  type CustomKpiDef,
  type CustomKpiInput,
  type KpiDataSource,
  type KpiFormulaType,
} from '@/types/kpi';

const EMPTY_FORM: CustomKpiInput = {
  name: '',
  dataSource: 'FINANCIALS',
  metricKey: metricsForSource('FINANCIALS')[0]!.key,
  formulaType: metricsForSource('FINANCIALS')[0]!.defaultFormulaType,
  targetValue: 0,
  warningValue: 0,
  targetPersonas: [],
};

export function KpiBuilderPanel({ initialKpis }: { initialKpis: CustomKpiDef[] }) {
  const [kpis, setKpis] = useState(initialKpis);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CustomKpiInput>(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const { busy, run } = useBusyAction();

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function startEdit(kpi: CustomKpiDef) {
    setEditingId(kpi.id);
    setForm({
      name: kpi.name,
      dataSource: kpi.dataSource,
      metricKey: kpi.metricKey,
      formulaType: kpi.formulaType,
      targetValue: kpi.targetValue,
      warningValue: kpi.warningValue,
      targetPersonas: kpi.targetPersonas,
    });
    setFormOpen(true);
  }

  function changeDataSource(dataSource: KpiDataSource) {
    const first = metricsForSource(dataSource)[0]!;
    setForm((f) => ({ ...f, dataSource, metricKey: first.key, formulaType: first.defaultFormulaType }));
  }

  function changeMetric(metricKey: string) {
    const metric = getMetricDef(metricKey);
    setForm((f) => ({ ...f, metricKey: metricKey as CustomKpiInput['metricKey'], formulaType: metric?.defaultFormulaType ?? f.formulaType }));
  }

  function togglePersona(persona: RbacPersona) {
    setForm((f) => ({
      ...f,
      targetPersonas: f.targetPersonas.includes(persona)
        ? f.targetPersonas.filter((p) => p !== persona)
        : [...f.targetPersonas, persona],
    }));
  }

  const validationErrors = validateKpiDefinition(form);

  async function submit() {
    if (validationErrors.length > 0) return;
    const ok = await run(
      () => (editingId ? updateCustomKpi(editingId, form) : createCustomKpi(form)),
      { success: editingId ? 'KPI updated' : 'KPI created', errorTitle: "Couldn't save KPI" }
    );
    if (ok) {
      setFormOpen(false);
      // The action already revalidates the page; re-derive our local
      // list optimistically too so the panel doesn't wait on a refetch.
      if (editingId) {
        setKpis((prev) => prev.map((k) => (k.id === editingId ? { ...k, ...form, id: editingId } : k)));
      } else {
        setKpis((prev) => [...prev, { ...form, id: `pending-${Date.now()}` }]);
      }
    }
  }

  async function remove(kpi: CustomKpiDef) {
    if (!window.confirm(`Delete "${kpi.name}"? This can't be undone.`)) return;
    const ok = await run(() => deleteCustomKpi(kpi.id), { success: 'KPI deleted', errorTitle: "Couldn't delete KPI" });
    if (ok) setKpis((prev) => prev.filter((k) => k.id !== kpi.id));
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="card">
        <div className="flex items-start justify-between gap-4">
          <PanelHead
            eyebrow="Custom KPI Definition Engine"
            title="Custom KPIs"
            desc="Bind a real, already-computed metric to two thresholds and a set of personas. Cards render automatically on the Control Tower and the Executive Hub for whichever viewer matches."
          />
          <button id="new-kpi-button" type="button" className="btn-primary !w-auto px-4 text-xs flex-none" onClick={startCreate}>
            + New KPI
          </button>
        </div>

        {kpis.length === 0 ? (
          <p className="text-sm text-ink-muted">No custom KPIs yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {kpis.map((kpi) => {
              const metric = getMetricDef(kpi.metricKey);
              return (
                <li key={kpi.id} className="flex items-center justify-between gap-3 rounded-md border border-border-soft px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink truncate">{kpi.name}</div>
                    <div className="text-[11.5px] text-ink-muted">
                      {KPI_DATA_SOURCE_LABEL[kpi.dataSource]} · {metric?.label ?? kpi.metricKey} ·{' '}
                      {KPI_FORMULA_TYPE_LABEL[kpi.formulaType]}
                    </div>
                    <div className="text-[11px] text-ink-faint mt-0.5">
                      Target {kpi.targetValue}
                      {metric?.unit === 'pct' ? '%' : ''} · Warning {kpi.warningValue}
                      {metric?.unit === 'pct' ? '%' : ''} ·{' '}
                      {kpi.targetPersonas.length === 0
                        ? 'no personas assigned'
                        : kpi.targetPersonas.map((p) => RBAC_MATRIX[p].label).join(', ')}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-none">
                    <button type="button" className="text-xs font-semibold text-brand hover:underline" onClick={() => startEdit(kpi)}>
                      Edit
                    </button>
                    <button type="button" className="text-xs font-semibold text-critical hover:underline" onClick={() => remove(kpi)}>
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {formOpen && (
        <section className="card flex flex-col gap-4">
          <PanelHead
            eyebrow={editingId ? 'Edit KPI' : 'New KPI'}
            title={editingId ? 'Edit Custom KPI' : 'Define a Custom KPI'}
            desc="Pick a data source and metric, set the thresholds, and choose who sees it."
          />

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Name</span>
            <input
              type="text"
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Portfolio Margin Health"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Data Source</span>
              <select
                className="input"
                value={form.dataSource}
                onChange={(e) => changeDataSource(e.target.value as KpiDataSource)}
              >
                {KPI_DATA_SOURCES.map((ds) => (
                  <option key={ds} value={ds}>
                    {KPI_DATA_SOURCE_LABEL[ds]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Metric</span>
              <select className="input" value={form.metricKey} onChange={(e) => changeMetric(e.target.value)}>
                {metricsForSource(form.dataSource).map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="text-[11.5px] text-ink-faint -mt-2">{getMetricDef(form.metricKey)?.description}</p>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Direction</span>
              <select
                className="input"
                value={form.formulaType}
                onChange={(e) => setForm((f) => ({ ...f, formulaType: e.target.value as KpiFormulaType }))}
              >
                <option value="DIRECT">{KPI_FORMULA_TYPE_LABEL.DIRECT}</option>
                <option value="INVERSE">{KPI_FORMULA_TYPE_LABEL.INVERSE}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Target</span>
              <input
                type="number"
                className="input"
                value={form.targetValue}
                onChange={(e) => setForm((f) => ({ ...f, targetValue: Number(e.target.value) }))}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Warning</span>
              <input
                type="number"
                className="input"
                value={form.warningValue}
                onChange={(e) => setForm((f) => ({ ...f, warningValue: Number(e.target.value) }))}
              />
            </label>
          </div>

          <div>
            <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Render for</span>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {RBAC_PERSONAS.map((p) => {
                const active = form.targetPersonas.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePersona(p)}
                    className={clsx(
                      'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                      active ? 'border-brand bg-brand/10 text-brand' : 'border-border-soft text-ink-muted hover:text-ink'
                    )}
                  >
                    {RBAC_MATRIX[p].label}
                  </button>
                );
              })}
            </div>
          </div>

          {validationErrors.length > 0 && (
            <ul className="text-critical text-xs flex flex-col gap-0.5">
              {validationErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" className="text-ink-faint hover:text-ink text-xs px-3 py-2" onClick={() => setFormOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary !w-auto px-6 disabled:opacity-50"
              disabled={busy || validationErrors.length > 0}
              onClick={submit}
            >
              {busy ? 'Saving…' : editingId ? 'Save Changes' : 'Create KPI'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
