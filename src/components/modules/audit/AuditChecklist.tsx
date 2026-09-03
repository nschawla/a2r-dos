'use client';

/**
 * Control Audit Checklist.
 *
 * Replaces audit-row.tsx's plain select-per-row list with interactive
 * cards: a 4-state response selector (Yes/Partial/No/N-A) whose click
 * instantly recomputes the weighted compliance score client-side via the
 * WP2 engine's `computeAuditProgress` (score is lifted to the parent so it
 * reflects every card's *pending* state, not just what's been saved), plus
 * an evidence URL input and a verification-notes field that save together
 * with the status on a per-card "Save" action — same dirty-check + Save
 * button convention as the rest of the app's inline editors.
 */
import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { CONTROL_DEFS } from '@/lib/constants';
import { computeAuditProgress, type AuditProgress } from '@/lib/calculations/audit';
import type { AuditStatus as CalcAuditStatus } from '@/lib/calculations/types';
import { updateAuditEntry } from '@/server/actions/audit';
import { ControlGuidanceButton } from '@/components/audit/ControlGuidance';

type UiStatus = 'YES' | 'PARTIAL' | 'NO' | 'NA';

const STATUS_META: Record<UiStatus, { label: string; score: string; tone: string; toneActive: string }> = {
  YES: { label: 'Yes', score: '1.0', tone: 'border-border-soft text-ink-muted hover:text-success', toneActive: 'border-success bg-success-soft text-success' },
  PARTIAL: { label: 'Partial', score: '0.5', tone: 'border-border-soft text-ink-muted hover:text-warning', toneActive: 'border-warning bg-warning-soft text-warning' },
  NO: { label: 'No', score: '0.0', tone: 'border-border-soft text-ink-muted hover:text-critical', toneActive: 'border-critical bg-critical-soft text-critical' },
  NA: { label: 'N/A', score: 'excl.', tone: 'border-border-soft text-ink-muted hover:text-na', toneActive: 'border-na bg-na-soft text-na' },
};

const STATUS_TO_CALC: Record<UiStatus, CalcAuditStatus> = { YES: 'yes', PARTIAL: 'partial', NO: 'no', NA: 'na' };

export interface AuditEntryEditorInput {
  controlKey: string;
  label: string;
  why: string;
  status: UiStatus;
  owner: string;
  repoLink: string;
  notes: string;
  updatedAt: string | null;
}

export interface AuditChecklistProps {
  projectId: string;
  canEdit: boolean;
  entries: AuditEntryEditorInput[];
}

export function AuditChecklist({ projectId, canEdit, entries }: AuditChecklistProps) {
  const [statuses, setStatuses] = useState<Record<string, UiStatus>>(() =>
    Object.fromEntries(entries.map((e) => [e.controlKey, e.status]))
  );

  const progress: AuditProgress = useMemo(() => {
    const input = CONTROL_DEFS.map((c) => ({
      controlKey: c.id,
      status: STATUS_TO_CALC[statuses[c.id] ?? 'NO'],
    }));
    return computeAuditProgress(input);
  }, [statuses]);

  return (
    <div className="flex flex-col gap-4">
      <div className="card !p-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Weighted Compliance</div>
          <div className="text-2xl font-display font-bold tabular-nums">{progress.pct}%</div>
        </div>
        <div className="flex gap-4 text-xs text-ink-muted">
          <span>
            <span className="text-success font-semibold">{progress.counts.yes}</span> yes
          </span>
          <span>
            <span className="text-warning font-semibold">{progress.counts.partial}</span> partial
          </span>
          <span>
            <span className="text-critical font-semibold">{progress.counts.no}</span> no
          </span>
          <span>
            <span className="text-na font-semibold">{progress.counts.na}</span> n/a
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {entries.map((e) => (
          <AuditControlCard
            key={e.controlKey}
            projectId={projectId}
            canEdit={canEdit}
            entry={e}
            onStatusChange={(status) => setStatuses((prev) => ({ ...prev, [e.controlKey]: status }))}
          />
        ))}
      </div>
    </div>
  );
}

