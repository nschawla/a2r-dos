'use client';

/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * The PS Orchestration & Decision Engine's governance drawer
 * (docs/PORTFOLIO_ORCHESTRATION.md) — opens from a Decision Card's chosen
 * option. Same controlled-drawer shape as AuditTrailDrawer.tsx (open/onClose
 * props, fixed inset-0 z-[100] backdrop + right-hand aside), but with no
 * fetch-on-open: every field is already in hand from the server-computed
 * DecisionOption, so this only *renders* — the guardrail preview below runs
 * the same pure `checkGuardrail` the server reruns authoritatively on
 * submit, entirely client-side, zero network, purely for an instant
 * "will this even go through" read before committing.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { checkGuardrail } from '@/lib/decision-governance';
import type { DeliveryRole } from '@/lib/auth/rbac';
import type { DecisionOption } from '@/lib/decision-options';
import { submitPortfolioIntervention } from '@/server/actions/portfolio-interventions';
import { useSafeAction } from '@/lib/client/safe-action';
import { useToast } from '@/components/ui/toast';

export interface InterventionDrawerContext {
  commercialModel: string;
  locked: boolean;
  deliveryRole: DeliveryRole;
  approvalThresholdUsd: number;
}

export function InterventionDrawer({
  open,
  onClose,
  projectId,
  projectName,
  driver,
  option,
  financialImpactUsd,
  context,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  driver: string;
  option: DecisionOption | null;
  financialImpactUsd: number | null;
  context: InterventionDrawerContext;
}) {
  const router = useRouter();
  const runAction = useSafeAction();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [executed, setExecuted] = useState(false);

  if (!open || !option) return null;

  const guardrail = checkGuardrail({
    option,
    commercialModel: context.commercialModel,
    locked: context.locked,
    deliveryRole: context.deliveryRole,
    approvalThresholdUsd: context.approvalThresholdUsd,
  });

  function handleClose() {
    setNote('');
    setError(null);
    setExecuted(false);
    onClose();
  }

  function submit() {
    if (!option || !guardrail.canExecute) return;
    setError(null);
    const rationale = note.trim() ? `${option.summary}\n\nNote: ${note.trim()}` : option.summary;
    startTransition(async () => {
      const outcome = await runAction(
        () =>
          submitPortfolioIntervention({
            projectId,
            driver,
            optionKey: option.key,
            optionLabel: option.label,
            rationale,
            domino: option.domino,
            financialImpactUsd,
          }),
        { errorTitle: `Couldn't execute "${option.label}"` }
      );
      if (!outcome.ok) return;
      const res = outcome.data;
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setExecuted(true);
      toast({ variant: 'success', title: `"${option.label}" executed`, description: `Logged to ${projectName}'s audit trail.` });
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Governance decision">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-lg bg-surface-1 border-l border-border-soft shadow-elevated overflow-y-auto">
        <div className="sticky top-0 bg-surface-1 border-b border-border px-6 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
              Governance Decision
            </div>
            <h2 className="text-[15.5px] font-bold mt-0.5 truncate">{option.label}</h2>
            <p className="text-[12px] text-ink-faint mt-0.5 truncate">{projectName}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="w-7 h-7 flex-none rounded-sm border border-border-soft text-ink-muted hover:text-ink hover:border-ink-faint flex items-center justify-center"
          >
            &times;
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-5">
          {executed ? (
            <div className="card !border-l-[3px] !border-l-success">
              <div className="text-[13px] font-semibold text-success">Intervention executed</div>
              <p className="text-[12.5px] text-ink-muted mt-1">
                Recorded to the audit trail and Compliance Ledger. This drawer can be closed.
              </p>
            </div>
          ) : (
            <>
              <section>
                <div className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold mb-1.5">
                  Compliance / Guardrail Check
                </div>
                <div
                  className={clsx(
                    'card !p-3 flex items-start gap-2.5',
                    guardrail.canExecute ? '!border-l-[3px] !border-l-success' : '!border-l-[3px] !border-l-critical'
                  )}
                >
                  <span
                    className={clsx('status-dot mt-1 flex-none', guardrail.canExecute ? 'bg-success' : 'bg-critical')}
                  />
                  <div className="min-w-0">
                    <div className={clsx('text-[13px] font-semibold', guardrail.canExecute ? 'text-success' : 'text-critical')}>
                      {guardrail.canExecute ? 'Clear to execute' : 'Cannot execute'}
                    </div>
                    {guardrail.notes.length > 0 ? (
                      <ul className="mt-1 flex flex-col gap-1">
                        {guardrail.notes.map((n, i) => (
                          <li key={i} className="text-[12px] text-ink-muted leading-snug">
                            {n}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[12px] text-ink-muted mt-1">SOW type, baseline state, and approval authority all check out.</p>
                    )}
                  </div>
                </div>
              </section>

              <section>
                <div className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold mb-1.5">
                  Portfolio Domino &amp; Trade-off
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                  <DrawerField label="Margin Impact">
                    {option.domino.marginDeltaPct === null ? '—' : `${option.domino.marginDeltaPct > 0 ? '+' : ''}${option.domino.marginDeltaPct}%`}
                  </DrawerField>
                  <DrawerField label="Affected Project">{option.domino.affectedProjectName ?? '—'}</DrawerField>
                  <DrawerField label="Team Velocity Risk">{option.domino.teamVelocityRisk ?? '—'}</DrawerField>
                  <DrawerField label="Approval">
                    {option.domino.requiresApproval ? 'Required' : 'Not required'}
                  </DrawerField>
                </div>
                {option.domino.affectedProjectNote && (
                  <p className="text-[12px] text-ink-muted leading-snug mt-3">{option.domino.affectedProjectNote}</p>
                )}
              </section>

              <section>
                <label htmlFor="intervention-note" className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold mb-1.5 block">
                  Note (optional)
                </label>
                <textarea
                  id="intervention-note"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Anything worth adding to the record — context, caveats, who signed off verbally."
                  className="w-full rounded-sm border border-border bg-surface-1 px-3 py-2 text-[13px] resize-none"
                  maxLength={1800}
                />
              </section>

              {error && <p className="text-[12.5px] text-critical">{error}</p>}

              <button
                type="button"
                onClick={submit}
                disabled={pending || !guardrail.canExecute}
                className="btn-primary !w-full text-sm disabled:opacity-50"
              >
                {pending ? 'Executing…' : 'Submit for Governance Approval & Execute'}
              </button>
              {!guardrail.canExecute && (
                <p className="text-[11.5px] text-ink-faint -mt-2">
                  Resolve the guardrail above before this can be submitted.
                </p>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function DrawerField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold mb-1">{label}</div>
      <div className="text-[13px] text-ink leading-snug">{children}</div>
    </div>
  );
}
