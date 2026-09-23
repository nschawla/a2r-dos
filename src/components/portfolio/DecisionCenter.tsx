/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * The PS Control Tower's Decision Center — the exception-driven "what
 * needs my attention today" panel that renders above the full portfolio
 * tabs. Curated by construction: it only ever lists engagements/decisions/
 * RAID items that are actually exceptions (red health, an open decision,
 * a still-open CRITICAL or HIGH risk/issue) within the viewer's own scope
 * — a Project Manager's card is short because their scope is small, a
 * Practice Director's or Admin's reflects their wider one. Nothing here
 * gates access; it is a curated read on data the viewer can already see.
 *
 * PS Orchestration & Decision Engine (docs/PORTFOLIO_ORCHESTRATION.md) — the
 * Red/over-budget/behind-schedule set now renders as full Impact-Aware
 * Decision Cards (the same component the Command Center uses), not a
 * one-line alert row: this is the richest, most actionable content in the
 * panel and earns the space. Pending decisions and high-severity RAID —
 * a different, narrower exception type not every one of which sits on a
 * flagged project — stay in their existing compact strip beneath it.
 */
import Link from 'next/link';
import { DecisionCard } from '@/components/command-center/DecisionCard';
import type { InterventionDrawerContext } from '@/components/command-center/InterventionDrawer';
import type { DecisionAlert, RaidAlert } from '@/server/queries/pages/dashboards';
import type { TriageItem } from '@/lib/executive-triage';
import type { DecisionContextEntry } from '@/server/queries/decision-context';

export interface DecisionCenterProps {
  /** Red / over-budget / behind-schedule engagements, same engine and
   * scope as the Command Center's Executive Action Triage feed
   * (docs/UI_DESIGN_SYSTEM.md §6) — the two pages always agree on which
   * engagements are flagged and why, whichever one a viewer lands on. */
  triageItems: TriageItem[];
  decisionContext: Map<string, DecisionContextEntry>;
  viewer: Pick<InterventionDrawerContext, 'deliveryRole' | 'approvalThresholdUsd'>;
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
}: {
  href: string;
  title: string;
  meta: string | null;
  overdue?: boolean;
  badge?: { label: string; tone: 'critical' | 'warning' };
}) {
  return (
    <Link
      href={href}
      className="flex items-start justify-between gap-3 py-2 border-b border-border/60 last:border-0 hover:bg-surface-2 -mx-1 px-1 rounded-sm transition-colors"
    >
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-ink leading-snug truncate">{title}</div>
        {meta && (
          <div className={`text-[11px] mt-0.5 ${overdue ? 'text-critical font-semibold' : 'text-ink-faint'}`}>{meta}</div>
        )}
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

/**
 * Bento-grid summary tile (Control Tower UX Refactor,
 * docs/UI_DESIGN_SYSTEM.md §5.1 / "no-scroll" discipline) — the same
 * headline this file's full `DecisionCenter` opens with, sized down to a
 * single above-the-fold card so an executive reads "how many things need
 * me today" without scrolling to the Decisions tab first. A plain `<a>`
 * (not next/link) to `?v=decisions`: a full navigation always lands
 * correctly on the right ModuleTabs panel (it reads `?v=` on mount), and
 * deliberately sidesteps this session's documented same-pathname
 * client-router issue rather than risking a silent no-op on what is meant
 * to be this tile's primary action.
 */
export function DecisionCenterSummary({ triageItems, pendingDecisions, criticalRaid }: Pick<DecisionCenterProps, 'triageItems' | 'pendingDecisions' | 'criticalRaid'>) {
  const total = triageItems.length + pendingDecisions.length + criticalRaid.length;

  return (
    <a
      href="?v=decisions"
      className="card !p-4 !border-l-[3px] !border-l-brand h-full flex flex-col gap-2 hover:border-brand/50 transition-colors"
    >
      <div className="text-[10.5px] uppercase tracking-wide text-ink-faint font-semibold">Decision Center</div>
      <div className="text-[16px] font-bold leading-tight">
        {total === 0 ? 'Nothing needs your attention' : `${total} item${total === 1 ? '' : 's'} need attention today`}
      </div>
      {total === 0 ? (
        <p className="text-[12px] text-ink-muted mt-auto">
          No red engagements, open decisions, or high-severity RAID in your scope.
        </p>
      ) : (
        <div className="flex items-center gap-1.5 flex-wrap mt-auto pt-1">
          {triageItems.length > 0 && (
            <span className="badge !border-0 !py-0.5 !px-2 bg-critical text-white text-[10.5px] font-bold">
              {triageItems.length} flagged
            </span>
          )}
          {pendingDecisions.length > 0 && (
            <span className="badge !border-0 !py-0.5 !px-2 bg-warning text-white text-[10.5px] font-bold">
              {pendingDecisions.length} pending
            </span>
          )}
          {criticalRaid.length > 0 && (
            <span className="badge !border-0 !py-0.5 !px-2 bg-warning-soft text-warning text-[10.5px] font-bold">
              {criticalRaid.length} RAID
            </span>
          )}
          <span className="ml-auto text-brand text-[11.5px] font-semibold whitespace-nowrap">View all →</span>
        </div>
      )}
    </a>
  );
}

export function DecisionCenter({ triageItems, decisionContext, viewer, pendingDecisions, criticalRaid }: DecisionCenterProps) {
  const total = triageItems.length + pendingDecisions.length + criticalRaid.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="card !border-l-[3px] !border-l-brand">
        <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Decision Center</div>
        <h2 className="text-[16.5px] font-bold leading-tight">
          {total === 0 ? 'Nothing needs your attention right now' : `${total} item${total === 1 ? '' : 's'} need your attention today`}
        </h2>
        {total === 0 && (
          <p className="text-[12.5px] text-ink-muted mt-2">
            No red engagements, no open decisions, and no high-severity RAID open in your scope. The full portfolio is
            below.
          </p>
        )}
      </div>

      {triageItems.length > 0 && (
        <div className="flex flex-col gap-3">
          {triageItems.map((item) => (
            <DecisionCard key={item.projectId} item={item} decision={decisionContext.get(item.projectId)} viewer={viewer} />
          ))}
        </div>
      )}

      {(pendingDecisions.length > 0 || criticalRaid.length > 0) && (
        <div className="card grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
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
