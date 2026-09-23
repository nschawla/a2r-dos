'use client';

/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Schedule & Milestones Cockpit Executive Triage & Thematic Clustering
 * (docs/SCHEDULE_MILESTONES_TRIAGE.md) — the dual-tile macro summary
 * banner above the per-project picker on /schedule, mirroring the RAID
 * and Financial Realization cockpits' pattern exactly: same card
 * language, same RAG badge hierarchy, same single-click-to-expand /
 * double-click-to-drill interaction.
 *
 * Tile 1 is the portfolio-wide milestone-health rollup (active milestones,
 * Red/Amber split, upcoming go-lives); Tile 2 groups the at-risk project
 * subset by likely scheduling root cause (src/lib/schedule-triage.ts's
 * structured-signal classifier — deterministic and instant, not a live
 * per-request LLM call).
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import type { ScheduleTriageResult, ScheduleThemeCluster, ScheduleTriageItem } from '@/lib/schedule-triage';

export function ScheduleTriageHeader({ triage }: { triage: ScheduleTriageResult }) {
  if (triage.projectCount === 0) {
    return (
      <div className="card !border-l-[3px] !border-l-success">
        <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Executive Triage</div>
        <h2 className="text-[15.5px] font-bold">No scoped engagements yet</h2>
        <p className="text-[12.5px] text-ink-muted mt-1">Once a project is in your scope, its milestone timeline shows up here.</p>
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

function TriageTile({ triage }: { triage: ScheduleTriageResult }) {
  return (
    <div className="card !border-l-[6px] !border-l-critical !border !border-critical/25 flex flex-col gap-4">
      <div>
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
          Portfolio Schedule &amp; Milestone Triage
        </div>
        <h2 className="text-[16.5px] font-bold mt-0.5">
          {triage.activeMilestoneCount} active milestone{triage.activeMilestoneCount === 1 ? '' : 's'} across {triage.projectCount} project
          {triage.projectCount === 1 ? '' : 's'}
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold">Go-live in 30 days</div>
          <div className="text-[18px] font-display font-bold text-ink tabular-nums leading-tight mt-0.5">{triage.goLiveNext30}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold">Go-live in 60 days</div>
          <div className="text-[18px] font-display font-bold text-ink tabular-nums leading-tight mt-0.5">{triage.goLiveNext60}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md bg-critical-soft border border-critical/30 px-3.5 py-3">
          <div className="text-[10px] uppercase tracking-wide font-semibold text-critical/80">Red</div>
          <div className="text-[26px] font-display font-bold text-critical tabular-nums leading-none mt-1">
            {triage.redMilestoneCount}
          </div>
          <div className="text-[11px] text-critical/70 mt-1">Delayed / critical slip</div>
        </div>
        <div className="rounded-md bg-warning-soft border border-warning/30 px-3.5 py-3">
          <div className="text-[10px] uppercase tracking-wide font-semibold text-warning/80">Amber</div>
          <div className="text-[26px] font-display font-bold text-warning tabular-nums leading-none mt-1">
            {triage.amberMilestoneCount}
          </div>
          <div className="text-[11px] text-warning/70 mt-1">At-risk pace or slip</div>
        </div>
      </div>

      <div className="text-[11px] text-ink-faint">
        <span className="font-semibold text-ink">{triage.onTrackMilestoneCount}</span> active milestone
        {triage.onTrackMilestoneCount === 1 ? '' : 's'} on track.
      </div>
    </div>
  );
}

function ClustersTile({ clusters }: { clusters: ScheduleThemeCluster[] }) {
  const [expanded, setExpanded] = useState<string | null>(clusters[0]?.theme ?? null);

  if (clusters.length === 0) {
    return (
      <div className="card !border-l-[3px] !border-l-success flex flex-col gap-2">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Schedule Bottleneck &amp; Risk Clusters</div>
          <h2 className="text-[15.5px] font-bold mt-0.5">Nothing Amber or Red across your portfolio</h2>
        </div>
        <p className="text-[12.5px] text-ink-muted">Every scoped engagement is tracking to plan. Pick one below to review its schedule directly.</p>
      </div>
    );
  }

  return (
    <div className="card flex flex-col gap-3">
      <div>
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Schedule Bottleneck &amp; Risk Clusters</div>
        <h2 className="text-[16.5px] font-bold mt-0.5">Systemic slip patterns across engagements</h2>
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

function ClusterCard({ cluster, open, onToggle }: { cluster: ScheduleThemeCluster; open: boolean; onToggle: () => void }) {
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
          <span className="text-[11px] text-ink-faint whitespace-nowrap tabular-nums">
            {cluster.projectCount} project{cluster.projectCount === 1 ? '' : 's'} · {cluster.totalSlipDays}d slipped
          </span>
          {cluster.redCount > 0 && (
            <span className="badge !border-0 !py-0.5 !px-2 bg-critical text-white text-[10.5px] font-bold">{cluster.redCount} Red</span>
          )}
          {cluster.amberCount > 0 && (
            <span className="badge !border-0 !py-0.5 !px-2 bg-warning text-white text-[10.5px] font-bold">{cluster.amberCount} Amber</span>
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

const RAG_BADGE_CLASS: Record<'Red' | 'Amber', string> = {
  Red: 'bg-critical-soft text-critical',
  Amber: 'bg-warning-soft text-warning',
};

function ClusterItemRow({ item }: { item: ScheduleTriageItem }) {
  const router = useRouter();
  const href = `/schedule/${item.id}`;

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
      title="Open this project's schedule — double-click for the same thing, faster"
      className="flex items-start justify-between gap-3 px-3.5 py-2.5 hover:bg-surface-2 transition-colors"
    >
      <div className="min-w-0 flex items-start gap-2">
        <span className={clsx('flex-none mt-0.5 text-[9.5px] font-semibold uppercase tracking-wide rounded-full px-1.5 py-0.5', RAG_BADGE_CLASS[item.rag])}>
          {item.rag}
        </span>
        <div className="min-w-0">
          <div className="text-[12.5px] font-semibold text-ink leading-snug truncate">{item.name}</div>
          <div className="text-[11px] text-ink-faint mt-0.5 truncate">
            <span className={item.worstSlipDays > 0 ? 'text-critical font-semibold' : 'text-success font-semibold'}>
              {item.worstSlipDays > 0 ? `${item.worstSlipDays}d slipped` : 'No net slip'}
            </span>
          </div>
        </div>
      </div>
      <span className="flex-none text-brand text-[11px] font-semibold whitespace-nowrap">Open →</span>
    </Link>
  );
}
