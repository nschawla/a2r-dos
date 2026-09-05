'use client';

/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * The Visual Onboarding Journey Wizard — a guided, five-phase setup
 * walkthrough for Admin & Org Setup → Onboarding (`/admin/onboarding`).
 * Session-local state only (no persistence across reloads — see the
 * route's own doc comment for why that's a deliberate scope line, not an
 * oversight), so it can be reset and re-run live for a demo at any time.
 *
 * Two of the five steps are genuinely functional, not staged:
 *   - Governance Template really calls applyGovernanceTemplate() and
 *     changes this tenant's live configuration.
 *   - Role Mapping shows this tenant's real roster (read-only).
 * Base Data Ingestion (Step 3) is explicitly a preview/mock — it runs the
 * same schema-shape check the real Self-Service Batch Import Engine does,
 * but never writes anything; that engine (Admin & Org Setup → Data
 * Ingestion → Batch Import) is the real, committing path.
 */
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { useBusyAction, PanelHead } from '@/components/ui/panel-kit';
import { readUploadedRows } from '@/lib/ingestion/workbook-reader';
import { applyGovernanceTemplate } from '@/server/actions/admin';
import { GOVERNANCE_TEMPLATES, TEMPLATE_ORDER, type GovernanceTemplateKey } from '@/lib/governance/config';
import {
  ONBOARDING_STEPS,
  ONBOARDING_DATASETS,
  statusForStep,
  validateDatasetHeader,
  initialOnboardingState,
  type OnboardingStepId,
  type OnboardingWizardState,
  type OnboardingDatasetId,
  type OnboardingDatasetSchema,
  type DatasetUploadResult,
  type DatasetUploadStatus,
} from '@/types/onboarding';

export interface OnboardingRosterRow {
  id: string;
  name: string;
  email: string | null;
  roleName: string | null;
  practiceName: string | null;
}

export interface OnboardingOrgSummary {
  name: string;
  slug: string;
  contractTier: string;
  /** ISO date string. */
  createdAt: string;
}

export interface OnboardingJourneyWizardProps {
  organization: OnboardingOrgSummary;
  currentGovernanceTemplate: GovernanceTemplateKey;
  roster: OnboardingRosterRow[];
  projectCount: number;
}

