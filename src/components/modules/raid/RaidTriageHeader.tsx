'use client';

/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * RAID Cockpit Executive Triage & Thematic Clustering
 * (docs/RAID_EXECUTIVE_TRIAGE.md) — the dual-tile macro summary banner
 * above the per-project picker on /raid. Tile 1 is the portfolio-wide
 * Red/Amber aggregate; Tile 2 groups the same open items by likely root
 * cause (src/lib/raid-triage.ts's keyword classifier — deterministic and
 * instant, not a live per-request LLM call) so a systemic pattern across
 * several projects reads as one story instead of N separate RAID logs.
 *
 * Interaction: a single click on a cluster's header expands it inline to
 * show the contributing projects/items — the primary, fully keyboard- and
 * screen-reader-accessible way to drill in (every item row is a real
 * <Link>). Double-clicking an item row is a power-user shortcut straight
 * to that project's RAID board, layered on top, never the only way in.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { SEVERITY_CLASS, SEVERITY_LABEL, type Severity } from '@/lib/ui/severity';
import {
  RAID_TYPE_ORDER,
  type RaidTriageResult,
  type RaidThemeCluster,
  type RaidTriageItem,
  type RaidType,
} from '@/lib/raid-triage';

const TYPE_LABEL: Record<RaidType, string> = { RISK: 'Risks', ASSUMPTION: 'Assumptions', ISSUE: 'Issues', DEPENDENCY: 'Dependencies' };

