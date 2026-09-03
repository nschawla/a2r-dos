'use client';

/**
 * Commercial Baseline — Sizing Interactive Workspace.
 *
 * Replaces the page's static "Deal Economics" read-out with a fully
 * editable workspace: a Matrix Mode grid (Phase-Effort Matrix, one cell per
 * phase x delivery role) or a Direct Baseline Intake form, whichever
 * `estimationMode` is authoritative for the project — plus the Target
 * Margin Modeler underneath, which is a pure function of whatever totals
 * this component currently holds.
 *
 * Optimistic-without-useOptimistic: React 18.3 (the locked-in stack, see
 * WP3) has no useOptimistic (that's React 19+), so "optimistic" here means
 * local useState updated immediately on every input, recomputed against the
 * WP2 engine (computeTotalsFor) entirely client-side with zero server
 * round-trip, while the actual persistence happens in the background via a
 * useTransition-wrapped Server Action. A cell/field reverts to its last
 * known-good server value if that action reports failure.
 */
import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { PHASES } from '@/lib/constants';
import { computeTotalsFor } from '@/lib/calculations/sizing';
import type { RateRole, SizingProjectInput } from '@/lib/calculations/types';
import { updateEffortCell, updateDirectIntake, setEstimationMode } from '@/server/actions/projects';
import { MarginModelerCard } from '@/components/projects/MarginModelerCard';
import { CsvImportModal } from '@/components/ingestion/CsvImportModal';
import { MaskedValue } from '@/components/security/Masked';
import type { FinancialVisibility } from '@/lib/security/masking';

type EstimationModeUI = 'MATRIX' | 'DIRECT';
type EffortMatrixState = Record<string, Record<string, number>>;

interface DirectIntakeState {
  soldHours: number;
  targetRevenue: number;
  blendedMarginPct: number;
}