export function OnboardingJourneyWizard({
  organization,
  currentGovernanceTemplate,
  roster,
  projectCount,
}: OnboardingJourneyWizardProps) {
  const [state, setState] = useState<OnboardingWizardState>(() => initialOnboardingState(currentGovernanceTemplate));

  function goToStep(stepId: OnboardingStepId) {
    if (statusForStep(state, stepId) === 'locked') return;
    setState((s) => ({ ...s, currentStepId: stepId }));
  }

  function completeAndAdvance(stepId: OnboardingStepId) {
    setState((s) => {
      const idx = ONBOARDING_STEPS.findIndex((st) => st.id === stepId);
      const next = ONBOARDING_STEPS[idx + 1];
      return {
        ...s,
        completedStepIds: s.completedStepIds.includes(stepId) ? s.completedStepIds : [...s.completedStepIds, stepId],
        currentStepId: next ? next.id : stepId,
      };
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <OnboardingPipeline state={state} onSelect={goToStep} />

      <section className="card">
        {state.currentStepId === 'provisioning' && (
          <ProvisioningStepView organization={organization} onContinue={() => completeAndAdvance('provisioning')} />
        )}
        {state.currentStepId === 'governance' && (
          <GovernanceStepView
            selected={state.selectedGovernanceTemplate}
            onSelect={(t) => setState((s) => ({ ...s, selectedGovernanceTemplate: t }))}
            onApplied={() => completeAndAdvance('governance')}
          />
        )}
        {state.currentStepId === 'data-ingestion' && (
          <DataIngestionStepView
            uploads={state.datasetUploads}
            onResult={(result) =>
              setState((s) => ({ ...s, datasetUploads: { ...s.datasetUploads, [result.datasetId]: result } }))
            }
            onContinue={() => completeAndAdvance('data-ingestion')}
          />
        )}
        {state.currentStepId === 'role-mapping' && (
          <RoleMappingStepView
            roster={roster}
            reviewed={state.roleMappingReviewed}
            onReviewedChange={(v) => setState((s) => ({ ...s, roleMappingReviewed: v }))}
            onContinue={() => completeAndAdvance('role-mapping')}
          />
        )}
        {state.currentStepId === 'go-live' && (
          <GoLiveStepView organization={organization} state={state} projectCount={projectCount} rosterCount={roster.length} />
        )}
      </section>
    </div>
  );
}

// ============================================================= pipeline

function OnboardingPipeline({
  state,
  onSelect,
}: {
  state: OnboardingWizardState;
  onSelect: (id: OnboardingStepId) => void;
}) {
  return (
    <div className="card !py-5">
      <ol className="flex items-start">
        {ONBOARDING_STEPS.map((step, idx) => {
          const status = statusForStep(state, step.id);
          const isLast = idx === ONBOARDING_STEPS.length - 1;
          return (
            <li key={step.id} className="flex-1 flex items-center last:flex-none">
              <button
                type="button"
                onClick={() => onSelect(step.id)}
                disabled={status === 'locked'}
                title={step.description}
                className="flex flex-col items-center gap-2 flex-none disabled:cursor-not-allowed"
              >
                <span
                  className={clsx(
                    'w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors',
                    status === 'complete' && 'bg-brand border-brand text-white',
                    status === 'active' && 'border-brand text-brand bg-brand/10',
                    status === 'locked' && 'border-border-soft text-ink-faint bg-surface-2'
                  )}
                >
                  {status === 'complete' ? (
                    <CheckIcon className="w-4 h-4" />
                  ) : status === 'locked' ? (
                    <LockIcon className="w-3.5 h-3.5" />
                  ) : (
                    step.order
                  )}
                </span>
                <span
                  className={clsx(
                    'text-[11px] font-semibold whitespace-nowrap',
                    status === 'locked' ? 'text-ink-faint' : 'text-ink'
                  )}
                >
                  {step.shortLabel}
                </span>
              </button>
              {!isLast && (
                <span
                  className={clsx('flex-1 h-[2px] mx-1 -mt-[18px]', status === 'complete' ? 'bg-brand' : 'bg-border')}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ========================================================== Step 1

function ProvisioningStepView({
  organization,
  onContinue,
}: {
  organization: OnboardingOrgSummary;
  onContinue: () => void;
}) {
  const created = new Date(organization.createdAt);
  const checks = ['Workspace created and reachable', 'Admin account active', 'Database and tenant isolation provisioned'];

  return (
    <div className="flex flex-col gap-5">
      <PanelHead
        eyebrow="Step 1 of 5"
        title="Workspace Provisioning"
        desc="Your organization is already live — this step just confirms the basics before you configure anything."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-border-soft p-4">
          <div className="text-[10.5px] uppercase tracking-wide text-ink-faint font-semibold mb-2">Organization</div>
          <dl className="flex flex-col gap-1.5 text-sm">
            <SummaryRow label="Name" value={organization.name} />
            <SummaryRow label="Slug" value={organization.slug} mono />
            <SummaryRow label="Contract tier" value={organization.contractTier} />
            <SummaryRow
              label="Provisioned"
              value={created.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
            />
          </dl>
        </div>
        <div className="rounded-md border border-border-soft p-4">
          <div className="text-[10.5px] uppercase tracking-wide text-ink-faint font-semibold mb-2">Readiness checks</div>
          <ul className="flex flex-col gap-2.5">
            {checks.map((c) => (
              <li key={c} className="flex items-center gap-2.5 text-sm text-ink-muted">
                <span className="w-4 h-4 rounded-full bg-success/15 text-success flex items-center justify-center flex-none">
                  <CheckIcon className="w-2.5 h-2.5" />
                </span>
                {c}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex justify-end">
        <button type="button" className="btn-primary !w-auto px-6" onClick={onContinue}>
          Continue →
        </button>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-faint">{label}</dt>
      <dd className={clsx('font-semibold text-ink text-right', mono && 'font-mono text-[11.5px]')}>{value}</dd>
    </div>
  );
}

// ========================================================== Step 2 (real)

function GovernanceStepView({
  selected,
  onSelect,
  onApplied,
}: {
  selected: GovernanceTemplateKey | null;
  onSelect: (t: GovernanceTemplateKey) => void;
  onApplied: () => void;
}) {
  const { busy, error, run } = useBusyAction();

  async function applyAndContinue() {
    if (!selected || selected === 'CUSTOM') return;
    const ok = await run(() => applyGovernanceTemplate({ template: selected }), {
      success: `Applied "${GOVERNANCE_TEMPLATES[selected].label}"`,
      errorTitle: 'Couldn’t apply template',
    });
    if (ok) onApplied();
  }

  return (
    <div className="flex flex-col gap-5">
      <PanelHead
        eyebrow="Step 2 of 5"
        title="Governance Template"
        desc="Pick the compliance posture that matches how your firm runs delivery today — this applies immediately, tenant-wide, and you can refine it anytime from Admin & Org Setup → Governance."
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {TEMPLATE_ORDER.map((key) => {
          const t = GOVERNANCE_TEMPLATES[key];
          const active = selected === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              className={clsx(
                'text-left rounded-md border p-4 transition-colors',
                active ? 'border-brand bg-brand/5' : 'border-border-soft hover:border-ink-faint'
              )}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-sm font-bold text-ink">{t.label}</span>
                {active && <span className="text-brand text-xs flex-none">✓</span>}
              </div>
              <p className="text-[12px] text-ink-muted leading-snug">{t.blurb}</p>
            </button>
          );
        })}
      </div>
      {error && <p className="text-critical text-xs">{error}</p>}
      <div className="flex justify-end">
        <button
          type="button"
          className="btn-primary !w-auto px-6 disabled:opacity-50"
          disabled={busy || !selected}
          onClick={applyAndContinue}
        >
          {busy ? 'Applying…' : 'Apply & Continue →'}
        </button>
      </div>
    </div>
  );
}

// ========================================================== Step 3 (mock)

function DataIngestionStepView({
  uploads,
  onResult,
  onContinue,
}: {
  uploads: Partial<Record<OnboardingDatasetId, DatasetUploadResult>>;
  onResult: (r: DatasetUploadResult) => void;
  onContinue: () => void;
}) {
  const readyCount = ONBOARDING_DATASETS.filter((d) => uploads[d.id]?.status === 'valid').length;

  return (
    <div className="flex flex-col gap-5">
      <PanelHead
        eyebrow="Step 3 of 5"
        title="Base Data Ingestion"
        desc="Drop your exported PowerPlan-style files below for a quick schema check. This is a preview only — nothing is written to your workspace here; the real, committing import lives at Admin & Org Setup → Data Ingestion → Batch Import."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {ONBOARDING_DATASETS.map((schema) => (
          <DatasetDropzone key={schema.id} schema={schema} result={uploads[schema.id] ?? null} onResult={onResult} />
        ))}
      </div>
      <p className="text-[12px] text-ink-faint">
        {readyCount} of {ONBOARDING_DATASETS.length} datasets look ready. Nothing here blocks Go-Live — come back and
        finish this later if you'd rather.
      </p>
      <div className="flex justify-end">
        <button type="button" className="btn-primary !w-auto px-6" onClick={onContinue}>
          Continue →
        </button>
      </div>
    </div>
  );
}

function DatasetDropzone({
  schema,
  result,
  onResult,
}: {
  schema: OnboardingDatasetSchema;
  result: DatasetUploadResult | null;
  onResult: (r: DatasetUploadResult) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [checking, setChecking] = useState(false);

  async function handleFile(file: File) {
    setChecking(true);
    try {
      const buffer = await file.arrayBuffer();
      const { header, records } = readUploadedRows(file.name, buffer);
      const { missingColumns, unexpectedColumns } = validateDatasetHeader(schema, header);
      onResult({
        datasetId: schema.id,
        fileName: file.name,
        status: missingColumns.length === 0 ? 'valid' : 'invalid',
        rowCount: records.length,
        missingColumns,
        unexpectedColumns,
      });
    } catch (err) {
      onResult({
        datasetId: schema.id,
        fileName: file.name,
        status: 'invalid',
        rowCount: 0,
        missingColumns: [],
        unexpectedColumns: [],
        note: err instanceof Error ? err.message : 'Could not read that file.',
      });
    } finally {
      setChecking(false);
    }
  }

  const status: DatasetUploadStatus = checking ? 'checking' : (result?.status ?? 'pending');

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) void handleFile(file);
      }}
      className={clsx(
        'rounded-lg border-2 border-dashed p-4 flex flex-col gap-2 transition-colors',
        dragOver
          ? 'border-brand bg-brand/5'
          : status === 'valid'
            ? 'border-success/50 bg-success-soft'
            : status === 'invalid'
              ? 'border-critical/50 bg-critical-soft'
              : 'border-border-soft bg-surface-2/50'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-bold text-ink">{schema.label}</div>
          <div className="text-[11px] text-ink-faint font-mono truncate">{schema.fileName}</div>
        </div>
        <StatusBadge status={status} />
      </div>
      <p className="text-[11.5px] text-ink-muted">{schema.description}</p>

      <label className="btn-secondary !w-auto px-3 text-xs cursor-pointer inline-flex items-center justify-center self-start">
        {result ? 'Replace file…' : 'Choose file…'}
        <input
          type="file"
          accept=".csv,.xlsx,.xls,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
      </label>

      {result && (
        <div className="text-[11px] flex flex-col gap-1 mt-1">
          <span className="text-ink-muted">
            {result.fileName}
            {result.rowCount > 0 ? ` · ${result.rowCount} row${result.rowCount === 1 ? '' : 's'}` : ''}
          </span>
          {result.note && <span className="text-critical">{result.note}</span>}
          {result.missingColumns.length > 0 && <span className="text-critical">Missing: {result.missingColumns.join(', ')}</span>}
          {result.unexpectedColumns.length > 0 && (
            <span className="text-ink-faint">Unrecognized: {result.unexpectedColumns.join(', ')}</span>
          )}
          {result.status === 'valid' && <span className="text-success">Schema looks good.</span>}
        </div>
      )}

      <details className="text-[11px] text-ink-faint mt-1">
        <summary className="cursor-pointer select-none">Expected columns</summary>
        <p className="mt-1 font-mono leading-relaxed">
          {schema.requiredColumns.join(', ')}
          {schema.optionalColumns ? ` (optional: ${schema.optionalColumns.join(', ')})` : ''}
        </p>
      </details>
    </div>
  );
}

function StatusBadge({ status }: { status: DatasetUploadStatus }) {
  const meta: Record<DatasetUploadStatus, { label: string; className: string }> = {
    pending: { label: 'Pending', className: 'bg-na-soft text-na' },
    checking: { label: 'Checking…', className: 'bg-na-soft text-na' },
    valid: { label: 'Valid', className: 'bg-success-soft text-success' },
    invalid: { label: 'Needs fix', className: 'bg-critical-soft text-critical' },
  };
  const m = meta[status];
  return (
    <span className={clsx('text-[10px] font-semibold rounded-full px-2 py-0.5 whitespace-nowrap flex-none', m.className)}>
      {m.label}
    </span>
  );
}

// ========================================================== Step 4

function RoleMappingStepView({
  roster,
  reviewed,
  onReviewedChange,
  onContinue,
}: {
  roster: OnboardingRosterRow[];
  reviewed: boolean;
  onReviewedChange: (v: boolean) => void;
  onContinue: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <PanelHead
        eyebrow="Step 4 of 5"
        title="Role Mapping"
        desc="Every person on your roster already maps onto an A2R Delivery OS access tier through their rate-card role. Review it below — change any of it anytime from Admin & Org Setup → Roster."
      />
      <div className="overflow-x-auto rounded-md border border-border-soft">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide border-b border-border bg-surface-2">
              <th className="py-2 px-3">Name</th>
              <th className="py-2 px-3">Email</th>
              <th className="py-2 px-3">Practice</th>
              <th className="py-2 px-3">Rate-Card Role</th>
            </tr>
          </thead>
          <tbody>
            {roster.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-ink-faint">
                  No roster entries yet — add people from Admin & Org Setup → Roster.
                </td>
              </tr>
            )}
            {roster.map((r) => (
              <tr key={r.id} className="border-b border-border/60 last:border-0">
                <td className="py-2 px-3 font-semibold text-ink">{r.name}</td>
                <td className="py-2 px-3 text-ink-muted">{r.email ?? '—'}</td>
                <td className="py-2 px-3 text-ink-muted">{r.practiceName ?? '—'}</td>
                <td className="py-2 px-3 text-ink-muted">{r.roleName ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-muted">
        <input
          type="checkbox"
          checked={reviewed}
          onChange={(e) => onReviewedChange(e.target.checked)}
          className="rounded border-border-soft"
        />
        This roster and role mapping looks correct.
      </label>
      <div className="flex justify-end">
        <button
          type="button"
          className="btn-primary !w-auto px-6 disabled:opacity-50"
          disabled={!reviewed}
          onClick={onContinue}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

// ========================================================== Step 5

function templateLabel(key: GovernanceTemplateKey | null): string {
  if (!key) return 'not yet set';
  if (key === 'CUSTOM') return 'Custom';
  return GOVERNANCE_TEMPLATES[key].label;
}

function GoLiveStepView({
  organization,
  state,
  projectCount,
  rosterCount,
}: {
  organization: OnboardingOrgSummary;
  state: OnboardingWizardState;
  projectCount: number;
  rosterCount: number;
}) {
  const datasetsReady = ONBOARDING_DATASETS.filter((d) => state.datasetUploads[d.id]?.status === 'valid').length;
  const items: { label: string; done: boolean }[] = [
    { label: 'Workspace provisioned', done: true },
    { label: `Governance template — ${templateLabel(state.selectedGovernanceTemplate)}`, done: state.completedStepIds.includes('governance') },
    { label: `Base data — ${datasetsReady} of ${ONBOARDING_DATASETS.length} datasets validated`, done: datasetsReady === ONBOARDING_DATASETS.length },
    { label: `Role mapping reviewed — ${rosterCount} team member${rosterCount === 1 ? '' : 's'}`, done: state.roleMappingReviewed },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PanelHead eyebrow="Step 5 of 5" title="Go-Live Verification" desc={`${organization.name} is ready. Here's a recap of this session.`} />
      <ul className="flex flex-col gap-2.5">
        {items.map((it) => (
          <li key={it.label} className="flex items-center gap-2.5 text-sm">
            <span
              className={clsx(
                'w-5 h-5 rounded-full flex items-center justify-center flex-none text-[11px] font-bold',
                it.done ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'
              )}
            >
              {it.done ? <CheckIcon className="w-3 h-3" /> : '!'}
            </span>
            <span className={it.done ? 'text-ink' : 'text-ink-muted'}>{it.label}</span>
          </li>
        ))}
      </ul>

      <div className="rounded-md border border-border-soft p-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <MiniStat label="Engagements" value={projectCount} />
        <MiniStat label="Roster" value={rosterCount} />
        <MiniStat label="Datasets ready" value={`${datasetsReady}/${ONBOARDING_DATASETS.length}`} />
      </div>

      <div className="flex justify-end">
        <Link href="/" className="btn-primary !w-auto px-6 inline-flex items-center justify-center">
          Enter Your Workspace →
        </Link>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold">{label}</div>
      <div className="text-lg font-bold text-ink">{value}</div>
    </div>
  );
}

// ========================================================== icons

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
