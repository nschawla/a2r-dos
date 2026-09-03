'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { pctLabel, CONCURRENCY_OVERLOAD_THRESHOLD, type BlendedCapacitySummary, type ResourceCapacityRow } from '@/lib/capacity-engine';
import { createHoliday, deleteHoliday, updateRolePolicy, createRolePolicy } from '@/server/actions/capacity';
import { useSafeAction } from '@/lib/client/safe-action';
import { useToast } from '@/components/ui/toast';
import { StatCard } from '@/components/ui/stat-card';

interface PracticeGroup {
  practice: string;
  summary: BlendedCapacitySummary;
  rows: ResourceCapacityRow[];
}
interface ConcurrencyRow {
  id: string;
  name: string;
  psPractice: string;
  projectCount: number;
  overloaded: boolean;
  projects: string[];
}
interface ForecastRow {
  id: string;
  name: string;
  psPractice: string;
  fte: number;
  weekly: number[];
}
interface HolidayRow {
  id: string;
  name: string;
  date: string;
}
interface PolicyRow {
  id: string;
  roleName: string;
  targetUtilPct: number;
  isBillableHead: boolean;
  headcount: number;
}

export interface CapacityCockpitProps {
  isAdmin: boolean;
  periodLabel: string;
  orgSummary: BlendedCapacitySummary;
  practices: PracticeGroup[];
  resourceRows: ResourceCapacityRow[];
  concurrencyRows: ConcurrencyRow[];
  forecastWeeks: string[];
  forecastRows: ForecastRow[];
  holidays: HolidayRow[];
  policies: PolicyRow[];
}

type TabKey = 'utilization' | 'concurrency' | 'forecast' | 'controls';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'utilization', label: 'Utilization & Attainment' },
  { key: 'concurrency', label: 'Concurrency Radar' },
  { key: 'forecast', label: '52-Week Forecast' },
  { key: 'controls', label: 'Policy & Holiday Controls' },
];

function attainmentTone(a: number): string {
  if (a >= 0.98) return 'text-success';
  if (a >= 0.85) return 'text-warning';
  return 'text-critical';
}

export function CapacityCockpit(props: CapacityCockpitProps) {
  const [tab, setTab] = useState<TabKey>('utilization');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1 border-b border-border flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={clsx(
              'px-3.5 py-2 text-[13px] font-semibold border-b-2 -mb-px transition-colors',
              tab === t.key ? 'border-brand text-ink' : 'border-transparent text-ink-muted hover:text-ink'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'utilization' && <UtilizationTab {...props} />}
      {tab === 'concurrency' && <ConcurrencyTab rows={props.concurrencyRows} />}
      {tab === 'forecast' && <ForecastTab weeks={props.forecastWeeks} rows={props.forecastRows} />}
      {tab === 'controls' && <ControlsTab isAdmin={props.isAdmin} holidays={props.holidays} policies={props.policies} />}
    </div>
  );
}

// ───────────────────────────────────────────── Tab 1 — Utilization & Attainment

