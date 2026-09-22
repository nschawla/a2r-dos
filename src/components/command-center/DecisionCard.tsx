'use client';

/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Impact-Aware Decision Card (docs/PORTFOLIO_ORCHESTRATION.md) — the
 * upgraded form of the Executive Action Triage card. Keeps the existing
 * Cause/Impact/Owner & Deadline/Required Action narrative and evidence
 * link exactly as before, and adds: a Client Strategic Context badge, a
 * row of 2-3 commercially viable response options (each opening
 * InterventionDrawer), and an "Intervention Applied" badge once a
 * decision has actually been executed for this project. Shared by the
 * Command Center's ActionTriageFeed and the Portfolio's DecisionCenter —
 * the two pages always show the identical card for the identical data.
 */
import { useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { ProvenanceStamp } from '@/components/ui/provenance-stamp';
import { InterventionDrawer, type InterventionDrawerContext } from './InterventionDrawer';
import type { TriageItem, TriageDriver } from '@/lib/executive-triage';
import type { DecisionOption } from '@/lib/decision-options';
import type { DecisionContextEntry } from '@/server/queries/decision-context';

const DRIVER_META: Record<TriageDriver, string> = {
  'Governance Red': 'Governance Red',
  'Over Budget': 'Over Budget',
  'Behind Schedule': 'Behind Schedule',
};

export function DecisionCard({
  item,
  decision,
  viewer,
}: {
  item: TriageItem;
  decision: DecisionContextEntry | undefined;
  /** The signed-in viewer's real role + this tenant's approval threshold —
   * page-level, the same for every card. Per-project `commercialModel`/
   * `locked` come from `decision` itself, merged below into the full
   * InterventionDrawerContext the drawer needs. */
  viewer: Pick<InterventionDrawerContext, 'deliveryRole' | 'approvalThresholdUsd'>;
}) {
  const [openOption, setOpenOption] = useState<DecisionOption | null>(null);
  const options = decision?.options ?? [];
  const lastIntervention = decision?.lastIntervention ?? null;
  const financialImpactUsd = parseUsd(item.financialImpact);

  return (
    <div className="card !border-l-[3px] !border-l-critical flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
            {item.drivers.map((d) => (
              <span key={d} className="badge !border-0 !py-0.5 !px-2 bg-critical-soft text-critical text-[10.5px]">
                {DRIVER_META[d]}
              </span>
            ))}
            {decision && (
              <span
                className={clsx(
                  'badge !border-0 !py-0.5 !px-2 text-[10.5px]',
                  decision.clientTier === 'STRATEGIC' ? 'bg-brand/10 text-brand' : 'bg-surface-3 text-ink-faint'
                )}
              >
                {decision.clientTier === 'STRATEGIC' ? 'Tier 1 Strategic Account' : 'Standard Account'}
              </span>
            )}
          </div>
          <Link href={item.driverHref} className="text-[15.5px] font-bold hover:text-brand transition-colors">
            {item.projectName}
          </Link>
        </div>
        <ProvenanceStamp at={item.lastUpdated} className="flex-none" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-3">
        <TriageField label="Cause">{item.cause}</TriageField>
        <TriageField label="Impact">
          {[item.financialImpact, item.scheduleImpact].filter(Boolean).join(' · ') || 'Not yet quantified'}
        </TriageField>
        <TriageField label="Owner & Deadline">
          <span>{item.ownerName ?? 'Unassigned'}</span>
          {item.deadline && (
            <span className={clsx('block text-[11.5px] mt-0.5', item.overdue ? 'text-critical font-semibold' : 'text-ink-faint')}>
              {item.overdue ? 'Overdue · was ' : 'Due '}
              {new Date(item.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </TriageField>
        <TriageField label="Required Action">{item.requiredAction}</TriageField>
      </div>

      {lastIntervention && (
        <div className="flex items-center gap-2 text-[12px] bg-surface-2 rounded-sm px-3 py-2">
          <span className="status-dot bg-brand flex-none" />
          <span className="text-ink-muted">
            Intervention Applied · <span className="font-semibold text-ink">{lastIntervention.optionLabel}</span> ·{' '}
            {lastIntervention.decidedByName}
          </span>
          <ProvenanceStamp at={lastIntervention.createdAt} source="Executed" className="ml-auto flex-none" />
        </div>
      )}

      {options.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold mb-2">
            {lastIntervention ? 'Take another action' : 'Commercially Viable Options'}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {options.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setOpenOption(opt)}
                title={opt.summary}
                className="rounded-2xl border-2 border-border-soft bg-surface-1 px-3.5 py-2 text-[12.5px] font-semibold text-ink hover:border-brand hover:bg-brand/[0.06] hover:text-brand transition-all duration-150 ease-out"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end -mt-1">
        <Link href={item.driverHref} className="text-brand text-xs font-semibold hover:underline">
          Review the evidence →
        </Link>
      </div>

      <InterventionDrawer
        open={openOption !== null}
        onClose={() => setOpenOption(null)}
        projectId={item.projectId}
        projectName={item.projectName}
        driver={item.drivers.join(', ')}
        option={openOption}
        financialImpactUsd={financialImpactUsd}
        context={{
          commercialModel: decision?.commercialModel ?? '',
          locked: decision?.locked ?? false,
          deliveryRole: viewer.deliveryRole,
          approvalThresholdUsd: viewer.approvalThresholdUsd,
        }}
      />
    </div>
  );
}

function TriageField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold mb-1">{label}</div>
      <div className="text-[13px] text-ink leading-snug">{children}</div>
    </div>
  );
}

/** TriageItem.financialImpact is a formatted string like "$45,000 over
 * budget" — parse the raw number back out for the server payload rather
 * than threading a second numeric field through the whole triage pipeline
 * just for this. Returns null for anything that doesn't parse (e.g. a
 * schedule-only impact with no $ figure). */
function parseUsd(financialImpact: string | null): number | null {
  if (!financialImpact) return null;
  const match = financialImpact.match(/[\d,]+/);
  if (!match) return null;
  const n = Number(match[0].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}
