'use client';

/**
 * RAID Cockpit Board.
 *
 * Replaces raid-form.tsx + raid-status-select.tsx with one interactive
 * board: filterable by Type and SteerCo Escalation, a Quick-Add drawer for
 * logging new items, and per-row inline status/escalation toggles plus a
 * full inline edit panel — all backed by the WP5 RAID Server Actions
 * (createRaidEntry / updateRaidEntry / updateRaidStatus /
 * toggleRaidEscalation), each gated by `authorizeProjectEdit`.
 *
 * Severity note: the WP5 spec's "Severity (1-5)" is presented here via the
 * app's existing 4-tier RaidSeverity enum (Critical/High/Med/Low) rather
 * than a new numeric field — that enum already drives badges,
 * notifications, and the command palette everywhere else in the app.
 *
 * RTM C3 — Risk Matrix heatmap: a 4x4 Impact (severity) × Likelihood grid
 * above the filter chips. Each cell shows the count of open RISK-type
 * entries in it and, when clicked, filters the list below to exactly that
 * cell (click again, or the ✕ pill, to clear).
 */
import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { createRaidEntry, updateRaidEntry, updateRaidStatus, toggleRaidEscalation } from '@/server/actions/raid';
import { CsvImportModal } from '@/components/ingestion/CsvImportModal';

type RaidType = 'RISK' | 'ASSUMPTION' | 'ISSUE' | 'DEPENDENCY';
type RaidSeverity = 'CRITICAL' | 'HIGH' | 'MED' | 'LOW';
type RaidLikelihood = 'RARE' | 'POSSIBLE' | 'LIKELY' | 'ALMOST_CERTAIN';
type RaidStatus = 'OPEN' | 'INPROGRESS' | 'CLOSED';

export interface RaidEntryView {
  id: string;
  type: RaidType;
  title: string;
  description: string;
  severity: RaidSeverity;
  likelihood: RaidLikelihood;
  impact: string;
  mitigationPlan: string;
  ownerId: string;
  targetDate: string; // yyyy-mm-dd, or ''
  status: RaidStatus;
  escalate: boolean;
  createdAt: string;
}

export interface RaidBoardProps {
  projectId: string;
  canEdit: boolean;
  entries: RaidEntryView[];
  resources: { id: string; name: string }[];
}

const TYPE_LABEL: Record<RaidType, string> = { RISK: 'Risk', ASSUMPTION: 'Assumption', ISSUE: 'Issue', DEPENDENCY: 'Dependency' };
const SEVERITY_COLOR: Record<RaidSeverity, string> = {
  CRITICAL: 'bg-critical-soft text-critical',
  HIGH: 'bg-warning-soft text-warning',
  MED: 'bg-na-soft text-na',
  LOW: 'bg-na-soft text-na',
};

const ALL_TYPES: RaidType[] = ['RISK', 'ASSUMPTION', 'ISSUE', 'DEPENDENCY'];

// Risk-matrix axes. Impact rows run worst→least (top to bottom), likelihood
// columns run least→most likely (left to right) — standard heatmap layout.
const IMPACT_ROWS: RaidSeverity[] = ['CRITICAL', 'HIGH', 'MED', 'LOW'];
const LIKELIHOOD_COLS: RaidLikelihood[] = ['RARE', 'POSSIBLE', 'LIKELY', 'ALMOST_CERTAIN'];
const SEVERITY_LABEL: Record<RaidSeverity, string> = { CRITICAL: 'Critical', HIGH: 'High', MED: 'Medium', LOW: 'Low' };
const LIKELIHOOD_LABEL: Record<RaidLikelihood, string> = {
  RARE: 'Rare',
  POSSIBLE: 'Possible',
  LIKELY: 'Likely',
  ALMOST_CERTAIN: 'Almost certain',
};
const SEVERITY_RANK: Record<RaidSeverity, number> = { LOW: 1, MED: 2, HIGH: 3, CRITICAL: 4 };
const LIKELIHOOD_RANK: Record<RaidLikelihood, number> = { RARE: 1, POSSIBLE: 2, LIKELY: 3, ALMOST_CERTAIN: 4 };

/** 1..16 exposure score → cell tint. */
function cellTint(score: number): string {
  if (score >= 12) return 'bg-critical-soft border-critical/40';
  if (score >= 8) return 'bg-warning-soft border-warning/40';
  if (score >= 4) return 'bg-brand/10 border-brand/30';
  return 'bg-success-soft border-success/40';
}

