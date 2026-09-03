'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { getControlGuidance, type ControlGuidanceView } from '@/lib/control-guidance';

const GATE_TONE: Record<string, string> = {
  'Phase 0 — Initiation': 'bg-brand-hi/10 text-brand-hi border-brand-hi/30',
  Mobilization: 'bg-brand/10 text-brand-hi border-brand/30',
  'In-Flight': 'bg-warning-soft text-warning border-warning/30',
  'Deployment Gate': 'bg-critical-soft text-critical border-critical/30',
  Closure: 'bg-success-soft text-success border-success/30',
};

/** The guidance body — shared by the slide-over drawer and the /methodology page. */
export function ControlGuidanceContent({
  guidance,
  displayLabel,
}: {
  guidance: ControlGuidanceView;
  displayLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] text-ink-faint">{guidance.key}</span>
        <span className={clsx('badge !py-0.5 !px-2 text-[10px] border', GATE_TONE[guidance.lifecycleGate] ?? '')}>
          {guidance.lifecycleGate}
        </span>
      </div>

      {displayLabel && displayLabel !== guidance.defaultLabel && (
        <p className="text-[12px] text-ink-faint -mt-1">
          Shown in this workspace as <span className="text-ink-muted font-semibold">{displayLabel}</span>
        </p>
      )}

      <section>
        <h4 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Objective</h4>
        <p className="text-ink-muted leading-relaxed">{guidance.objective}</p>
      </section>

      <section>
        <h4 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Required Artifacts / Evidence</h4>
        <ul className="flex flex-col gap-1.5">
          {guidance.requiredArtifacts.map((a) => (
            <li key={a} className="flex gap-2 text-ink-muted">
              <span className="text-brand-hi flex-none">&bull;</span>
              {a}
            </li>
          ))}
        </ul>
        <p className="text-[11.5px] text-ink-faint mt-1.5">Summary basis: {guidance.evidenceSummary}</p>
      </section>

      <section>
        <h4 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Lifecycle Gate</h4>
        <p className="text-ink-muted">
          <span className="font-semibold text-ink">{guidance.lifecycleGate}.</span> {guidance.lifecycleNote}
        </p>
      </section>

      <section>
        <h4 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Verification Criteria</h4>
        <ul className="flex flex-col gap-1.5">
          {guidance.verificationCriteria.map((c) => (
            <li key={c} className="flex gap-2 text-ink-muted">
              <span className="text-success flex-none">✓</span>
              {c}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-sm border border-warning/25 bg-warning-soft/50 px-3 py-2">
        <h4 className="text-[11px] uppercase tracking-wide text-warning font-semibold mb-1">Common “Partial” Trap</h4>
        <p className="text-ink-muted">{guidance.commonGap}</p>
      </section>

      <p className="text-ink-faint text-xs">Why it matters: {guidance.why}</p>
    </div>
  );
}

/**
 * The `ⓘ` trigger + its slide-over drawer, dropped in next to any control
 * row (audit checklist card, admin display-label editor).
 */
export function ControlGuidanceButton({
  controlKey,
  label,
  size = 'sm',
}: {
  controlKey: string;
  label?: string;
  size?: 'sm' | 'xs';
}) {
  const [open, setOpen] = useState(false);
  const guidance = getControlGuidance(controlKey);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!guidance) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Delivery guidance for ${label ?? guidance.defaultLabel}`}
        title="Delivery guidance"
        className={clsx(
          'flex-none rounded-full border border-border-soft text-ink-faint hover:text-brand-hi hover:border-brand-hi/50 flex items-center justify-center font-serif italic leading-none transition-colors',
          size === 'xs' ? 'w-4 h-4 text-[10px]' : 'w-5 h-5 text-[11px]'
        )}
      >
        i
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[105] flex items-stretch justify-end bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-label={`Delivery guidance — ${guidance.defaultLabel}`}
          onClick={() => setOpen(false)}
        >
          <aside
            className="w-full max-w-md h-full bg-surface-1 border-l border-border-soft shadow-card overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-surface-1 border-b border-border px-5 py-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-brand-hi font-semibold mb-0.5">
                  Methodology Playbook
                </div>
                <h3 className="text-[15.5px] font-display font-bold">{label ?? guidance.defaultLabel}</h3>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close guidance"
                className="w-7 h-7 flex-none rounded-sm border border-border-soft text-ink-muted hover:text-ink hover:border-ink-faint flex items-center justify-center"
              >
                &times;
              </button>
            </div>
            <div className="px-5 py-5">
              <ControlGuidanceContent guidance={guidance} displayLabel={label} />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
