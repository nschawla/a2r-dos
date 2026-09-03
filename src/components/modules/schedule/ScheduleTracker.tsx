'use client';

/**
 * Schedule & Milestone Tracker.
 *
 * Replaces the Schedule page's static table with an editable one: date
 * pickers for Planned Start/End and Actual/Forecast Start/End (the schema
 * has no separate forecast columns — see updateSchedulePhase's comment —
 * so actualStart/actualEnd double as the forecast fields until a phase
 * genuinely finishes), a 0-100% Complete slider, and a status select, with
 * Slip and Pace Risk both recomputed live client-side via the WP2 engine
 * (`computePhaseSlipDays` / `computePhasePace`) on every edit — no server
 * round-trip needed to see the badge change. A row saves its whole draft
 * atomically via the `updateSchedulePhase` Server Action.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { PHASES } from '@/lib/constants';
import {
  computePhasePace,
  computePhaseSlipDays,
  type PaceState,
  type SlipSeverity,
} from '@/lib/calculations/schedule';
import type { ScheduleTolerances } from '@/lib/calculations/types';
import { updateSchedulePhase } from '@/server/actions/schedule';

type ScheduleStatus = 'NOTSTARTED' | 'INPROGRESS' | 'COMPLETE' | 'DELAYED';

export interface SchedulePhaseView {
  phaseKey: string;
  plannedStart: string; // yyyy-mm-dd or ''
  plannedEnd: string;
  actualStart: string;
  actualEnd: string;
  pctComplete: number;
  status: ScheduleStatus;
}

export interface ScheduleTrackerProps {
  projectId: string;
  canEdit: boolean;
  phases: SchedulePhaseView[];
  tolerances: ScheduleTolerances;
}

const STATUS_COLOR: Record<ScheduleStatus, string> = {
  NOTSTARTED: 'bg-na-soft text-na',
  INPROGRESS: 'bg-brand-hi/10 text-brand-hi',
  COMPLETE: 'bg-success-soft text-success',
  DELAYED: 'bg-critical-soft text-critical',
};

const SLIP_TONE: Record<SlipSeverity, string> = {
  unknown: 'text-ink-faint',
  onTrack: 'text-ink-muted',
  slip: 'text-ink-muted',
  warning: 'text-warning',
  critical: 'text-critical',
};

const PACE_META: Record<PaceState, { label: string; tone: string }> = {
  unknown: { label: '—', tone: 'text-ink-faint' },
  complete: { label: 'Complete', tone: 'text-ink-faint' },
  notStarted: { label: 'Not started', tone: 'text-ink-faint' },
  onPace: { label: 'Healthy', tone: 'text-success' },
  warning: { label: 'Pace Warning', tone: 'text-warning' },
  critical: { label: 'Critical Pace Risk', tone: 'text-critical' },
};

export function ScheduleTracker({ projectId, canEdit, phases, tolerances }: ScheduleTrackerProps) {
  const phaseByKey = new Map(phases.map((p) => [p.phaseKey, p]));

  return (
    <div className="card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide border-b border-border">
              <th className="py-2 pr-4">Phase</th>
              <th className="py-2 pr-4">Planned Start</th>
              <th className="py-2 pr-4">Planned End</th>
              <th className="py-2 pr-4">Actual/Forecast Start</th>
              <th className="py-2 pr-4">Actual/Forecast End</th>
              <th className="py-2 pr-4">% Complete</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Slip</th>
              <th className="py-2 pr-4">Pace Risk</th>
              {canEdit && <th className="py-2 pr-4" />}
            </tr>
          </thead>
          <tbody>
            {PHASES.map((p) => {
              const phase =
                phaseByKey.get(p.key) ??
                ({ phaseKey: p.key, plannedStart: '', plannedEnd: '', actualStart: '', actualEnd: '', pctComplete: 0, status: 'NOTSTARTED' } as SchedulePhaseView);
              return (
                <PhaseRow key={p.key} projectId={projectId} canEdit={canEdit} label={p.name} initial={phase} tolerances={tolerances} />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PhaseRow({
  projectId,
  canEdit,
  label,
  initial,
  tolerances,
}: {
  projectId: string;
  canEdit: boolean;
  label: string;
  initial: SchedulePhaseView;
  tolerances: ScheduleTolerances;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    draft.plannedStart !== saved.plannedStart ||
    draft.plannedEnd !== saved.plannedEnd ||
    draft.actualStart !== saved.actualStart ||
    draft.actualEnd !== saved.actualEnd ||
    draft.pctComplete !== saved.pctComplete ||
    draft.status !== saved.status;

  const slip = computePhaseSlipDays(draft.plannedEnd || null, draft.actualEnd || null, tolerances);
  const pace = computePhasePace(draft.plannedStart || null, draft.plannedEnd || null, draft.pctComplete, {
    status: draft.status.toLowerCase(),
  });
  const paceMeta = PACE_META[pace.state];

  function patch(next: Partial<SchedulePhaseView>) {
    if (!canEdit) return;
    setDraft((d) => ({ ...d, ...next }));
  }

  function handleSave() {
    if (!canEdit || busy) return;
    setBusy(true);
    setError(null);
    const snapshot = draft;
    startTransition(async () => {
      try {
        const result = await updateSchedulePhase({ projectId, ...snapshot });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setSaved(snapshot);
        router.refresh();
      } finally {
        setBusy(false);
      }
    });
  }

  function handleDiscard() {
    setDraft(saved);
    setError(null);
  }

  return (
    <tr className="border-b border-border/60 last:border-0 align-top">
      <td className="py-2.5 pr-4 font-semibold whitespace-nowrap">{label}</td>
      <td className="py-1.5 pr-4">
        <input
          type="date"
          className="input !w-36"
          value={draft.plannedStart}
          disabled={!canEdit}
          onChange={(e) => patch({ plannedStart: e.target.value })}
        />
      </td>
      <td className="py-1.5 pr-4">
        <input
          type="date"
          className="input !w-36"
          value={draft.plannedEnd}
          disabled={!canEdit}
          onChange={(e) => patch({ plannedEnd: e.target.value })}
        />
      </td>
      <td className="py-1.5 pr-4">
        <input
          type="date"
          className="input !w-36"
          value={draft.actualStart}
          disabled={!canEdit}
          onChange={(e) => patch({ actualStart: e.target.value })}
        />
      </td>
      <td className="py-1.5 pr-4">
        <input
          type="date"
          className="input !w-36"
          value={draft.actualEnd}
          disabled={!canEdit}
          onChange={(e) => patch({ actualEnd: e.target.value })}
        />
      </td>
      <td className="py-1.5 pr-4">
        <div className="flex items-center gap-2 w-40">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={draft.pctComplete}
            disabled={!canEdit}
            onChange={(e) => patch({ pctComplete: Number(e.target.value) })}
            className="flex-1 accent-brand-hi"
          />
          <span className="tabular-nums text-xs w-9 text-right">{draft.pctComplete}%</span>
        </div>
      </td>
      <td className="py-1.5 pr-4">
        <select
          className={clsx('text-xs font-semibold rounded-full px-2.5 py-1 border-0 outline-none', STATUS_COLOR[draft.status])}
          value={draft.status}
          disabled={!canEdit}
          onChange={(e) => patch({ status: e.target.value as ScheduleStatus })}
        >
          <option value="NOTSTARTED">Not started</option>
          <option value="INPROGRESS">In progress</option>
          <option value="COMPLETE">Complete</option>
          <option value="DELAYED">Delayed</option>
        </select>
      </td>
      <td className={clsx('py-2.5 pr-4 tabular-nums font-semibold', SLIP_TONE[slip.severity])}>
        {slip.slipDays === null ? '—' : `${slip.slipDays}d`}
      </td>
      <td className={clsx('py-2.5 pr-4 font-semibold', paceMeta.tone)}>
        {paceMeta.label}
        {pace.elapsedPct !== null ? <span className="text-ink-faint font-normal"> · {Math.round(pace.elapsedPct)}% elapsed</span> : null}
      </td>
      {canEdit && (
        <td className="py-1.5 pr-4">
          {dirty && (
            <div className="flex items-center gap-2">
              <button type="button" className="btn-secondary !w-auto !py-1.5 px-3 text-xs" disabled={busy} onClick={handleSave}>
                {busy ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="text-ink-faint hover:text-ink text-xs" disabled={busy} onClick={handleDiscard}>
                Discard
              </button>
            </div>
          )}
          {error && <div className="text-critical text-[10.5px] mt-1">{error}</div>}
        </td>
      )}
    </tr>
  );
}
