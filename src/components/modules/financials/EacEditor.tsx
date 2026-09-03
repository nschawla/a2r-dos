'use client';

/**
 * Financial Realization & EAC Tracker.
 *
 * Replaces the Financials page's static actuals table with a live editable
 * one: Actual Hours/Cost to Date, Forecast Hours Remaining, and Open RR
 * Demand Hours are all inputs, and every keystroke re-runs the WP2 engine's
 * `computeEacSummary` client-side (zero server round-trip) so the KPI cards
 * above the table — True EAC Cost, True EAC Margin %, Margin Drift — track
 * the row edits in real time, not just what's already been saved. A row
 * commits its four fields together on Save (they're one atomic
 * FinancialActualInput to the engine, not four independent values), via
 * the `updateFinancialActual` Server Action.
 */
import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { computeEacSummary, computeContractorExposure, type EacRow, type EacStatus } from '@/lib/calculations/financials';
import type { FinancialActualInput, RateRole, SizingProjectInput } from '@/lib/calculations/types';
import { updateFinancialActual } from '@/server/actions/financials';
import { CsvImportModal } from '@/components/ingestion/CsvImportModal';
import { MaskedValue, RestrictedBadge } from '@/components/security/Masked';
import { MASK, RESTRICTED_BADGE_LABEL, type FinancialVisibility } from '@/lib/security/masking';

interface RowDraft {
  hours: number;
  cost: number;
  forecastHours: number;
  openRRHours: number;
}

export interface EacEditorProps {
  projectId: string;
  canEdit: boolean;
  estimationMode: 'MATRIX' | 'DIRECT';
  commercialModel: 'FF' | 'TM';
  contingencyPct: number;
  roles: RateRole[];
  effortCells: { phaseKey: string; roleId: string; hours: number }[];
  directIntake: { soldHours: number; targetRevenue: number; blendedMarginPct: number };
  actuals: FinancialActualInput[];
  /** RTM C4 — one point per ISO week for the Planned vs. Actual burn curve. */
  burnSeries?: { week: string; forecastHours: number; actualHours: number }[];
  /** Role-based data masking — 'full' shows everything, 'summary' hides raw
   * per-role cost rates + contractor exposure, 'restricted' masks all
   * cost/margin figures. Default 'full'. */
  visibility?: FinancialVisibility;
}

const STATUS_LABEL: Record<EacStatus, string> = { erosion: 'Margin Erosion', upside: 'Margin Upside', 'on-baseline': 'On Baseline' };
const STATUS_TONE: Record<EacStatus, string> = { erosion: 'text-critical', upside: 'text-success', 'on-baseline': 'text-ink-muted' };

function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