function displayTitle(e: Pick<RaidEntryView, 'title' | 'description'>): string {
  if (e.title) return e.title;
  return e.description.length > 60 ? `${e.description.slice(0, 60)}…` : e.description;
}

interface MatrixCell {
  severity: RaidSeverity;
  likelihood: RaidLikelihood;
}

export function RaidBoard({ projectId, canEdit, entries, resources }: RaidBoardProps) {
  const [typeFilter, setTypeFilter] = useState<Set<RaidType>>(new Set(ALL_TYPES));
  const [escalatedOnly, setEscalatedOnly] = useState(false);
  const [matrixCell, setMatrixCell] = useState<MatrixCell | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // WP6 — CSV Ingestion: bulk RAID log import.
  const [importOpen, setImportOpen] = useState(false);

  // Open RISK-type entries bucketed by (severity, likelihood) for the heatmap.
  const riskCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      if (e.type !== 'RISK' || e.status === 'CLOSED') continue;
      const key = `${e.severity}|${e.likelihood}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [entries]);
  const openRiskTotal = useMemo(
    () => entries.filter((e) => e.type === 'RISK' && e.status !== 'CLOSED').length,
    [entries]
  );

  const filtered = useMemo(() => {
    if (matrixCell) {
      return entries.filter(
        (e) =>
          e.type === 'RISK' &&
          e.status !== 'CLOSED' &&
          e.severity === matrixCell.severity &&
          e.likelihood === matrixCell.likelihood
      );
    }
    return entries.filter((e) => typeFilter.has(e.type) && (!escalatedOnly || e.escalate));
  }, [entries, typeFilter, escalatedOnly, matrixCell]);

  function toggleType(t: RaidType) {
    setMatrixCell(null);
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next.size === 0 ? new Set(ALL_TYPES) : next;
    });
  }

  function toggleCell(severity: RaidSeverity, likelihood: RaidLikelihood) {
    setMatrixCell((prev) =>
      prev && prev.severity === severity && prev.likelihood === likelihood ? null : { severity, likelihood }
    );
  }

  const openCount = entries.filter((e) => e.status !== 'CLOSED').length;
  const escalatedCount = entries.filter((e) => e.escalate).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="card !p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-6 text-sm">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Open Items</div>
            <div className="text-xl font-display font-bold tabular-nums">{openCount}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Flagged for SteerCo</div>
            <div className="text-xl font-display font-bold tabular-nums text-warning">{escalatedCount}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Open Risks</div>
            <div className="text-xl font-display font-bold tabular-nums">{openRiskTotal}</div>
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button type="button" className="text-ink-faint hover:text-ink text-xs px-3 py-1.5" onClick={() => setImportOpen(true)}>
              Import CSV&hellip;
            </button>
            <button type="button" className="btn-secondary !w-auto px-4 text-xs" onClick={() => setDrawerOpen(true)}>
              + Log RAID Item
            </button>
          </div>
        )}
      </div>

      {/* RTM C3 — Risk Matrix heatmap */}
      <div className="card">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Risk Matrix</div>
            <h2 className="text-[15.5px] font-bold">Impact × Likelihood</h2>
            <p className="text-[12px] text-ink-muted mt-0.5">
              Open risks only. Click a cell to filter the list below to that exposure band.
            </p>
          </div>
          {matrixCell && (
            <button
              type="button"
              onClick={() => setMatrixCell(null)}
              className="text-[11px] font-semibold rounded-full px-2.5 py-1 border border-brand/40 bg-brand/10 text-brand"
            >
              {SEVERITY_LABEL[matrixCell.severity]} × {LIKELIHOOD_LABEL[matrixCell.likelihood]} ✕
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <div
            className="grid gap-1 min-w-[440px] text-xs"
            style={{ gridTemplateColumns: 'max-content repeat(4, minmax(72px, 1fr))' }}
          >
            {/* header row */}
            <div className="flex items-end justify-end pr-2 pb-1 text-[10px] uppercase tracking-wide text-ink-faint font-semibold">
              Impact ↓ / Likelihood →
            </div>
            {LIKELIHOOD_COLS.map((l) => (
              <div key={l} className="text-center text-[10px] uppercase tracking-wide text-ink-faint font-semibold pb-1">
                {LIKELIHOOD_LABEL[l]}
              </div>
            ))}

            {/* body */}
            {IMPACT_ROWS.map((sev) => (
              <RowFragment
                key={sev}
                sev={sev}
                matrixCell={matrixCell}
                riskCounts={riskCounts}
                onToggle={toggleCell}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {ALL_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => toggleType(t)}
            className={clsx(
              'text-xs font-semibold rounded-full px-3 py-1 border transition-colors',
              !matrixCell && typeFilter.has(t)
                ? 'border-brand/40 bg-brand/10 text-brand'
                : 'border-border-soft text-ink-faint hover:text-ink'
            )}
          >
            {TYPE_LABEL[t]}
          </button>
        ))}
        <span className="w-px h-4 bg-border mx-1" />
        <button
          type="button"
          onClick={() => {
            setMatrixCell(null);
            setEscalatedOnly((v) => !v);
          }}
          className={clsx(
            'text-xs font-semibold rounded-full px-3 py-1 border transition-colors',
            !matrixCell && escalatedOnly
              ? 'border-warning/40 bg-warning-soft text-warning'
              : 'border-border-soft text-ink-faint hover:text-ink'
          )}
        >
          SteerCo escalated only
        </button>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <p className="text-ink-muted text-sm">
            {matrixCell ? 'No open risks in this cell.' : 'Nothing matches the current filters.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {filtered.map((e) => (
              <RaidRow key={e.id} projectId={projectId} canEdit={canEdit} entry={e} resources={resources} />
            ))}
          </ul>
        )}
      </div>

      {drawerOpen && (
        <QuickAddDrawer projectId={projectId} resources={resources} onClose={() => setDrawerOpen(false)} />
      )}

      {importOpen && <CsvImportModal projectId={projectId} kind="raid" onClose={() => setImportOpen(false)} />}
    </div>
  );
}

function RowFragment({
  sev,
  matrixCell,
  riskCounts,
  onToggle,
}: {
  sev: RaidSeverity;
  matrixCell: MatrixCell | null;
  riskCounts: Map<string, number>;
  onToggle: (s: RaidSeverity, l: RaidLikelihood) => void;
}) {
  return (
    <>
      <div className="flex items-center justify-end pr-2 text-[10px] uppercase tracking-wide text-ink-faint font-semibold">
        {SEVERITY_LABEL[sev]}
      </div>
      {LIKELIHOOD_COLS.map((lik) => {
        const count = riskCounts.get(`${sev}|${lik}`) ?? 0;
        const score = SEVERITY_RANK[sev] * LIKELIHOOD_RANK[lik];
        const active = matrixCell?.severity === sev && matrixCell?.likelihood === lik;
        return (
          <button
            key={lik}
            type="button"
            onClick={() => onToggle(sev, lik)}
            title={`${SEVERITY_LABEL[sev]} impact × ${LIKELIHOOD_LABEL[lik]} — exposure ${score}/16`}
            className={clsx(
              'h-12 rounded-sm border flex items-center justify-center font-display font-bold tabular-nums transition-all',
              cellTint(score),
              active ? 'ring-2 ring-brand ring-offset-1 ring-offset-bg' : 'hover:brightness-95',
              count === 0 && 'opacity-45'
            )}
          >
            {count}
          </button>
        );
      })}
    </>
  );
}

function QuickAddDrawer({
  projectId,
  resources,
  onClose,
}: {
  projectId: string;
  resources: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [type, setType] = useState<RaidType>('RISK');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<RaidSeverity>('MED');
  const [likelihood, setLikelihood] = useState<RaidLikelihood>('POSSIBLE');
  const [impact, setImpact] = useState('');
  const [mitigationPlan, setMitigationPlan] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [escalate, setEscalate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    if (!description.trim()) {
      setError('Description is required.');
      return;
    }
    setBusy(true);
    setError(null);
    startTransition(async () => {
      try {
        const result = await createRaidEntry({
          projectId,
          type,
          title,
          description,
          severity,
          likelihood,
          impact,
          mitigationPlan,
          ownerId,
          targetDate,
          escalate,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.refresh();
        onClose();
      } finally {
        setBusy(false);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md h-full bg-surface border-l border-border overflow-y-auto p-5 flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-[15.5px] font-bold">Log a RAID Item</h2>
          <button type="button" onClick={onClose} className="text-ink-faint hover:text-ink text-sm">
            Close
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-ink-muted">Type</span>
            <select className="input" value={type} onChange={(e) => setType(e.target.value as RaidType)}>
              {ALL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-ink-muted">Severity (impact)</span>
            <select className="input" value={severity} onChange={(e) => setSeverity(e.target.value as RaidSeverity)}>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MED">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-ink-muted">Likelihood {type === 'RISK' ? '' : '(risks only)'}</span>
          <select
            className="input"
            value={likelihood}
            onChange={(e) => setLikelihood(e.target.value as RaidLikelihood)}
          >
            {LIKELIHOOD_COLS.map((l) => (
              <option key={l} value={l}>
                {LIKELIHOOD_LABEL[l]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-ink-muted">Title</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short label" />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-ink-muted">Description</span>
          <textarea
            className="input min-h-[64px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the item…"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-ink-muted">Impact</span>
          <textarea
            className="input min-h-[56px]"
            value={impact}
            onChange={(e) => setImpact(e.target.value)}
            placeholder="What happens if this isn't addressed?"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-ink-muted">Mitigation plan</span>
          <textarea
            className="input min-h-[56px]"
            value={mitigationPlan}
            onChange={(e) => setMitigationPlan(e.target.value)}
            placeholder="What's the plan to address it?"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-ink-muted">Owner</span>
            <select className="input" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">Unassigned</option>
              {resources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-ink-muted">Target date</span>
            <input className="input" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-muted mt-1">
          <input type="checkbox" checked={escalate} onChange={(e) => setEscalate(e.target.checked)} />
          Flag for steering committee visibility
        </label>

        {error && <p className="text-critical text-xs">{error}</p>}

        <div className="flex justify-end gap-2 mt-2">
          <button type="button" className="text-ink-faint hover:text-ink text-xs px-3 py-2" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-secondary !w-auto px-5" disabled={busy} onClick={handleSubmit}>
            {busy ? 'Logging…' : 'Log item'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RaidRow({
  projectId,
  canEdit,
  entry,
  resources,
}: {
  projectId: string;
  canEdit: boolean;
  entry: RaidEntryView;
  resources: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [status, setStatus] = useState<RaidStatus>(entry.status);
  const [statusBusy, setStatusBusy] = useState(false);
  const [escalate, setEscalate] = useState(entry.escalate);
  const [escalateBusy, setEscalateBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const savedRef = useRef(entry);
  const [title, setTitle] = useState(entry.title);
  const [description, setDescription] = useState(entry.description);
  const [severity, setSeverity] = useState<RaidSeverity>(entry.severity);
  const [likelihood, setLikelihood] = useState<RaidLikelihood>(entry.likelihood);
  const [impact, setImpact] = useState(entry.impact);
  const [mitigationPlan, setMitigationPlan] = useState(entry.mitigationPlan);
  const [ownerId, setOwnerId] = useState(entry.ownerId);
  const [targetDate, setTargetDate] = useState(entry.targetDate);
  const [saving, setSaving] = useState(false);

  function handleStatusChange(next: RaidStatus) {
    if (!canEdit) return;
    const prev = status;
    setStatus(next);
    setStatusBusy(true);
    startTransition(async () => {
      try {
        const result = await updateRaidStatus({ id: entry.id, projectId, status: next });
        if (!result.ok) {
          setStatus(prev);
          setError(result.error);
        } else {
          router.refresh();
        }
      } finally {
        setStatusBusy(false);
      }
    });
  }

  function handleEscalateToggle() {
    if (!canEdit) return;
    const next = !escalate;
    setEscalate(next);
    setEscalateBusy(true);
    startTransition(async () => {
      try {
        const result = await toggleRaidEscalation({ id: entry.id, projectId, escalate: next });
        if (!result.ok) {
          setEscalate(!next);
          setError(result.error);
        } else {
          router.refresh();
        }
      } finally {
        setEscalateBusy(false);
      }
    });
  }

  function handleSaveEdit() {
    setSaving(true);
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateRaidEntry({
          id: entry.id,
          projectId,
          title,
          description,
          severity,
          likelihood,
          impact,
          mitigationPlan,
          ownerId,
          targetDate,
          status,
          escalate,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        savedRef.current = { ...entry, title, description, severity, likelihood, impact, mitigationPlan, ownerId, targetDate };
        setEditing(false);
        router.refresh();
      } finally {
        setSaving(false);
      }
    });
  }

  function handleCancelEdit() {
    const s = savedRef.current;
    setTitle(s.title);
    setDescription(s.description);
    setSeverity(s.severity);
    setLikelihood(s.likelihood);
    setImpact(s.impact);
    setMitigationPlan(s.mitigationPlan);
    setOwnerId(s.ownerId);
    setTargetDate(s.targetDate);
    setEditing(false);
    setError(null);
  }

  const ownerName = resources.find((r) => r.id === entry.ownerId)?.name ?? 'Unassigned';

  return (
    <li className="bg-surface-2 rounded-sm px-3.5 py-3 flex flex-col gap-2">
      <div className="flex items-start gap-3 flex-wrap">
        <span className={clsx('badge', SEVERITY_COLOR[severity])}>{severity}</span>
        <span className="badge">{TYPE_LABEL[entry.type]}</span>
        {entry.type === 'RISK' && (
          <span className="badge bg-surface-3 text-ink-muted">{LIKELIHOOD_LABEL[likelihood]}</span>
        )}
        {escalate && <span className="badge bg-warning-soft text-warning">SteerCo</span>}
        <div className="flex-1 min-w-[200px]">
          <p className="text-sm font-semibold">{displayTitle({ title, description })}</p>
          {title && <p className="text-ink-muted text-xs mt-0.5">{description}</p>}
          <p className="text-ink-faint text-xs mt-1">
            {ownerName}
            {entry.targetDate ? ` · due ${new Date(entry.targetDate).toLocaleDateString()}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-none">
          <select
            className="input !w-auto text-xs"
            value={status}
            disabled={!canEdit || statusBusy}
            onChange={(e) => handleStatusChange(e.target.value as RaidStatus)}
          >
            <option value="OPEN">Open</option>
            <option value="INPROGRESS">In progress</option>
            <option value="CLOSED">Closed</option>
          </select>
          {canEdit && (
            <button
              type="button"
              onClick={handleEscalateToggle}
              disabled={escalateBusy}
              className={clsx(
                'text-[11px] font-semibold rounded-full px-2.5 py-1 border transition-colors',
                escalate ? 'border-warning/40 bg-warning-soft text-warning' : 'border-border-soft text-ink-faint hover:text-ink'
              )}
            >
              {escalate ? 'Escalated' : 'Escalate'}
            </button>
          )}
          {canEdit && (
            <button type="button" className="text-ink-faint hover:text-ink text-xs" onClick={() => setEditing((v) => !v)}>
              {editing ? 'Collapse' : 'Edit'}
            </button>
          )}
        </div>
      </div>

      {editing && canEdit && (
        <div className="flex flex-col gap-2 pt-2 border-t border-border/60">
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <select className="input" value={severity} onChange={(e) => setSeverity(e.target.value as RaidSeverity)}>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MED">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-ink-muted">Likelihood {entry.type === 'RISK' ? '' : '(risks only)'}</span>
            <select
              className="input"
              value={likelihood}
              onChange={(e) => setLikelihood(e.target.value as RaidLikelihood)}
            >
              {LIKELIHOOD_COLS.map((l) => (
                <option key={l} value={l}>
                  {LIKELIHOOD_LABEL[l]}
                </option>
              ))}
            </select>
          </label>
          <textarea className="input min-h-[56px]" value={description} onChange={(e) => setDescription(e.target.value)} />
          <textarea
            className="input min-h-[48px]"
            placeholder="Impact"
            value={impact}
            onChange={(e) => setImpact(e.target.value)}
          />
          <textarea
            className="input min-h-[48px]"
            placeholder="Mitigation plan"
            value={mitigationPlan}
            onChange={(e) => setMitigationPlan(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <select className="input" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">Unassigned</option>
              {resources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <input className="input" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="text-ink-faint hover:text-ink text-xs" disabled={saving} onClick={handleCancelEdit}>
              Cancel
            </button>
            <button type="button" className="btn-secondary !w-auto !py-1.5 px-3 text-xs" disabled={saving} onClick={handleSaveEdit}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-critical text-xs">{error}</p>}
    </li>
  );
}