function AuditControlCard({
  projectId,
  canEdit,
  entry,
  onStatusChange,
}: {
  projectId: string;
  canEdit: boolean;
  entry: AuditEntryEditorInput;
  onStatusChange: (status: UiStatus) => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const savedRef = useRef(entry);
  const [status, setStatus] = useState<UiStatus>(entry.status);
  const [owner, setOwner] = useState(entry.owner);
  const [repoLink, setRepoLink] = useState(entry.repoLink);
  const [notes, setNotes] = useState(entry.notes);
  const [updatedAt, setUpdatedAt] = useState(entry.updatedAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    status !== savedRef.current.status ||
    owner !== savedRef.current.owner ||
    repoLink !== savedRef.current.repoLink ||
    notes !== savedRef.current.notes;

  function handleStatusClick(next: UiStatus) {
    if (!canEdit) return;
    setStatus(next);
    onStatusChange(next);
  }

  function handleSave() {
    if (!canEdit || busy) return;
    setBusy(true);
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateAuditEntry({ projectId, controlKey: entry.controlKey, status, owner, repoLink, notes });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        savedRef.current = { ...entry, status, owner, repoLink, notes, updatedAt: result.updatedAt };
        setUpdatedAt(result.updatedAt);
        router.refresh();
      } finally {
        setBusy(false);
      }
    });
  }

  function handleDiscard() {
    const saved = savedRef.current;
    setStatus(saved.status);
    setOwner(saved.owner);
    setRepoLink(saved.repoLink);
    setNotes(saved.notes);
    onStatusChange(saved.status);
    setError(null);
  }

  return (
    <div className="bg-surface-2 rounded-sm px-3.5 py-3 flex flex-col gap-2.5">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-mono text-[10.5px] text-ink-faint">{entry.controlKey}</span>
        <span className="font-semibold text-sm flex items-center gap-1.5 flex-1 min-w-[180px]">
          {entry.label}
          <ControlGuidanceButton controlKey={entry.controlKey} label={entry.label} />
        </span>
        <div className="flex gap-1.5">
          {(Object.keys(STATUS_META) as UiStatus[]).map((s) => {
            const meta = STATUS_META[s];
            const active = status === s;
            return (
              <button
                key={s}
                type="button"
                disabled={!canEdit}
                onClick={() => handleStatusClick(s)}
                title={`Score: ${meta.score}`}
                className={clsx(
                  'text-[11px] font-semibold rounded-full px-2.5 py-1 border transition-colors disabled:cursor-not-allowed',
                  active ? meta.toneActive : meta.tone
                )}
              >
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-ink-faint text-xs">{entry.why}</p>
      <div className="flex gap-2 flex-wrap">
        <input
          className="input flex-1 min-w-[140px]"
          placeholder="Owner"
          value={owner}
          disabled={!canEdit}
          onChange={(e) => setOwner(e.target.value)}
        />
        <input
          className="input flex-1 min-w-[200px]"
          placeholder="Evidence URL"
          value={repoLink}
          disabled={!canEdit}
          onChange={(e) => setRepoLink(e.target.value)}
        />
      </div>
      <textarea
        className="input min-h-[56px]"
        placeholder="Verification notes — e.g. confirmed with client counsel on 3/1, awaiting a signed copy…"
        value={notes}
        disabled={!canEdit}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-ink-faint text-[10.5px]">
          {updatedAt ? `Last verified ${new Date(updatedAt).toLocaleString()}` : 'Never verified'}
        </span>
        {canEdit && dirty && (
          <div className="flex items-center gap-2">
            <button className="btn-secondary !w-auto !py-1.5 px-3 text-xs" disabled={busy} onClick={handleSave} type="button">
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button className="text-ink-faint hover:text-ink text-xs" disabled={busy} onClick={handleDiscard} type="button">
              Discard
            </button>
          </div>
        )}
      </div>
      {error && <p className="text-critical text-xs">{error}</p>}
    </div>
  );
}
