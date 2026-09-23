'use client';

/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Resource & Capacity Cockpit Executive Triage & Thematic Clustering
 * (docs/RESOURCE_CAPACITY_TRIAGE.md) — the dual-tile macro summary banner
 * above the Utilization/Concurrency/Forecast/Controls tabs on /capacity,
 * mirroring the RAID, Financial Realization, and Schedule cockpits'
 * pattern: same card language, same RAG badge hierarchy, same single-
 * click-to-expand / drill-down interaction.
 *
 * One deliberate difference from the other three: a cluster member here
 * is a RESOURCE, not a project (a resource can itself touch several
 * projects), and /capacity has no dedicated per-resource route — the
 * roster already lives in one table on this same page (the Utilization
 * tab). So the drill-down target is a same-page anchor
 * (`#resource-{id}`, landing on the row the page already renders — see
 * CapacityCockpit.tsx's `id="resource-…"` on that <tr>), via a plain
 * `<a>` rather than next/link: a pure in-page jump has no route to
 * transition, and a plain anchor is the simplest, fully keyboard/screen-
 * reader-accessible way to express that — no custom double-click handler
 * needed either, since a browser's native anchor click already does the
 * "same destination" jump on its own.
 */
import { useState } from 'react';
import clsx from 'clsx';
import { pctLabel } from '@/lib/capacity-engine';
import type { ResourceTriageResult, ResourceThemeCluster, ResourceTriageItem } from '@/lib/resource-triage';

export function ResourceTriageHeader({ triage }: { triage: ResourceTriageResult }) {
  if (triage.resourceCount === 0) {
    return (
      <div className="card !border-l-[3px] !border-l-success">
        <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Executive Triage</div>
        <h2 className="text-[15.5px] font-bold">No scoped billable resources yet</h2>
        <p className="text-[12.5px] text-ink-muted mt-1">Once a billable head is in your scope, their utilization picture shows up here.</p>
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

function TriageTile({ triage }: { triage: ResourceTriageResult }) {
  return (
    <div className="card !border-l-[6px] !border-l-critical !border !border-critical/25 flex flex-col gap-4">
      <div>
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
          Portfolio Resource &amp; Capacity Triage
        </div>
        <h2 className="text-[16.5px] font-bold mt-0.5">
          {pctLabel(triage.utilizationPct)} blended utilization across {triage.resourceCount} resource
          {triage.resourceCount === 1 ? '' : 's'}
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold">Unassigned headcount</div>
          <div className="text-[18px] font-display font-bold text-ink tabular-nums leading-tight mt-0.5">{triage.benchCount}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold">Severely over-allocated</div>
          <div className="text-[18px] font-display font-bold text-critical tabular-nums leading-tight mt-0.5">
            {triage.severelyOverAllocatedCount}
          </div>
          <div className="text-[10px] text-ink-faint mt-0.5">&gt;110% of capacity</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-md bg-critical-soft border border-critical/30 px-3.5 py-3">
          <div className="text-[10px] uppercase tracking-wide font-semibold text-critical/80">Over-allocated</div>
          <div className="text-[22px] font-display font-bold text-critical tabular-nums leading-none mt-1">{triage.redCount}</div>
        </div>
        <div className="rounded-md bg-warning-soft border border-warning/30 px-3.5 py-3">
          <div className="text-[10px] uppercase tracking-wide font-semibold text-warning/80">Under-utilized</div>
          <div className="text-[22px] font-display font-bold text-warning tabular-nums leading-none mt-1">{triage.amberCount}</div>
        </div>
        <div className="rounded-md bg-success-soft border border-success/30 px-3.5 py-3">
          <div className="text-[10px] uppercase tracking-wide font-semibold text-success/80">Optimal</div>
          <div className="text-[22px] font-display font-bold text-success tabular-nums leading-none mt-1">{triage.optimalCount}</div>
        </div>
      </div>
    </div>
  );
}

function ClustersTile({ clusters }: { clusters: ResourceThemeCluster[] }) {
  const [expanded, setExpanded] = useState<string | null>(clusters[0]?.theme ?? null);

  if (clusters.length === 0) {
    return (
      <div className="card !border-l-[3px] !border-l-success flex flex-col gap-2">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Allocation Bottleneck &amp; Skill Risk Clusters</div>
          <h2 className="text-[15.5px] font-bold mt-0.5">Every billable head is in the optimal band</h2>
        </div>
        <p className="text-[12.5px] text-ink-muted">Nobody in your scope is over-allocated or tracking under target. Review the roster below for detail.</p>
      </div>
    );
  }

  return (
    <div className="card flex flex-col gap-3">
      <div>
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Allocation Bottleneck &amp; Skill Risk Clusters</div>
        <h2 className="text-[16.5px] font-bold mt-0.5">Systemic staffing patterns across the roster</h2>
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

function ClusterCard({ cluster, open, onToggle }: { cluster: ResourceThemeCluster; open: boolean; onToggle: () => void }) {
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
            {cluster.resourceCount} resource{cluster.resourceCount === 1 ? '' : 's'} · {cluster.projectCount} project
            {cluster.projectCount === 1 ? '' : 's'}
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

function ClusterItemRow({ item }: { item: ResourceTriageItem }) {
  return (
    <a
      href={`#resource-${item.id}`}
      title="Jump to this resource's row in the Utilization table below"
      className="flex items-start justify-between gap-3 px-3.5 py-2.5 hover:bg-surface-2 transition-colors"
    >
      <div className="min-w-0 flex items-start gap-2">
        <span className={clsx('flex-none mt-0.5 text-[9.5px] font-semibold uppercase tracking-wide rounded-full px-1.5 py-0.5', RAG_BADGE_CLASS[item.rag])}>
          {item.rag}
        </span>
        <div className="min-w-0">
          <div className="text-[12.5px] font-semibold text-ink leading-snug truncate">{item.name}</div>
          <div className="text-[11px] text-ink-faint mt-0.5 truncate">
            {item.roleName ?? 'No role set'} · {item.psPractice}
            {' · '}
            <span className="font-semibold">
              {pctLabel(item.utilizationPct)} utilized
              {item.overloaded ? ` · ${item.projectCount} concurrent projects` : ''}
            </span>
          </div>
        </div>
      </div>
      <span className="flex-none text-brand text-[11px] font-semibold whitespace-nowrap">View →</span>
    </a>
  );
}
