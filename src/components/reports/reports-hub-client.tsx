'use client';

/**
 * WP7 — Executive Reporting Hub client shell: the project selector, the
 * three report launcher cards, and the embedded SteerCo Decision & Action
 * Tracker manager. Mirrors RaidBoard.tsx's conventions (useTransition +
 * router.refresh() around each Server Action call, inline add form, per-row
 * status toggle) since a SteerCo decision is, mechanically, another small
 * per-project record — see steerco.ts's own doc comment on what's actually
 * different about it.
 *
 * The three launcher routes are opened via `window.open(path, '_blank', …)`
 * exactly like ProjectHeader.tsx's existing "Export Status Report" / "Export
 * JSON Package" buttons — each route sets `Content-Disposition` itself
 * (attachment for the CSV, inline HTML for the two print views), so this
 * component doesn't need to know which behavior each one has.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  createSteerCoDecision,
  updateSteerCoDecisionStatus,
  deleteSteerCoDecision,
  type SteerCoDecisionView,
} from '@/server/actions/steerco';
import type { HealthCode } from '@/lib/calculations/types';

export interface ReportsProjectView {
  id: string;
  name: string;
  client: string | null;
  healthCode: HealthCode;
}

export interface ReportsHubClientProps {
  projects: ReportsProjectView[];
  selectedProjectId: string | null;
  selectedProjectLocked: boolean | null;
  canEdit: boolean;
  decisions: SteerCoDecisionView[];
  decisionsError: string | null;
  resources: { id: string; name: string }[];
}

const HEALTH_DOT: Record<HealthCode, string> = { G: 'bg-success', Y: 'bg-warning', R: 'bg-critical' };

function openReport(path: string) {
  window.open(path, '_blank', 'noopener,noreferrer');
}

export function ReportsHubClient({
  projects,
  selectedProjectId,
  selectedProjectLocked,
  canEdit,
  decisions,
  decisionsError,
  resources,
}: ReportsHubClientProps) {
  const router = useRouter();
  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;

  function handleSelect(id: string) {
    router.push(id ? `/reports?project=${id}` : '/reports');
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="card !p-4 flex items-center gap-4 flex-wrap">
        <div className="min-w-[220px]">
          <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Engagement</div>
          {projects.length === 0 ? (
            <p className="text-ink-muted text-sm">No engagements in your scope yet.</p>
          ) : (
            <select className="input !w-auto min-w-[260px]" value={selectedProjectId ?? ''} onChange={(e) => handleSelect(e.target.value)}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.client ? ` — ${p.client}` : ''}
                </option>
              ))}
            </select>
          )}
        </div>
        {selectedProject && (
          <div className="flex items-center gap-1.5 text-sm text-ink-muted">
            <span className={clsx('status-dot', HEALTH_DOT[selectedProject.healthCode])} />
            {selectedProjectLocked ? 'Baseline locked' : 'Baseline not locked'}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <LauncherCard
          eyebrow="16:9 Print / PDF"
          title="SteerCo Status Deck"
          desc="Flight Path Variance, Open Demand & Contractor Burn exposure, top escalated RAID risks, and the Decision Tracker — one steering-committee-ready slide."
          disabled={!selectedProjectId}
          onLaunch={() => selectedProjectId && openReport(`/api/projects/${selectedProjectId}/status-report`)}
        />
        <LauncherCard
          eyebrow="Multi-Project CSV"
          title="Portfolio Margin Rollup"
          desc="Sold vs. EAC margin, drift (bps), burn-to-date, and open resource-demand exposure across every engagement in your scope."
          disabled={false}
          onLaunch={() => openReport('/api/reports/portfolio-csv')}
        />
        <LauncherCard
          eyebrow="Compliance Certificate"
          title="Stage-Gate Audit Certificate"
          desc="A print-ready verification certificate summarizing every delivery control, its status, owner, and verification timestamp."
          disabled={!selectedProjectId}
          onLaunch={() => selectedProjectId && openReport(`/api/projects/${selectedProjectId}/audit-certificate`)}
        />
      </div>

      {selectedProjectId && (
        <DecisionTracker
          projectId={selectedProjectId}
          canEdit={canEdit}
          decisions={decisions}
          decisionsError={decisionsError}
          resources={resources}
        />
      )}
    </div>
  );
}

function LauncherCard({
  eyebrow,
  title,
  desc,
  disabled,
  onLaunch,
}: {
  eyebrow: string;
  title: string;
  desc: string;
  disabled: boolean;
  onLaunch: () => void;
}) {
  return (
    <div className="card flex flex-col gap-2">
      <div className="text-[10.5px] uppercase tracking-wide text-brand-hi font-semibold">{eyebrow}</div>
      <h3 className="text-[15px] font-bold">{title}</h3>
      <p className="text-[12.5px] text-ink-muted flex-1">{desc}</p>
      <button
        type="button"
        disabled={disabled}
        onClick={onLaunch}
        className="btn-secondary !w-auto self-start px-4 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
        title={disabled ? 'Select an engagement first' : undefined}
      >
        Generate
      </button>
    </div>
  );
}

const STATUS_LABEL: Record<SteerCoDecisionView['status'], string> = { OPEN: 'Open', RESOLVED: 'Resolved' };

function DecisionTracker({
  projectId,
  canEdit,
  decisions,
  decisionsError,
  resources,
}: {
  projectId: string;
  canEdit: boolean;
  decisions: SteerCoDecisionView[];
  decisionsError: string | null;
  resources: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [decisionRequired, setDecisionRequired] = useState('');
  const [decisionOwnerId, setDecisionOwnerId] = useState('');
  const [resolutionTargetDate, setResolutionTargetDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openCount = decisions.filter((d) => d.status === 'OPEN').length;

  function handleAdd() {
    if (!decisionRequired.trim()) {
      setError('Describe the decision being asked of the steering committee.');
      return;
    }
    setBusy(true);
    setError(null);
    startTransition(async () => {
      try {
        const result = await createSteerCoDecision({ projectId, decisionRequired, decisionOwnerId, resolutionTargetDate });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setDecisionRequired('');
        setDecisionOwnerId('');
        setResolutionTargetDate('');
        setAdding(false);
        router.refresh();
      } finally {
        setBusy(false);
      }
    });
  }

  function handleToggleStatus(d: SteerCoDecisionView) {
    if (!canEdit) return;
    const next = d.status === 'OPEN' ? 'RESOLVED' : 'OPEN';
    startTransition(async () => {
      const result = await updateSteerCoDecisionStatus({ id: d.id, projectId, status: next, resolutionNotes: d.resolutionNotes ?? '' });
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function handleDelete(id: string) {
    if (!canEdit) return;
    startTransition(async () => {
      const result = await deleteSteerCoDecision({ id, projectId });
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-[15.5px] font-bold">SteerCo Decision & Action Tracker</h2>
          <p className="text-[12.5px] text-ink-muted mt-0.5">
            {openCount} open decision{openCount === 1 ? '' : 's'} awaiting steering committee resolution — feeds the Decision
            Tracker table on the SteerCo Status Deck.
          </p>
        </div>
        {canEdit && (
          <button type="button" className="btn-secondary !w-auto px-4 text-xs" onClick={() => setAdding((v) => !v)}>
            {adding ? 'Cancel' : '+ Add decision'}
          </button>
        )}
      </div>

      {decisionsError && <p className="text-critical text-xs">{decisionsError}</p>}

      {adding && canEdit && (
        <div className="bg-surface-2 rounded-sm p-3 flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-ink-muted">Decision required</span>
            <textarea
              className="input min-h-[56px]"
              value={decisionRequired}
              onChange={(e) => setDecisionRequired(e.target.value)}
              placeholder="e.g. Approve change order #4 for the reporting expansion"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-ink-muted">Decision owner</span>
              <select className="input" value={decisionOwnerId} onChange={(e) => setDecisionOwnerId(e.target.value)}>
                <option value="">Unassigned</option>
                {resources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-ink-muted">Resolution target date</span>
              <input
                className="input"
                type="date"
                value={resolutionTargetDate}
                onChange={(e) => setResolutionTargetDate(e.target.value)}
              />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary !w-auto px-4 text-xs" disabled={busy} onClick={handleAdd}>
              {busy ? 'Adding…' : 'Add decision'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-critical text-xs">{error}</p>}

      {decisions.length === 0 ? (
        <p className="text-ink-muted text-sm">No SteerCo decisions logged for this engagement yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {decisions.map((d) => (
            <li key={d.id} className="bg-surface-2 rounded-sm px-3.5 py-3 flex items-start gap-3 flex-wrap">
              <span className={clsx('badge', d.status === 'OPEN' ? 'bg-warning-soft text-warning' : 'bg-success-soft text-success')}>
                {STATUS_LABEL[d.status]}
              </span>
              <div className="flex-1 min-w-[200px]">
                <p className="text-sm font-semibold">{d.decisionRequired}</p>
                <p className="text-ink-faint text-xs mt-1">
                  {d.decisionOwnerName ?? 'Unassigned'}
                  {d.resolutionTargetDate ? ` · target ${new Date(d.resolutionTargetDate).toLocaleDateString()}` : ''}
                </p>
              </div>
              {canEdit && (
                <div className="flex items-center gap-2 flex-none">
                  <button type="button" className="text-ink-faint hover:text-ink text-xs" onClick={() => handleToggleStatus(d)}>
                    {d.status === 'OPEN' ? 'Mark resolved' : 'Reopen'}
                  </button>
                  <button type="button" className="text-ink-faint hover:text-critical text-xs" onClick={() => handleDelete(d.id)}>
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
