/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * The PS Control Tower's Decision Center — the exception-driven "what
 * needs my attention today" panel that renders above the full portfolio
 * tabs. Curated by construction: it only ever lists engagements/decisions/
 * RAID items that are actually exceptions (red health, an open decision,
 * a still-open CRITICAL or HIGH risk/issue) within the viewer's own scope
 * — a Project Manager's card is short because their scope is small, a
 * Practice Director's or Admin's reflects their wider one. Nothing here
 * gates access; it is a curated read on data the viewer can already see.
 */
import Link from 'next/link';
import type { DecisionAlert, RaidAlert } from '@/server/queries/pages/dashboards';
import type { TriageItem, TriageDriver } from '@/lib/executive-triage';

const DRIVER_LABEL: Record<TriageDriver, string> = {
  'Governance Red': 'Governance',
  'Over Budget': 'Over Budget',
  'Behind Schedule': 'Behind Sched.',
};

export interface DecisionCenterProps {
  /** Red / over-budget / behind-schedule engagements, same engine and
   * scope as the Command Center's Executive Action Triage feed
   * (docs/UI_DESIGN_SYSTEM.md §6) — the two pages always agree on which
   * engagements are flagged and why, whichever one a viewer lands on. */
  triageItems: TriageItem[];
  pendingDecisions: DecisionAlert[];
  criticalRaid: RaidAlert[];
}

function formatDue(iso: string | null, overdue: boolean): string | null {
  if (!iso) return null;
  const date = new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return overdue ? `Overdue · was ${date}` : `Due ${date}`;
}

function EmptyColumn({ text }: { text: string }) {
  return <p className="text-[12.5px] text-ink-faint italic py-2">{text}</p>;
}

function AlertRow({
  href,
  title,
  meta,
  overdue,
  badge,
  dot,
}: {
  href: string;
  title: string;
  meta: string | null;
  overdue?: boolean;
  badge?: { label: string; tone: 'critical' | 'warning' };
  /** A status dot before the title, matching the health-dot convention
   * used everywhere else in the Control Tower (bg-critical/bg-warning). */
  dot?: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-start justify-between gap-3 py-2 border-b border-border/60 last:border-0 hover:bg-surface-2 -mx-1 px-1 rounded-sm transition-colors"
    >
      <div className="min-w-0 flex items-start gap-2">
        {dot && <span className={`status-dot ${dot} mt-1.5 flex-none`} />}
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-ink leading-snug truncate">{title}</div>
          {meta && (
            <div className={`text-[11px] mt-0.5 ${overdue ? 'text-critical font-semibold' : 'text-ink-faint'}`}>
              {meta}
            </div>
          )}
        </div>
      </div>
      {badge && (
        <span
          className={`flex-none text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
            badge.tone === 'critical' ? 'bg-critical-soft text-critical' : 'bg-warning-soft text-warning'
          }`}
        >
          {badge.label}
        </span>
      )}
    </Link>
  );
}

export function DecisionCenter({ triageItems, pendingDecisions, criticalRaid }: DecisionCenterProps) {
  const total = triageItems.length + pendingDecisions.length + criticalRaid.length;

  return (
    <div className="card !border-l-[3px] !border-l-brand">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Decision Center</div>
          <h2 className="text-[16.5px] font-bold leading-tight">
            {total === 0 ? 'Nothing needs your attention right now' : `${total} item${total === 1 ? '' : 's'} need your attention today`}
          </h2>
        </div>
      </div>

      {total === 0 ? (
        <p className="text-[12.5px] text-ink-muted mt-2">
          No red engagements, no open decisions, and no high-severity RAID open in your scope. The full portfolio is
          below.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-6 gap-y-4 mt-3">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">
              Red or over budget ({triageItems.length})
            </div>
            {triageItems.length === 0 ? (
              <EmptyColumn text="No red or over-budget engagements." />
            ) : (
              <div>
                {triageItems.map((item) => (
                  <AlertRow
                    key={item.projectId}
                    href={item.driverHref}
                    title={item.projectName}
                    meta={[item.cause, item.financialImpact ?? item.scheduleImpact].filter(Boolean).join(' · ')}
                    dot="bg-critical"
                    badge={{ label: DRIVER_LABEL[item.drivers[0]!], tone: 'critical' }}
                  />
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">
              Pending decisions ({pendingDecisions.length})
            </div>
            {pendingDecisions.length === 0 ? (
              <EmptyColumn text="No open decisions." />
            ) : (
              <div>
                {pendingDecisions.map((d) => (
                  <AlertRow
                    key={d.id}
                    href={`/reports?project=${d.projectId}`}
                    title={d.decisionRequired}
                    meta={
                      [d.projectName, d.ownerName ?? undefined, formatDue(d.resolutionTargetDate, d.overdue)]
                        .filter(Boolean)
                        .join(' · ') || null
                    }
                    overdue={d.overdue}
                  />
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">
              High-severity RAID ({criticalRaid.length})
            </div>
            {criticalRaid.length === 0 ? (
              <EmptyColumn text="No high-severity RAID open." />
            ) : (
              <div>
                {criticalRaid.map((r) => (
                  <AlertRow
                    key={r.id}
                    href={`/raid/${r.projectId}`}
                    title={r.title}
                    meta={[r.projectName, formatDue(r.targetDate, r.overdue)].filter(Boolean).join(' · ') || null}
                    overdue={r.overdue}
                    badge={{ label: r.severity, tone: r.severity === 'CRITICAL' ? 'critical' : 'warning' }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
