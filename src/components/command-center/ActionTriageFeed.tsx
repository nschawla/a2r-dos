import Link from 'next/link';
import clsx from 'clsx';
import { ProvenanceStamp } from '@/components/ui/provenance-stamp';
import type { TriageItem, TriageDriver } from '@/lib/executive-triage';

/**
 * The Command Center's Executive Action Triage feed
 * (docs/UI_DESIGN_SYSTEM.md §6) — the top of the page, replacing a passive
 * metric strip as the first thing an executive sees. One card per Red or
 * over-budget engagement, always carrying the same four answers: what's
 * wrong (Cause), how bad (Impact), who/by when (Owner & Deadline), and
 * what has to happen (Required Action) — so nobody hunts through module
 * tabs to reconstruct the story.
 */
const DRIVER_META: Record<TriageDriver, string> = {
  'Governance Red': 'Governance Red',
  'Over Budget': 'Over Budget',
  'Behind Schedule': 'Behind Schedule',
};

export function ActionTriageFeed({ items }: { items: TriageItem[] }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
          Executive Action Triage
        </div>
        <h2 className="text-[16.5px] font-bold mt-0.5">
          {items.length === 0
            ? 'Nothing Red or over budget right now'
            : `${items.length} engagement${items.length === 1 ? '' : 's'} need${items.length === 1 ? 's' : ''} a decision today`}
        </h2>
      </div>

      {items.length === 0 ? (
        <p className="card !border-l-[3px] !border-l-success text-[12.5px] text-ink-muted">
          No engagement in your scope is Red or over budget. The full portfolio is below.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <TriageCard key={item.projectId} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

function TriageCard({ item }: { item: TriageItem }) {
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

      <div className="flex justify-end -mt-1">
        <Link href={item.driverHref} className="text-brand text-xs font-semibold hover:underline">
          Review the evidence →
        </Link>
      </div>
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