export function RaidTriageHeader({ triage }: { triage: RaidTriageResult }) {
  if (triage.totalCount === 0) {
    return (
      <div className="card !border-l-[3px] !border-l-success">
        <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Executive Triage</div>
        <h2 className="text-[15.5px] font-bold">Nothing Red or Amber across your portfolio</h2>
        <p className="text-[12.5px] text-ink-muted mt-1">
          No open Critical, High, or Medium RAID item in your scope. Pick an engagement below to review its log directly.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <TriageTile triage={triage} />
      <ClustersTile clusters={triage.clusters} />
    </div>
  );
}

function TriageTile({ triage }: { triage: RaidTriageResult }) {
  return (
    <div className="card !border-l-[6px] !border-l-critical !border !border-critical/25 flex flex-col gap-4">
      <div>
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
          Portfolio-Wide Critical Triage
        </div>
        <h2 className="text-[16.5px] font-bold mt-0.5">
          {triage.totalCount} item{triage.totalCount === 1 ? '' : 's'} need{triage.totalCount === 1 ? 's' : ''} attention
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md bg-critical-soft border border-critical/30 px-3.5 py-3">
          <div className="text-[10px] uppercase tracking-wide font-semibold text-critical/80">Red</div>
          <div className="text-[26px] font-display font-bold text-critical tabular-nums leading-none mt-1">
            {triage.redCount}
          </div>
          <div className="text-[11px] text-critical/70 mt-1">Critical / High severity</div>
        </div>
        <div className="rounded-md bg-warning-soft border border-warning/30 px-3.5 py-3">
          <div className="text-[10px] uppercase tracking-wide font-semibold text-warning/80">Amber</div>
          <div className="text-[26px] font-display font-bold text-warning tabular-nums leading-none mt-1">
            {triage.amberCount}
          </div>
          <div className="text-[11px] text-warning/70 mt-1">Medium severity</div>
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold mb-1.5">By type</div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {RAID_TYPE_ORDER.map((t) => (
            <span key={t} className="badge !py-1 !px-2.5">
              {TYPE_LABEL[t]} <span className="font-bold tabular-nums">{triage.byType[t]}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ClustersTile({ clusters }: { clusters: RaidThemeCluster[] }) {
  const [expanded, setExpanded] = useState<string | null>(clusters[0]?.theme ?? null);

  return (
    <div className="card flex flex-col gap-3">
      <div>
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
          Thematic Risk Clusters
        </div>
        <h2 className="text-[16.5px] font-bold mt-0.5">Systemic patterns across engagements</h2>
      </div>

      <div className="flex flex-col gap-2">
        {clusters.map((cluster) => (
          <ClusterCard
            key={cluster.theme}
            cluster={cluster}
            open={expanded === cluster.theme}
            onToggle={() => setExpanded((cur) => (cur === cluster.theme ? null : cluster.theme))}
          />
        ))}
      </div>
    </div>
  );
}

function ClusterCard({ cluster, open, onToggle }: { cluster: RaidThemeCluster; open: boolean; onToggle: () => void }) {
  const worstTone = cluster.redCount > 0 ? 'critical' : 'warning';
  const accentClass = worstTone === 'critical' ? 'border-l-critical' : 'border-l-warning';

  return (
    <div className={clsx('rounded-md border border-border-soft border-l-[4px] overflow-hidden', accentClass)}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-surface-2 transition-colors"
      >
        <div className="min-w-0">
          <div className="text-[13.5px] font-bold text-ink truncate">{cluster.label}</div>
          <div className="text-[11px] text-ink-faint truncate">{cluster.blurb}</div>
        </div>
        <div className="flex items-center gap-2 flex-none">
          <span className="text-[11px] text-ink-faint whitespace-nowrap">
            {cluster.projectCount} project{cluster.projectCount === 1 ? '' : 's'}
          </span>
          {cluster.redCount > 0 && (
            <span className="badge !border-0 !py-0.5 !px-2 bg-critical text-white text-[10.5px] font-bold">
              {cluster.redCount} Red
            </span>
          )}
          {cluster.amberCount > 0 && (
            <span className="badge !border-0 !py-0.5 !px-2 bg-warning text-white text-[10.5px] font-bold">
              {cluster.amberCount} Amber
            </span>
          )}
          <span className={clsx('text-ink-faint text-xs transition-transform', open && 'rotate-90')} aria-hidden>
            ▸
          </span>
        </div>
      </button>

      {open && (
        <div className="border-t border-border-soft divide-y divide-border/60 bg-surface-1">
          {cluster.items.map((item) => (
            <ClusterItemRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function ClusterItemRow({ item }: { item: RaidTriageItem }) {
  const router = useRouter();
  const href = `/raid/${item.projectId}`;

  return (
    <Link
      href={href}
      onDoubleClick={(e) => {
        // Same destination as a normal click — the double-click is a
        // power-user shortcut, not a distinct action, so pre-empting the
        // single navigation here just avoids a redundant second push.
        e.preventDefault();
        router.push(href);
      }}
      title="Open this project's RAID log — double-click for the same thing, faster"
      className="flex items-start justify-between gap-3 px-3.5 py-2.5 hover:bg-surface-2 transition-colors"
    >
      <div className="min-w-0 flex items-start gap-2">
        <span
          className={clsx(
            'flex-none mt-0.5 text-[9.5px] font-semibold uppercase tracking-wide rounded-full px-1.5 py-0.5',
            SEVERITY_CLASS[item.severity as Severity]
          )}
        >
          {SEVERITY_LABEL[item.severity as Severity]}
        </span>
        <div className="min-w-0">
          <div className="text-[12.5px] font-semibold text-ink leading-snug truncate">
            {item.title || item.description.slice(0, 80)}
          </div>
          <div className="text-[11px] text-ink-faint mt-0.5 truncate">
            {item.projectName}
            {item.ownerName ? ` · ${item.ownerName}` : ''}
            {item.targetDate && (
              <span className={item.overdue ? 'text-critical font-semibold' : undefined}>
                {' · '}
                {item.overdue ? 'Overdue · was ' : 'Due '}
                {new Date(item.targetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        </div>
      </div>
      <span className="flex-none text-brand text-[11px] font-semibold whitespace-nowrap">Open →</span>
    </Link>
  );
}
