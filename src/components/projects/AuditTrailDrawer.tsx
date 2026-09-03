'use client';

/**
 * WP6 — the immutable Audit Trail's UI. A slide-over
 * drawer (same visual pattern as HelpDrawer and RaidBoard's Quick-Add
 * drawer), triggered from ProjectHeader. Data is fetched on open via
 * `fetchAuditTrail` rather than being part of every module page's SSR
 * fetch — most page loads never open this drawer, so there's no reason to
 * pay for the query on every render of five different pages.
 */
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { fetchAuditTrail, type AuditTrailEntry } from '@/server/actions/audit-log';

const ACTION_META: Record<string, { label: string; tone: string }> = {
  BASELINE_LOCKED: { label: 'Baseline Locked', tone: 'bg-na-soft text-na' },
  BASELINE_UNLOCKED: { label: 'Baseline Unlocked', tone: 'bg-na-soft text-na' },
  EAC_ACTUAL_UPDATED: { label: 'EAC Actuals Updated', tone: 'bg-na-soft text-na' },
  RAID_ESCALATED: { label: 'RAID Escalated', tone: 'bg-warning-soft text-warning' },
  RAID_UNESCALATED: { label: 'RAID Un-escalated', tone: 'bg-na-soft text-na' },
  AUDIT_SCORE_CHANGED: { label: 'Audit Score Changed', tone: 'bg-success-soft text-success' },
  CSV_IMPORT_COMMITTED: { label: 'CSV Import Committed', tone: 'bg-na-soft text-na' },
  WORKSPACE_RESTORED: { label: 'Workspace Restored', tone: 'bg-critical-soft text-critical' },
  WORKSPACE_EXPORTED: { label: 'Workspace Exported', tone: 'bg-na-soft text-na' },
};

function actionMeta(action: string) {
  return ACTION_META[action] ?? { label: action, tone: 'bg-na-soft text-na' };
}

/** Best-effort field-level diff for the common case (both states are
 * plain flat-ish objects) — falls back to raw JSON blocks for anything
 * else (arrays, primitives, deeply nested import summaries). */
function DiffView({ previous, next }: { previous: unknown; next: unknown }) {
  const bothPlainObjects =
    previous !== null &&
    next !== null &&
    typeof previous === 'object' &&
    typeof next === 'object' &&
    !Array.isArray(previous) &&
    !Array.isArray(next);

  if (!bothPlainObjects) {
    return (
      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
        <pre className="bg-surface-2 rounded-sm p-2 overflow-x-auto whitespace-pre-wrap break-words">
          {previous == null ? '—' : JSON.stringify(previous, null, 2)}
        </pre>
        <pre className="bg-surface-2 rounded-sm p-2 overflow-x-auto whitespace-pre-wrap break-words">
          {next == null ? '—' : JSON.stringify(next, null, 2)}
        </pre>
      </div>
    );
  }

  const prevObj = (previous ?? {}) as Record<string, unknown>;
  const nextObj = (next ?? {}) as Record<string, unknown>;
  const keys = Array.from(new Set([...Object.keys(prevObj), ...Object.keys(nextObj)])).filter(
    (k) => JSON.stringify(prevObj[k]) !== JSON.stringify(nextObj[k])
  );

  if (keys.length === 0) return <p className="text-ink-faint text-[11px]">No field-level changes recorded.</p>;

  return (
    <ul className="flex flex-col gap-1 text-[11.5px]">
      {keys.map((k) => (
        <li key={k} className="flex gap-2">
          <span className="text-ink-faint font-mono flex-none">{k}</span>
          <span className="text-ink-muted font-mono">{prevObj[k] === undefined ? '—' : JSON.stringify(prevObj[k])}</span>
          <span className="text-ink-faint">&rarr;</span>
          <span className="font-mono font-semibold">{nextObj[k] === undefined ? '—' : JSON.stringify(nextObj[k])}</span>
        </li>
      ))}
    </ul>
  );
}

export function AuditTrailDrawer({ projectId, open, onClose }: { projectId: string; open: boolean; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<AuditTrailEntry[]>([]);
  const [actionFilter, setActionFilter] = useState<string>('ALL');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAuditTrail(projectId).then((result) => {
      if (cancelled) return;
      if (!result.ok) setError(result.error);
      else setEntries(result.entries);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  if (!open) return null;

  const availableActions = Array.from(new Set(entries.map((e) => e.action)));
  const filtered = actionFilter === 'ALL' ? entries : entries.filter((e) => e.action === actionFilter);

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-lg bg-surface-1 border-l border-border-soft shadow-elevated overflow-y-auto">
        <div className="sticky top-0 bg-surface-1 border-b border-border px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Governance</div>
            <h2 className="text-lg font-display font-bold">Audit Trail</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close audit trail"
            className="w-7 h-7 flex-none rounded-sm border border-border-soft text-ink-muted hover:text-ink hover:border-ink-faint flex items-center justify-center"
            type="button"
          >
            &times;
          </button>
        </div>

        {availableActions.length > 0 && (
          <div className="px-6 pt-4 flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setActionFilter('ALL')}
              className={clsx(
                'text-[11px] font-semibold rounded-full px-2.5 py-1 border transition-colors',
                actionFilter === 'ALL' ? 'border-brand/40 bg-brand/10 text-brand' : 'border-border-soft text-ink-faint hover:text-ink'
              )}
            >
              All
            </button>
            {availableActions.map((a) => {
              const meta = actionMeta(a);
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => setActionFilter(a)}
                  className={clsx(
                    'text-[11px] font-semibold rounded-full px-2.5 py-1 border transition-colors',
                    actionFilter === a ? 'border-brand/40 bg-brand/10 text-brand' : 'border-border-soft text-ink-faint hover:text-ink'
                  )}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
        )}

        <div className="px-6 py-5 flex flex-col gap-3">
          {loading && <p className="text-ink-muted text-sm">Loading…</p>}
          {error && <p className="text-critical text-sm">{error}</p>}
          {!loading && !error && filtered.length === 0 && (
            <p className="text-ink-muted text-sm">No governance events logged for this project yet.</p>
          )}
          {filtered.map((e) => {
            const meta = actionMeta(e.action);
            return (
              <div key={e.id} className="bg-surface-2 rounded-sm px-3.5 py-3 flex flex-col gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={clsx('text-[11px] font-semibold rounded-full px-2.5 py-1', meta.tone)}>{meta.label}</span>
                  <span className="text-ink-faint text-[11px] font-mono">{e.entityType}{e.entityId ? ` · ${e.entityId}` : ''}</span>
                  <span className="text-ink-faint text-[11px] ml-auto">{new Date(e.createdAt).toLocaleString()}</span>
                </div>
                <p className="text-ink-muted text-xs">{e.userName ?? 'Unknown user'}</p>
                <DiffView previous={e.previousState} next={e.newState} />
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