export interface DealEditorProps {
  projectId: string;
  canEdit: boolean;
  estimationMode: EstimationModeUI;
  commercialModel: 'FF' | 'TM';
  contingencyPct: number;
  roles: RateRole[];
  effortCells: { phaseKey: string; roleId: string; hours: number }[];
  directIntake: DirectIntakeState;
  /** Role-based data masking. Default 'full'. */
  visibility?: FinancialVisibility;
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function buildMatrix(roles: RateRole[], cells: DealEditorProps['effortCells']): EffortMatrixState {
  const m: EffortMatrixState = {};
  for (const p of PHASES) {
    const row: Record<string, number> = {};
    for (const r of roles) row[r.id] = 0;
    m[p.key] = row;
  }
  for (const c of cells) {
    const row = m[c.phaseKey];
    if (row && c.roleId in row) row[c.roleId] = c.hours;
  }
  return m;
}

function cellKey(phaseKey: string, roleId: string): string {
  return `${phaseKey}::${roleId}`;
}

export function DealEditor({
  projectId,
  canEdit,
  estimationMode,
  commercialModel,
  contingencyPct,
  roles,
  effortCells,
  directIntake,
  visibility = 'full',
}: DealEditorProps) {
  const canMargins = visibility !== 'restricted';
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [mode, setMode] = useState<EstimationModeUI>(estimationMode);
  const [modeBusy, setModeBusy] = useState(false);
  const [modeError, setModeError] = useState<string | null>(null);

  const [matrix, setMatrix] = useState<EffortMatrixState>(() => buildMatrix(roles, effortCells));
  const savedMatrixRef = useRef<EffortMatrixState>(buildMatrix(roles, effortCells));
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});

  // WP6 — CSV Ingestion: Effort Matrix hours import. Writes EffortCell rows
  // regardless of `mode`, but the trigger only appears in Matrix Mode since
  // that's the only view those rows are visible from.
  const [importOpen, setImportOpen] = useState(false);

  const [direct, setDirect] = useState<DirectIntakeState>(directIntake);
  const savedDirectRef = useRef<DirectIntakeState>(directIntake);
  const [directBusy, setDirectBusy] = useState(false);
  const [directError, setDirectError] = useState<string | null>(null);
  const directDirty =
    direct.soldHours !== savedDirectRef.current.soldHours ||
    direct.targetRevenue !== savedDirectRef.current.targetRevenue ||
    direct.blendedMarginPct !== savedDirectRef.current.blendedMarginPct;

  const sizingInput: SizingProjectInput = useMemo(
    () => ({
      estimationMode: mode === 'DIRECT' ? 'direct' : 'matrix',
      commercialModel: commercialModel === 'TM' ? 'tm' : 'ff',
      contingencyPct,
      effortCells: PHASES.flatMap((p) =>
        roles.map((r) => ({ phaseKey: p.key, roleId: r.id, hours: matrix[p.key]?.[r.id] ?? 0 }))
      ),
      directIntake: direct,
    }),
    [mode, commercialModel, contingencyPct, matrix, direct, roles]
  );
  const totals = computeTotalsFor(sizingInput, roles);

  function handleModeSwitch(next: EstimationModeUI) {
    if (!canEdit || next === mode || modeBusy) return;
    const prev = mode;
    setMode(next);
    setModeError(null);
    setModeBusy(true);
    startTransition(async () => {
      try {
        const result = await setEstimationMode({ projectId, mode: next });
        if (!result.ok) {
          setMode(prev);
          setModeError(result.error);
        } else {
          router.refresh();
        }
      } finally {
        setModeBusy(false);
      }
    });
  }

  function handleCellChange(phaseKey: string, roleId: string, hours: number) {
    setMatrix((prev) => ({ ...prev, [phaseKey]: { ...prev[phaseKey], [roleId]: hours } }));
  }

  function handleCellCommit(phaseKey: string, roleId: string) {
    if (!canEdit) return;
    const hours = matrix[phaseKey]?.[roleId] ?? 0;
    const saved = savedMatrixRef.current[phaseKey]?.[roleId] ?? 0;
    if (hours === saved) return;
    const key = cellKey(phaseKey, roleId);
    setSavingCells((prev) => new Set(prev).add(key));
    setCellErrors((prev) => {
      const { [key]: _drop, ...rest } = prev;
      return rest;
    });
    startTransition(async () => {
      try {
        const result = await updateEffortCell({ projectId, phaseKey, roleId, hours });
        if (!result.ok) {
          setCellErrors((prev) => ({ ...prev, [key]: result.error }));
          setMatrix((prev) => ({ ...prev, [phaseKey]: { ...prev[phaseKey], [roleId]: saved } }));
        } else {
          savedMatrixRef.current = { ...savedMatrixRef.current, [phaseKey]: { ...savedMatrixRef.current[phaseKey], [roleId]: hours } };
          router.refresh();
        }
      } finally {
        setSavingCells((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    });
  }

  function handleDirectSave() {
    if (!canEdit || directBusy) return;
    setDirectBusy(true);
    setDirectError(null);
    const snapshot = direct;
    startTransition(async () => {
      try {
        const result = await updateDirectIntake({ projectId, ...snapshot });
        if (!result.ok) {
          setDirectError(result.error);
        } else {
          savedDirectRef.current = snapshot;
          router.refresh();
        }
      } finally {
        setDirectBusy(false);
      }
    });
  }

  function handleDirectReset() {
    setDirect(savedDirectRef.current);
    setDirectError(null);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="card !p-0 overflow-hidden">
        <div className="flex border-b border-border">
          {(['MATRIX', 'DIRECT'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => handleModeSwitch(m)}
              disabled={!canEdit || modeBusy}
              className={clsx(
                'flex-1 px-4 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px disabled:cursor-not-allowed',
                mode === m
                  ? 'border-brand-hi text-ink bg-surface-2'
                  : 'border-transparent text-ink-muted hover:text-ink disabled:hover:text-ink-muted'
              )}
            >
              {m === 'MATRIX' ? 'Workstream Matrix Mode' : 'Direct Baseline Intake Mode'}
            </button>
          ))}
        </div>
        {modeError && <p className="text-critical text-xs px-4 py-2">{modeError}</p>}
        {!canEdit && (
          <p className="text-ink-faint text-xs px-4 py-2 border-t border-border/60">
            You have read-only access to this project&rsquo;s sizing.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card !p-4">
          <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1.5">Total Hours</div>
          <div className="text-2xl font-display font-bold tabular-nums">{totals.totalHours.toLocaleString('en-US')}</div>
        </div>
        <div className="card !p-4">
          <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1.5">Revenue</div>
          <div className="text-2xl font-display font-bold tabular-nums">{money(totals.revenue)}</div>
        </div>
        <div className="card !p-4">
          <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1.5">Cost</div>
          <div className="text-2xl font-display font-bold tabular-nums">
            <MaskedValue canView={canMargins} value={money(totals.cost)} />
          </div>
        </div>
        <div className="card !p-4">
          <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1.5">Sold Margin</div>
          <div className="text-2xl font-display font-bold tabular-nums">
            <MaskedValue canView={canMargins} value={`${totals.marginPct.toFixed(1)}%`} />
          </div>
          {canMargins && (
            <div className="text-[11px] text-ink-faint mt-1">Blended rate ${totals.blended.toFixed(2)}/hr</div>
          )}
        </div>
      </div>

      {mode === 'MATRIX' ? (
        <div className="card">
          <div className="flex items-start justify-between gap-3 mb-1">
            <h2 className="text-[15.5px] font-bold">Phase-Effort Matrix</h2>
            {canEdit && (
              <button type="button" className="btn-secondary !w-auto !py-1.5 px-3 text-xs" onClick={() => setImportOpen(true)}>
                Import CSV&hellip;
              </button>
            )}
          </div>
          <p className="text-[12.5px] text-ink-muted mb-4">
            Hours per delivery phase &times; role. Totals above recalculate as you type — commit a cell by tabbing or
            clicking away.
          </p>
          {roles.length === 0 ? (
            <p className="text-ink-muted text-sm">No rate-card roles configured for this org yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide border-b border-border">
                    <th className="py-2 pr-4">Phase</th>
                    {roles.map((r) => (
                      <th key={r.id} className="py-2 pr-4 text-right">
                        <span className="inline-flex items-center gap-1.5 justify-end">
                          {r.name}
                          <span
                            className={clsx(
                              'text-[9.5px] normal-case font-semibold rounded-full px-1.5 py-0.5',
                              r.employmentType === 'contractor' ? 'bg-warning-soft text-warning' : 'bg-na-soft text-na'
                            )}
                          >
                            {r.employmentType === 'contractor' ? 'Contractor' : 'FTE'}
                          </span>
                        </span>
                      </th>
                    ))}
                    <th className="py-2 pr-4 text-right">Phase Total</th>
                  </tr>
                </thead>
                <tbody>
                  {PHASES.map((p) => (
                    <tr key={p.key} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-4 font-semibold whitespace-nowrap">{p.name}</td>
                      {roles.map((r) => {
                        const key = cellKey(p.key, r.id);
                        const busy = savingCells.has(key);
                        const err = cellErrors[key];
                        return (
                          <td key={r.id} className="py-1.5 pr-4">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              inputMode="decimal"
                              className={clsx(
                                'input !w-24 text-right tabular-nums',
                                busy && 'opacity-60',
                                err && '!border-critical'
                              )}
                              value={matrix[p.key]?.[r.id] ?? 0}
                              disabled={!canEdit}
                              onChange={(e) => handleCellChange(p.key, r.id, Math.max(0, Number(e.target.value) || 0))}
                              onBlur={() => handleCellCommit(p.key, r.id)}
                            />
                            {err && <div className="text-critical text-[10.5px] mt-0.5 max-w-[7rem]">{err}</div>}
                          </td>
                        );
                      })}
                      <td className="py-2 pr-4 text-right tabular-nums font-semibold">
                        {(totals.phaseTotals[p.key] ?? 0).toLocaleString('en-US')}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide border-t border-border">
                    <th className="py-2 pr-4">Role Total</th>
                    {roles.map((r) => (
                      <th key={r.id} className="py-2 pr-4 text-right tabular-nums font-semibold text-ink">
                        {(totals.roleTotals[r.id] ?? 0).toLocaleString('en-US')}
                      </th>
                    ))}
                    <th className="py-2 pr-4 text-right tabular-nums font-semibold text-ink">
                      {totals.totalHours.toLocaleString('en-US')}
                    </th>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="card">
          <h2 className="text-[15.5px] font-bold mb-1">Direct Baseline Intake</h2>
          <p className="text-[12.5px] text-ink-muted mb-4">
            Bypass the Phase-Effort Matrix and state the deal&rsquo;s sold hours, target revenue, and blended margin
            directly.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-muted text-xs">Sold hours</span>
              <input
                type="number"
                min={0}
                className="input"
                value={direct.soldHours}
                disabled={!canEdit}
                onChange={(e) => setDirect((d) => ({ ...d, soldHours: Math.max(0, Number(e.target.value) || 0) }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-muted text-xs">Target revenue</span>
              <input
                type="number"
                min={0}
                className="input"
                value={direct.targetRevenue}
                disabled={!canEdit}
                onChange={(e) => setDirect((d) => ({ ...d, targetRevenue: Math.max(0, Number(e.target.value) || 0) }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-muted text-xs">Blended margin %</span>
              {canMargins ? (
                <input
                  type="number"
                  min={0}
                  max={99}
                  className="input"
                  value={direct.blendedMarginPct}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setDirect((d) => ({ ...d, blendedMarginPct: Math.max(0, Math.min(99, Number(e.target.value) || 0)) }))
                  }
                />
              ) : (
                <div className="input flex items-center">
                  <MaskedValue canView={false} value="••••" />
                </div>
              )}
            </label>
          </div>
          {canEdit && directDirty && (
            <div className="flex items-center gap-2 mt-4">
              <button type="button" className="btn-secondary !w-auto px-4 text-xs" disabled={directBusy} onClick={handleDirectSave}>
                {directBusy ? 'Saving…' : 'Save Direct Intake'}
              </button>
              <button
                type="button"
                className="text-ink-faint hover:text-ink text-xs"
                disabled={directBusy}
                onClick={handleDirectReset}
              >
                Discard changes
              </button>
            </div>
          )}
          {directError && <p className="text-critical text-xs mt-2">{directError}</p>}
        </div>
      )}

      {canMargins && <MarginModelerCard totals={totals} />}

      {importOpen && <CsvImportModal projectId={projectId} kind="effort" onClose={() => setImportOpen(false)} />}
    </div>
  );
}