function UtilizationTab({ periodLabel, orgSummary, practices, resourceRows }: CapacityCockpitProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Blended Billable Utilization" value={pctLabel(orgSummary.utilizationPct)} sub={`period ${periodLabel}`} />
        <StatCard
          label="Attainment vs. Plan"
          value={pctLabel(orgSummary.attainmentPct)}
          sub={`target ${pctLabel(orgSummary.targetUtilPct)}`}
          tone={attainmentTone(orgSummary.attainmentPct)}
        />
        <StatCard label="Billable Heads (FTE)" value={orgSummary.headcountFte.toFixed(1)} sub="excludes non-billable roles" />
        <StatCard
          label="Available vs. Billable Hrs"
          value={`${Math.round(orgSummary.billableHours).toLocaleString('en-US')}`}
          sub={`of ${Math.round(orgSummary.availableHours).toLocaleString('en-US')} available`}
        />
      </div>

      <div className="card">
        <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Practice Breakdown</div>
        <h2 className="text-[15.5px] font-bold mb-4">Plan vs. Actual by Practice</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide border-b border-border">
                <th className="py-2 pr-4">Practice</th>
                <th className="py-2 pr-4 text-right">Billable Heads</th>
                <th className="py-2 pr-4 text-right">Available Hrs</th>
                <th className="py-2 pr-4 text-right">Billable Hrs</th>
                <th className="py-2 pr-4 text-right">Target</th>
                <th className="py-2 pr-4 text-right">Actual</th>
                <th className="py-2 pr-4">Plan vs. Actual</th>
                <th className="py-2 pr-4 text-right">Attainment</th>
              </tr>
            </thead>
            <tbody>
              {practices.map((g) => (
                <tr key={g.practice} className="border-b border-border/60 last:border-0">
                  <td className="py-2.5 pr-4 font-semibold">{g.practice}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{g.summary.headcountFte.toFixed(1)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-ink-muted">
                    {Math.round(g.summary.availableHours).toLocaleString('en-US')}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{Math.round(g.summary.billableHours).toLocaleString('en-US')}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-ink-muted">{pctLabel(g.summary.targetUtilPct)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums font-semibold">{pctLabel(g.summary.utilizationPct)}</td>
                  <td className="py-2.5 pr-4 w-40">
                    <PlanVsActualBar target={g.summary.targetUtilPct} actual={g.summary.utilizationPct} />
                  </td>
                  <td className={clsx('py-2.5 pr-4 text-right tabular-nums font-semibold', attainmentTone(g.summary.attainmentPct))}>
                    {pctLabel(g.summary.attainmentPct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Roster</div>
        <h2 className="text-[15.5px] font-bold mb-4">Per-Resource Utilization</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide border-b border-border">
                <th className="py-2 pr-4">Resource</th>
                <th className="py-2 pr-4">Practice</th>
                <th className="py-2 pr-4 text-right">FTE</th>
                <th className="py-2 pr-4 text-right">Available Hrs</th>
                <th className="py-2 pr-4 text-right">Billable Hrs</th>
                <th className="py-2 pr-4 text-right">Target</th>
                <th className="py-2 pr-4 text-right">Actual</th>
                <th className="py-2 pr-4">Plan vs. Actual</th>
              </tr>
            </thead>
            <tbody>
              {resourceRows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2.5 pr-4 font-semibold">
                    {r.name}
                    {!r.isBillableHead && <span className="ml-2 badge !py-0.5 !px-1.5 text-[10px]">non-billable</span>}
                  </td>
                  <td className="py-2.5 pr-4 text-ink-muted">{r.psPractice}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{r.fte.toFixed(1)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-ink-muted">
                    {Math.round(r.availableHours).toLocaleString('en-US')}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{Math.round(r.billableHours).toLocaleString('en-US')}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-ink-muted">
                    {r.isBillableHead ? pctLabel(r.targetUtilPct) : '—'}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums font-semibold">
                    {r.isBillableHead ? pctLabel(r.utilizationPct) : '—'}
                  </td>
                  <td className="py-2.5 pr-4 w-40">
                    {r.isBillableHead ? <PlanVsActualBar target={r.targetUtilPct} actual={r.utilizationPct} /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-ink-faint mt-3">
          Available Hours = (weekdays − corporate holidays in the period, prorated by roster start/end) × 8 × FTE.
          Individual PTO does not reduce the denominator.
        </p>
      </div>
    </div>
  );
}

function PlanVsActualBar({ target, actual }: { target: number; actual: number }) {
  const scale = Math.max(1, target * 1.4, actual * 1.1);
  const actualPct = Math.min(100, (actual / scale) * 100);
  const targetPct = Math.min(100, (target / scale) * 100);
  const hit = actual >= target;
  return (
    <div className="relative h-3 rounded-full bg-surface-3 overflow-hidden" title={`actual ${pctLabel(actual)} / target ${pctLabel(target)}`}>
      <div className={clsx('absolute inset-y-0 left-0 rounded-full', hit ? 'bg-success' : 'bg-warning')} style={{ width: `${actualPct}%` }} />
      <div className="absolute inset-y-0 w-[2px] bg-ink" style={{ left: `${targetPct}%` }} />
    </div>
  );
}

// ─────────────────────────────────────────────────── Tab 2 — Concurrency Radar

function ConcurrencyTab({ rows }: { rows: ConcurrencyRow[] }) {
  const overloaded = rows.filter((r) => r.overloaded);
  const maxCount = Math.max(CONCURRENCY_OVERLOAD_THRESHOLD + 2, ...rows.map((r) => r.projectCount));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="On the Bench" value={String(rows.filter((r) => r.projectCount === 0).length)} sub="no active engagement" />
        <StatCard
          label="Avg. Concurrency"
          value={(rows.reduce((s, r) => s + r.projectCount, 0) / Math.max(1, rows.length)).toFixed(1)}
          sub="active engagements / person"
        />
        <StatCard
          label={`Overloaded ( > ${CONCURRENCY_OVERLOAD_THRESHOLD} )`}
          value={String(overloaded.length)}
          sub="concurrency alert"
          tone={overloaded.length > 0 ? 'text-critical' : undefined}
        />
      </div>

      <div className="card">
        <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Concurrency Radar</div>
        <h2 className="text-[15.5px] font-bold mb-4">Active Engagements per Resource</h2>
        <div className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 text-sm">
              <div className="w-40 flex-none truncate font-semibold">{r.name}</div>
              <div className="w-28 flex-none text-ink-faint text-xs truncate">{r.psPractice}</div>
              <div className="flex-1 h-4 rounded-full bg-surface-3 overflow-hidden relative">
                <div
                  className={clsx('h-full rounded-full', r.overloaded ? 'bg-critical' : r.projectCount >= 4 ? 'bg-warning' : 'bg-brand')}
                  style={{ width: `${(r.projectCount / maxCount) * 100}%` }}
                />
                <div className="absolute inset-y-0 bg-ink/40 w-px" style={{ left: `${(CONCURRENCY_OVERLOAD_THRESHOLD / maxCount) * 100}%` }} />
              </div>
              <div className="w-8 flex-none text-right tabular-nums font-semibold">{r.projectCount}</div>
              {r.overloaded && (
                <span className="badge bg-critical-soft text-critical !py-0.5 !px-2 text-[10px] flex-none">OVERLOAD</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {overloaded.length > 0 && (
        <div className="card border-critical/30">
          <div className="text-[11px] uppercase tracking-wide text-critical font-semibold mb-1">Overload Alerts</div>
          <h2 className="text-[15.5px] font-bold mb-3">Resources on more than {CONCURRENCY_OVERLOAD_THRESHOLD} engagements</h2>
          <ul className="flex flex-col gap-3">
            {overloaded.map((r) => (
              <li key={r.id} className="text-sm">
                <span className="font-semibold">{r.name}</span>{' '}
                <span className="text-ink-faint">· {r.projectCount} engagements</span>
                <div className="text-ink-muted text-xs mt-0.5">{r.projects.join(' · ') || '—'}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────── Tab 3 — 52-Week Forecast

function ForecastTab({ weeks, rows }: { weeks: string[]; rows: ForecastRow[] }) {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };
  const maxCell = Math.max(1, ...rows.flatMap((r) => r.weekly));

  function cellTone(h: number): string {
    if (h <= 0) return 'text-ink-faint';
    const ratio = h / maxCell;
    if (ratio > 0.66) return 'bg-brand/25 text-ink font-semibold';
    if (ratio > 0.33) return 'bg-brand/12 text-ink';
    return 'bg-brand/[0.06] text-ink-muted';
  }

  return (
    <div className="card">
      <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Forward Load</div>
      <h2 className="text-[15.5px] font-bold mb-1">52-Week Staffing Forecast</h2>
      <p className="text-[12px] text-ink-muted mb-4">Forecast hours per resource per ISO week — scroll horizontally.</p>
      <div className="overflow-x-auto">
        <table className="text-xs border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-surface-1 text-left py-2 pr-3 border-b border-border min-w-[160px]">Resource</th>
              <th className="text-right py-2 px-2 border-b border-border bg-surface-1">Total</th>
              {weeks.map((w) => (
                <th key={w} className="text-center py-2 px-1.5 border-b border-border font-mono text-[10px] text-ink-faint whitespace-nowrap min-w-[38px]">
                  {fmt(w)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const total = r.weekly.reduce((s, h) => s + h, 0);
              return (
                <tr key={r.id}>
                  <td className="sticky left-0 z-10 bg-surface-1 py-1.5 pr-3 border-b border-border/60 font-semibold whitespace-nowrap">
                    {r.name}
                    <span className="block text-[10px] text-ink-faint font-normal">{r.psPractice}</span>
                  </td>
                  <td className="text-right py-1.5 px-2 border-b border-border/60 tabular-nums font-semibold bg-surface-1">
                    {Math.round(total).toLocaleString('en-US')}
                  </td>
                  {r.weekly.map((h, i) => (
                    <td
                      key={i}
                      className={clsx('text-center py-1.5 px-1 border-b border-border/60 tabular-nums', cellTone(h))}
                    >
                      {h > 0 ? Math.round(h) : '·'}
                    </td>
                  ))}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td className="py-4 text-ink-muted" colSpan={weeks.length + 2}>
                  No forecast slots in the next 52 weeks.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ───────────────────────────────────────── Tab 4 — Policy & Holiday Controls

function ControlsTab({ isAdmin, holidays, policies }: { isAdmin: boolean; holidays: HolidayRow[]; policies: PolicyRow[] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <PolicyControls isAdmin={isAdmin} policies={policies} />
      <HolidayControls isAdmin={isAdmin} holidays={holidays} />
    </div>
  );
}

function PolicyControls({ isAdmin, policies }: { isAdmin: boolean; policies: PolicyRow[] }) {
  const router = useRouter();
  const runSafe = useSafeAction();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newTarget, setNewTarget] = useState('0.75');
  const [newBillable, setNewBillable] = useState(true);

  function save(id: string, targetUtilPct: number, isBillableHead: boolean) {
    setError(null);
    startTransition(async () => {
      const outcome = await runSafe(() => updateRolePolicy({ id, targetUtilPct, isBillableHead }), {
        errorTitle: 'Couldn’t save utilization policy',
      });
      if (!outcome.ok) return;
      const res = outcome.data;
      if (!res.ok) {
        setError(res.error);
        toast({ variant: 'error', title: 'Policy not saved', description: res.error });
        return;
      }
      toast({ variant: 'success', title: 'Utilization policy updated' });
      router.refresh();
    });
  }
  function add() {
    setError(null);
    const target = Number(newTarget);
    if (!newName.trim() || Number.isNaN(target)) {
      setError('Enter a role name and a target between 0 and 1.');
      return;
    }
    const roleName = newName.trim();
    startTransition(async () => {
      const outcome = await runSafe(
        () => createRolePolicy({ roleName, targetUtilPct: target, isBillableHead: newBillable }),
        { errorTitle: 'Couldn’t add utilization policy' }
      );
      if (!outcome.ok) return;
      const res = outcome.data;
      if (!res.ok) {
        setError(res.error);
        toast({ variant: 'error', title: 'Policy not added', description: res.error });
        return;
      }
      setNewName('');
      setNewTarget('0.75');
      setNewBillable(true);
      toast({ variant: 'success', title: `Utilization policy added for ${roleName}` });
      router.refresh();
    });
  }

  return (
    <div className="card">
      <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Role Targets</div>
      <h2 className="text-[15.5px] font-bold mb-3">Utilization Policy</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide border-b border-border">
              <th className="py-2 pr-3">Role</th>
              <th className="py-2 pr-3 text-right">Heads</th>
              <th className="py-2 pr-3 text-right">Target %</th>
              <th className="py-2 pr-3">Billable head</th>
              {isAdmin && <th className="py-2" />}
            </tr>
          </thead>
          <tbody>
            {policies.map((p) => (
              <PolicyRowEditor key={p.id} policy={p} isAdmin={isAdmin} pending={pending} onSave={save} />
            ))}
          </tbody>
        </table>
      </div>

      {isAdmin && (
        <div className="mt-4 pt-3 border-t border-border/60 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-ink-muted">New role</span>
            <input className="input !w-40" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Data Engineer" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-ink-muted">Target (0–1)</span>
            <input className="input !w-24" value={newTarget} onChange={(e) => setNewTarget(e.target.value)} />
          </label>
          <label className="flex items-center gap-1.5 text-xs pb-2">
            <input type="checkbox" checked={newBillable} onChange={(e) => setNewBillable(e.target.checked)} /> Billable
          </label>
          <button type="button" className="btn-secondary !w-auto px-4 text-xs" disabled={pending} onClick={add}>
            Add
          </button>
        </div>
      )}
      {error && <p className="text-critical text-xs mt-2">{error}</p>}
    </div>
  );
}

function PolicyRowEditor({
  policy,
  isAdmin,
  pending,
  onSave,
}: {
  policy: PolicyRow;
  isAdmin: boolean;
  pending: boolean;
  onSave: (id: string, target: number, billable: boolean) => void;
}) {
  const [target, setTarget] = useState(String(policy.targetUtilPct));
  const [billable, setBillable] = useState(policy.isBillableHead);
  const dirty = Number(target) !== policy.targetUtilPct || billable !== policy.isBillableHead;

  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className="py-2.5 pr-3 font-semibold">{policy.roleName}</td>
      <td className="py-2.5 pr-3 text-right tabular-nums text-ink-muted">{policy.headcount}</td>
      <td className="py-2.5 pr-3 text-right">
        {isAdmin ? (
          <input className="input !w-20 text-right" value={target} onChange={(e) => setTarget(e.target.value)} />
        ) : (
          <span className="tabular-nums">{pctLabel(policy.targetUtilPct)}</span>
        )}
      </td>
      <td className="py-2.5 pr-3">
        {isAdmin ? (
          <input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} />
        ) : policy.isBillableHead ? (
          'Yes'
        ) : (
          'No'
        )}
      </td>
      {isAdmin && (
        <td className="py-2.5 text-right">
          <button
            type="button"
            disabled={!dirty || pending || Number.isNaN(Number(target))}
            onClick={() => onSave(policy.id, Number(target), billable)}
            className="text-brand text-xs font-semibold disabled:opacity-40"
          >
            Save
          </button>
        </td>
      )}
    </tr>
  );
}

function HolidayControls({ isAdmin, holidays }: { isAdmin: boolean; holidays: HolidayRow[] }) {
  const router = useRouter();
  const runSafe = useSafeAction();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');

  function add() {
    setError(null);
    if (!name.trim() || !date) {
      setError('Enter a name and a date.');
      return;
    }
    const holidayName = name.trim();
    startTransition(async () => {
      const outcome = await runSafe(() => createHoliday({ name: holidayName, date }), {
        errorTitle: 'Couldn’t add holiday',
      });
      if (!outcome.ok) return;
      const res = outcome.data;
      if (!res.ok) {
        setError(res.error);
        toast({ variant: 'error', title: 'Holiday not added', description: res.error });
        return;
      }
      setName('');
      setDate('');
      toast({ variant: 'success', title: `Holiday added — ${holidayName}` });
      router.refresh();
    });
  }
  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const outcome = await runSafe(() => deleteHoliday(id), { errorTitle: 'Couldn’t remove holiday' });
      if (!outcome.ok) return;
      const res = outcome.data;
      if (!res.ok) {
        setError(res.error);
        toast({ variant: 'error', title: 'Holiday not removed', description: res.error });
        return;
      }
      toast({ variant: 'success', title: 'Holiday removed' });
      router.refresh();
    });
  }

  return (
    <div className="card">
      <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Calendar</div>
      <h2 className="text-[15.5px] font-bold mb-3">Corporate Holidays</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide border-b border-border">
              <th className="py-2 pr-3">Date</th>
              <th className="py-2 pr-3">Name</th>
              {isAdmin && <th className="py-2" />}
            </tr>
          </thead>
          <tbody>
            {holidays.map((h) => (
              <tr key={h.id} className="border-b border-border/60 last:border-0">
                <td className="py-2 pr-3 tabular-nums whitespace-nowrap">
                  {new Date(h.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                </td>
                <td className="py-2 pr-3">{h.name}</td>
                {isAdmin && (
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(h.id)}
                      className="text-critical text-xs font-semibold disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {holidays.length === 0 && (
              <tr>
                <td className="py-3 text-ink-muted" colSpan={3}>
                  No holidays configured.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isAdmin && (
        <div className="mt-4 pt-3 border-t border-border/60 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-ink-muted">Date</span>
            <input type="date" className="input !w-40" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-ink-muted">Name</span>
            <input className="input !w-44" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Founders' Day" />
          </label>
          <button type="button" className="btn-secondary !w-auto px-4 text-xs" disabled={pending} onClick={add}>
            Add
          </button>
        </div>
      )}
      {error && <p className="text-critical text-xs mt-2">{error}</p>}
    </div>
  );
}