export function EacEditor({
  projectId,
  canEdit,
  estimationMode,
  commercialModel,
  contingencyPct,
  roles,
  effortCells,
  directIntake,
  actuals,
  burnSeries = [],
  visibility = 'full',
}: EacEditorProps) {
  const canMargins = visibility !== 'restricted';
  const canCost = visibility === 'full';
  const sizingInput: SizingProjectInput = useMemo(
    () => ({
      estimationMode: estimationMode === 'DIRECT' ? 'direct' : 'matrix',
      commercialModel: commercialModel === 'TM' ? 'tm' : 'ff',
      contingencyPct,
      effortCells,
      directIntake,
    }),
    [estimationMode, commercialModel, contingencyPct, effortCells, directIntake]
  );

  const [drafts, setDrafts] = useState<Record<string, RowDraft>>(() => buildDrafts(estimationMode, roles, sizingInput, actuals));
  const savedRef = useRef<Record<string, RowDraft>>(buildDrafts(estimationMode, roles, sizingInput, actuals));
  // WP6 — CSV Ingestion: bulk Financial Actuals import.
  const [importOpen, setImportOpen] = useState(false);

  const eac = useMemo(() => {
    const actualsInput = Object.entries(drafts).map(([roleKey, d]) => ({
      roleKey,
      hours: d.hours,
      cost: d.cost,
      forecastHours: d.forecastHours,
      openRRHours: d.openRRHours,
    }));
    return computeEacSummary(sizingInput, roles, actualsInput);
  }, [drafts, sizingInput, roles]);

  // WP6 — "Contractor / 3rd-Party Cost Exposure" KPI, derived straight
  // from the same EacSummary the cards above already recompute live.
  const exposure = useMemo(() => computeContractorExposure(eac), [eac]);

  function handleFieldChange(roleKey: string, patch: Partial<RowDraft>) {
    setDrafts((prev) => ({ ...prev, [roleKey]: { ...prev[roleKey], ...patch } as RowDraft }));
  }

  return (
    <div className="flex flex-col gap-4">
      {visibility !== 'full' && (
        <div className="flex items-center gap-2 text-[11.5px] text-ink-faint">
          <RestrictedBadge label={visibility === 'restricted' ? RESTRICTED_BADGE_LABEL : 'Partner-only cost detail'} />
          {visibility === 'restricted'
            ? 'Cost rates, margins and variance are restricted to Partners and Finance / Ops leads.'
            : 'Raw per-role cost rates and contractor exposure are Partner-only. Blended margins shown in full.'}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
        <div className="card !p-4">
          <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1.5">Actual Cost to Date</div>
          <div className="text-2xl font-display font-bold tabular-nums">
            <MaskedValue canView={canMargins} value={money(eac.totalActualCost)} />
          </div>
        </div>
        <div className="card !p-4">
          <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1.5">True EAC Cost</div>
          <div className="text-2xl font-display font-bold tabular-nums">
            <MaskedValue canView={canMargins} value={money(eac.totalEacCost)} />
          </div>
        </div>
        <div className="card !p-4">
          <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1.5">True EAC Margin</div>
          <div className="text-2xl font-display font-bold tabular-nums">
            <MaskedValue canView={canMargins} value={`${eac.eacMarginPct.toFixed(1)}%`} />
          </div>
        </div>
        <div className="card !p-4">
          <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1.5">Margin Drift</div>
          {canMargins ? (
            <>
              <div className={clsx('text-2xl font-display font-bold tabular-nums', STATUS_TONE[eac.status])}>
                {eac.drift >= 0 ? '-' : '+'}
                {Math.abs(eac.drift).toFixed(1)}pt
              </div>
              <div className={clsx('text-[11px] mt-1 font-semibold', STATUS_TONE[eac.status])}>{STATUS_LABEL[eac.status]}</div>
            </>
          ) : (
            <div className="text-2xl font-display font-bold tabular-nums">
              <MaskedValue canView={false} value={MASK} />
            </div>
          )}
        </div>
        <div className="card !p-4">
          <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1.5">Contractor / 3rd-Party Exposure</div>
          {!canCost ? (
            <div className="text-2xl font-display font-bold tabular-nums">
              <MaskedValue canView={false} value={MASK} />
            </div>
          ) : exposure.applicable ? (
            <>
              <div className="text-2xl font-display font-bold tabular-nums">{money(exposure.contractorEacCost)}</div>
              <div className="text-[11px] text-ink-faint mt-1">
                {exposure.contractorPct.toFixed(1)}% of True EAC Cost &middot; {exposure.contractorHours.toLocaleString('en-US')} hrs
              </div>
            </>
          ) : (
            <div className="text-ink-faint text-xs mt-1">Not applicable in Direct Intake mode.</div>
          )}
        </div>
      </div>

      {eac.totalOpenRRHours > 0 && (
        <div className="card !p-4 !bg-warning-soft border-warning/30">
          <p className="text-sm text-warning">
            <span className="font-semibold">{eac.totalOpenRRHours.toLocaleString('en-US')} open RR hours</span> are
            unstaffed but still costed at baseline rate — leaving demand unassigned doesn&rsquo;t make it free.
          </p>
        </div>
      )}

      <BurnCurve series={burnSeries} />

      <div className="card">
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="text-[15.5px] font-bold">
            {estimationMode === 'DIRECT' ? 'Blended Actuals & Forecast' : 'Actuals, Forecast & Open Demand by Role'}
          </h2>
          {canEdit && (
            <button type="button" className="btn-secondary !w-auto !py-1.5 px-3 text-xs" onClick={() => setImportOpen(true)}>
              Import CSV&hellip;
            </button>
          )}
        </div>
        {eac.rows.length === 0 ? (
          <p className="text-ink-muted text-sm">No rate-card roles configured for this org yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide border-b border-border">
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4 text-right">Baseline Hrs</th>
                  <th className="py-2 pr-4 text-right">Baseline Rate</th>
                  <th className="py-2 pr-4 text-right">Actual Hrs</th>
                  <th className="py-2 pr-4 text-right">Actual Cost</th>
                  <th className="py-2 pr-4 text-right">Forecast Hrs Remaining</th>
                  <th className="py-2 pr-4 text-right">Open RR Hrs</th>
                  <th className="py-2 pr-4 text-right">EAC</th>
                  {canEdit && <th className="py-2 pr-4" />}
                </tr>
              </thead>
              <tbody>
                {eac.rows.map((row) => (
                  <EacRowEditor
                    key={row.id}
                    projectId={projectId}
                    canEdit={canEdit}
                    canCost={canCost}
                    row={row}
                    draft={drafts[row.id] ?? { hours: 0, cost: 0, forecastHours: row.baselineHours, openRRHours: 0 }}
                    savedRef={savedRef}
                    onChange={(patch) => handleFieldChange(row.id, patch)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {importOpen && <CsvImportModal projectId={projectId} kind="financials" onClose={() => setImportOpen(false)} />}
    </div>
  );
}

function buildDrafts(
  mode: 'MATRIX' | 'DIRECT',
  roles: RateRole[],
  sizingInput: SizingProjectInput,
  actuals: EacEditorProps['actuals']
): Record<string, RowDraft> {
  const byKey = new Map(actuals.map((a) => [a.roleKey, a]));
  const drafts: Record<string, RowDraft> = {};
  if (mode === 'DIRECT') {
    const totalHours = sizingInput.directIntake?.soldHours ?? 0;
    const a = byKey.get('_direct');
    drafts['_direct'] = {
      hours: a?.hours ?? 0,
      cost: a?.cost ?? 0,
      forecastHours: a?.forecastHours ?? totalHours,
      openRRHours: a?.openRRHours ?? 0,
    };
  } else {
    const roleTotals: Record<string, number> = {};
    for (const c of sizingInput.effortCells) roleTotals[c.roleId] = (roleTotals[c.roleId] ?? 0) + c.hours;
    for (const r of roles) {
      const a = byKey.get(r.id);
      const baseline = roleTotals[r.id] ?? 0;
      drafts[r.id] = {
        hours: a?.hours ?? 0,
        cost: a?.cost ?? 0,
        forecastHours: a?.forecastHours ?? baseline,
        openRRHours: a?.openRRHours ?? 0,
      };
    }
  }
  return drafts;
}

function EacRowEditor({
  projectId,
  canEdit,
  canCost,
  row,
  draft,
  savedRef,
  onChange,
}: {
  projectId: string;
  canEdit: boolean;
  canCost: boolean;
  row: EacRow;
  draft: RowDraft;
  savedRef: React.MutableRefObject<Record<string, RowDraft>>;
  onChange: (patch: Partial<RowDraft>) => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saved = savedRef.current[row.id] ?? { hours: 0, cost: 0, forecastHours: row.baselineHours, openRRHours: 0 };
  const dirty =
    draft.hours !== saved.hours ||
    draft.cost !== saved.cost ||
    draft.forecastHours !== saved.forecastHours ||
    draft.openRRHours !== saved.openRRHours;

  function handleSave() {
    if (!canEdit || busy) return;
    setBusy(true);
    setError(null);
    const snapshot = draft;
    startTransition(async () => {
      try {
        const result = await updateFinancialActual({
          projectId,
          roleKey: row.id,
          hours: snapshot.hours,
          cost: snapshot.cost,
          forecastHours: snapshot.forecastHours,
          openRRHours: snapshot.openRRHours,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        savedRef.current = { ...savedRef.current, [row.id]: snapshot };
        router.refresh();
      } finally {
        setBusy(false);
      }
    });
  }

  function handleDiscard() {
    onChange(saved);
    setError(null);
  }

  return (
    <tr className="border-b border-border/60 last:border-0 align-top">
      <td className="py-2 pr-4 font-semibold whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5">
          {row.label}
          {row.employmentType && (
            <span
              className={clsx(
                'text-[9.5px] font-semibold rounded-full px-1.5 py-0.5',
                row.employmentType === 'contractor' ? 'bg-warning-soft text-warning' : 'bg-na-soft text-na'
              )}
            >
              {row.employmentType === 'contractor' ? 'Contractor' : 'FTE'}
            </span>
          )}
        </span>
      </td>
      <td className="py-2 pr-4 text-right tabular-nums text-ink-muted">{row.baselineHours.toLocaleString('en-US')}</td>
      <td className="py-2 pr-4 text-right tabular-nums text-ink-muted">
        <MaskedValue canView={canCost} value={`$${row.costRate.toFixed(2)}/hr`} />
      </td>
      <td className="py-1.5 pr-4">
        <input
          type="number"
          min={0}
          className="input !w-24 text-right tabular-nums"
          value={draft.hours}
          disabled={!canEdit}
          onChange={(e) => onChange({ hours: Math.max(0, Number(e.target.value) || 0) })}
        />
      </td>
      <td className="py-1.5 pr-4 text-right">
        {canCost ? (
          <input
            type="number"
            min={0}
            className="input !w-28 text-right tabular-nums"
            value={draft.cost}
            disabled={!canEdit}
            onChange={(e) => onChange({ cost: Math.max(0, Number(e.target.value) || 0) })}
          />
        ) : (
          <MaskedValue canView={false} value={MASK} className="tabular-nums" />
        )}
      </td>
      <td className="py-1.5 pr-4">
        <input
          type="number"
          min={0}
          className="input !w-28 text-right tabular-nums"
          value={draft.forecastHours}
          disabled={!canEdit}
          onChange={(e) => onChange({ forecastHours: Math.max(0, Number(e.target.value) || 0) })}
        />
      </td>
      <td className="py-1.5 pr-4">
        <input
          type="number"
          min={0}
          className="input !w-24 text-right tabular-nums"
          value={draft.openRRHours}
          disabled={!canEdit}
          onChange={(e) => onChange({ openRRHours: Math.max(0, Number(e.target.value) || 0) })}
        />
      </td>
      <td className="py-2 pr-4 text-right tabular-nums font-semibold">
        <MaskedValue canView={canCost} value={money(row.eacCost)} />
      </td>
      {canEdit && (
        <td className="py-1.5 pr-4">
          {dirty && (
            <div className="flex items-center gap-2 justify-end">
              <button type="button" className="btn-secondary !w-auto !py-1.5 px-3 text-xs" disabled={busy} onClick={handleSave}>
                {busy ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="text-ink-faint hover:text-ink text-xs" disabled={busy} onClick={handleDiscard}>
                Discard
              </button>
            </div>
          )}
          {error && <div className="text-critical text-[10.5px] mt-1 text-right">{error}</div>}
        </td>
      )}
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// RTM C4 — Planned vs. Actual cumulative burn curve.
//
// Lightweight inline SVG (no charting lib). Planned = running sum of
// forecasted hours per ISO week from WeeklyAssignmentSlot; Actual = running
// sum of logged actual hours, drawn only through the last week that has any
// actuals (so the Actual line ends at "today" while Planned runs to the end
// of the staffing plan).
// ─────────────────────────────────────────────────────────────────────────
function BurnCurve({ series }: { series: { week: string; forecastHours: number; actualHours: number }[] }) {
  if (series.length < 2) {
    return (
      <div className="card">
        <h2 className="text-[15.5px] font-bold mb-1">Planned vs. Actual Burn</h2>
        <p className="text-ink-muted text-sm">
          No weekly staffing slots yet — the burn curve appears once this engagement has forecast/actual hours logged
          by week.
        </p>
      </div>
    );
  }

  const W = 640;
  const H = 200;
  const PAD_L = 44;
  const PAD_R = 12;
  const PAD_T = 12;
  const PAD_B = 26;

  let plannedCum = 0;
  let actualCum = 0;
  let lastActualIdx = -1;
  const points = series.map((p, i) => {
    plannedCum += p.forecastHours;
    actualCum += p.actualHours;
    if (p.actualHours > 0) lastActualIdx = i;
    return { i, week: p.week, plannedCum, actualCum };
  });

  const maxY = Math.max(1, ...points.map((p) => p.plannedCum));
  const n = points.length;
  const x = (i: number) => PAD_L + (i / (n - 1)) * (W - PAD_L - PAD_R);
  const y = (v: number) => PAD_T + (1 - v / maxY) * (H - PAD_T - PAD_B);

  const plannedPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.plannedCum).toFixed(1)}`).join(' ');
  const actualPts = lastActualIdx >= 0 ? points.slice(0, lastActualIdx + 1) : [];
  const actualPath = actualPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)},${y(p.actualCum).toFixed(1)}`).join(' ');
  const actualArea =
    actualPts.length > 1
      ? `${actualPath} L${x(actualPts[actualPts.length - 1]!.i).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`
      : '';

  const plannedTotal = points[n - 1]!.plannedCum;
  const actualTotal = lastActualIdx >= 0 ? points[lastActualIdx]!.actualCum : 0;
  const plannedToDate = lastActualIdx >= 0 ? points[lastActualIdx]!.plannedCum : 0;
  const variancePct = plannedToDate > 0 ? ((actualTotal - plannedToDate) / plannedToDate) * 100 : 0;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxY);
  const fmtWeek = (w: string) => {
    const d = new Date(w);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };
  const labelEvery = Math.ceil(n / 8);

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div>
          <h2 className="text-[15.5px] font-bold">Planned vs. Actual Burn</h2>
          <p className="text-[12px] text-ink-muted mt-0.5">Cumulative staffed hours by week — forecast vs. logged actuals.</p>
        </div>
        <div className="flex gap-4 text-xs">
          <div>
            <div className="text-ink-faint uppercase tracking-wide text-[10px] font-semibold">Actual to date</div>
            <div className="font-display font-bold tabular-nums">{Math.round(actualTotal).toLocaleString('en-US')} h</div>
          </div>
          <div>
            <div className="text-ink-faint uppercase tracking-wide text-[10px] font-semibold">Plan to date</div>
            <div className="font-display font-bold tabular-nums">{Math.round(plannedToDate).toLocaleString('en-US')} h</div>
          </div>
          <div>
            <div className="text-ink-faint uppercase tracking-wide text-[10px] font-semibold">Variance</div>
            <div
              className={clsx(
                'font-display font-bold tabular-nums',
                variancePct > 5 ? 'text-critical' : variancePct < -5 ? 'text-success' : 'text-ink-muted'
              )}
            >
              {variancePct >= 0 ? '+' : ''}
              {variancePct.toFixed(1)}%
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[420px]" role="img" aria-label="Planned versus actual cumulative burn curve">
          {yTicks.map((t, i) => (
            <g key={i}>
              <line x1={PAD_L} y1={y(t)} x2={W - PAD_R} y2={y(t)} stroke="currentColor" className="text-border" strokeWidth={1} />
              <text x={PAD_L - 6} y={y(t) + 3} textAnchor="end" className="fill-ink-faint" fontSize={9}>
                {Math.round(t).toLocaleString('en-US')}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            i % labelEvery === 0 ? (
              <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="fill-ink-faint" fontSize={9}>
                {fmtWeek(p.week)}
              </text>
            ) : null
          )}
          {actualArea && <path d={actualArea} className="fill-brand-hi/15" />}
          <path d={plannedPath} fill="none" stroke="currentColor" className="text-ink-faint" strokeWidth={1.75} strokeDasharray="4 3" />
          {actualPath && <path d={actualPath} fill="none" stroke="currentColor" className="text-brand-hi" strokeWidth={2.25} />}
        </svg>
      </div>

      <div className="flex items-center gap-4 text-[11px] text-ink-muted mt-1">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 border-t-2 border-dashed border-ink-faint" /> Planned ({Math.round(plannedTotal).toLocaleString('en-US')} h total)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 border-t-2 border-brand-hi" /> Actual
        </span>
      </div>
    </div>
  );
}
