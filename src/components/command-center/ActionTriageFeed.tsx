import { DecisionCard } from './DecisionCard';
import type { InterventionDrawerContext } from './InterventionDrawer';
import type { TriageItem } from '@/lib/executive-triage';
import type { DecisionContextEntry } from '@/server/queries/decision-context';

/**
 * The Command Center's Impact-Aware Decision feed
 * (docs/PORTFOLIO_ORCHESTRATION.md) — the top of the page, replacing a
 * passive metric strip as the first thing an executive sees. One
 * DecisionCard per Red or over-budget engagement, each carrying the same
 * four answers (Cause/Impact/Owner & Deadline/Required Action) plus real,
 * PS-grounded response options and their portfolio domino preview — so
 * nobody hunts through module tabs to reconstruct the story, and a
 * decision can actually be executed from right here.
 */
export function ActionTriageFeed({
  items,
  decisionContext,
  viewer,
}: {
  items: TriageItem[];
  decisionContext: Map<string, DecisionContextEntry>;
  viewer: Pick<InterventionDrawerContext, 'deliveryRole' | 'approvalThresholdUsd'>;
}) {
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
            <DecisionCard key={item.projectId} item={item} decision={decisionContext.get(item.projectId)} viewer={viewer} />
          ))}
        </div>
      )}
    </section>
  );
}
