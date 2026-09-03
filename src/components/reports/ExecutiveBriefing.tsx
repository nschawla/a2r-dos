'use client';

import clsx from 'clsx';
import type { ExecutiveBriefing as Briefing } from '@/server/queries/executive-briefing';
import { MaskedValue, RestrictedBadge } from '@/components/security/Masked';

function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}
function pct(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}
function pts(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)} pts`;
}

const BAND_CLASS = {
  green: 'exec-band-green bg-success-soft text-success',
  amber: 'exec-band-amber bg-warning-soft text-warning',
  red: 'exec-band-red bg-critical-soft text-critical',
} as const;

export function ExecutiveBriefing({
  briefing,
  showFinancials = true,
}: {
  briefing: Briefing;
  showFinancials?: boolean;
}) {
  const { macro, utilization, concurrency, healthDistribution, burn, criticalRaid } = briefing;
  const generated = new Date(briefing.generatedAt);

  return (
    <div className="exec-briefing flex flex-col gap-5">
      {/* action bar — screen only */}
      <div className="no-print card !p-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-0.5">Executive Briefing</div>
          <p className="text-[12.5px] text-ink-muted">
            Portfolio-wide board briefing — one page per section, print-optimised for PDF export.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="btn-primary !w-auto px-5 whitespace-nowrap"
        >
          Print / Export Executive Briefing
        </button>
      </div>

      {/* document header — prints */}
      <header className="exec-section border-b border-border pb-3">
        <div className="text-[11px] uppercase tracking-[0.14em] text-ink-faint font-semibold">
          A2R Delivery OS · Executive Briefing
        </div>
        <h2 className="text-xl font-display font-bold mt-0.5">{briefing.organizationName} — Portfolio Review</h2>
        <p className="text-[12px] exec-muted text-ink-faint mt-1">
          Generated {generated.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} at{' '}
          {generated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} ·{' '}
          {macro.activeEngagements} active engagements ({macro.lockedEngagements} baseline-locked)
        </p>
      </header>

      {/* ── Section 1 ── */}
      <section className="exec-section flex flex-col gap-3">
        <SectionTitle n={1} title="Executive Summary & Macro KPIs" />
        {!showFinancials && (
          <div className="flex items-center gap-2 text-[11.5px] text-ink-faint">
            <RestrictedBadge />
            Cost, margin and financial-variance figures on this briefing are restricted to Partners and Finance / Ops leads.
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Kpi label="Total Contract Value" value={money(macro.totalTcv)} />
          <Kpi label="Aggregate BAC" value={money(macro.aggregateBac)} masked={!showFinancials} />
          <Kpi label="Baseline Sold Margin" value={`${macro.baselineMarginPct.toFixed(1)}%`} masked={!showFinancials} />
          <Kpi
            label="Blended EAC Margin"
            value={`${macro.blendedEacMarginPct.toFixed(1)}%`}
            masked={!showFinancials}
            tone={macro.blendedEacMarginPct < macro.baselineMarginPct - 1 ? 'text-critical' : 'text-success'}
            note={`${pts(-macro.marginDriftPts)} drift`}
          />
          <Kpi
            label="Blended Billable Utilization"
            value={pct(utilization.utilizationPct)}
            note={`${pct(utilization.attainmentPct)} of ${pct(utilization.targetUtilPct)} plan`}
            tone={utilization.attainmentPct >= 0.98 ? 'text-success' : utilization.attainmentPct >= 0.85 ? 'text-warning' : 'text-critical'}
          />
          <Kpi label="Avg. Governance Compliance" value={`${macro.avgCompliancePct.toFixed(0)}%`} />
        </div>

        <div className="exec-card card">
          <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-2">Delivery Risk Distribution</div>
          <HealthBar band={healthDistribution.overall} label="Overall engagement health" />
          <table className="w-full text-sm mt-3">
            <thead>
              <tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide border-b border-border">
                <th className="py-1.5 pr-4">Health lens</th>
                <th className="py-1.5 pr-4 text-right">Green</th>
                <th className="py-1.5 pr-4 text-right">Amber</th>
                <th className="py-1.5 pr-4 text-right">Red</th>
                <th className="py-1.5 pr-4">Spread</th>
              </tr>
            </thead>
            <tbody>
              {healthDistribution.lenses.map((l) => (
                <tr key={l.lens} className="border-b border-border/60 last:border-0">
                  <td className="py-1.5 pr-4 font-semibold">{l.lens}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{l.green}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{l.amber}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{l.red}</td>
                  <td className="py-1.5 pr-4 w-40">
                    <HealthBar band={l} compact />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Section 2 ── */}
      <section className="exec-section flex flex-col gap-3">
        <SectionTitle n={2} title="Resource Economics & Concurrency Risk" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Billable Heads (FTE)" value={utilization.headcountFte.toFixed(1)} />
          <Kpi label="Avg. Concurrency" value={concurrency.avgConcurrency.toFixed(1)} note="engagements / person" />
          <Kpi label="On the Bench" value={String(concurrency.benchCount)} tone={concurrency.benchCount > 0 ? 'text-warning' : undefined} />
          <Kpi
            label="Concurrency Overload"
            value={String(concurrency.overloadedCount)}
            note="> 5 active engagements"
            tone={concurrency.overloadedCount > 0 ? 'text-critical' : 'text-success'}
          />
        </div>

        <div className="exec-card card">
          <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-2">Practice Utilization Attainment</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide border-b border-border">
                <th className="py-1.5 pr-4">Practice</th>
                <th className="py-1.5 pr-4 text-right">Heads</th>
                <th className="py-1.5 pr-4 text-right">Target</th>
                <th className="py-1.5 pr-4 text-right">Actual</th>
                <th className="py-1.5 pr-4 text-right">Attainment</th>
                <th className="py-1.5 pr-4">Plan vs. Actual</th>
              </tr>
            </thead>
            <tbody>
              {utilization.practices.map((p) => (
                <tr key={p.practice} className="border-b border-border/60 last:border-0">
                  <td className="py-1.5 pr-4 font-semibold">{p.practice}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{p.headcountFte.toFixed(1)}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums text-ink-muted">{pct(p.targetUtilPct)}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums font-semibold">{pct(p.utilizationPct)}</td>
                  <td
                    className={clsx(
                      'py-1.5 pr-4 text-right tabular-nums font-semibold',
                      p.attainmentPct >= 0.98 ? 'text-success' : p.attainmentPct >= 0.85 ? 'text-warning' : 'text-critical'
                    )}
                  >
                    {pct(p.attainmentPct)}
                  </td>
                  <td className="py-1.5 pr-4 w-36">
                    <PlanBar target={p.targetUtilPct} actual={p.utilizationPct} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="exec-card card">
          <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-2">Top Overloaded Staff</div>
          {concurrency.top.length === 0 ? (
            <p className="text-sm text-ink-muted">No resource is flagged above the 5-engagement concurrency threshold.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {concurrency.top.map((r) => (
                <li key={r.id} className="text-sm">
                  <span className="font-semibold">{r.name}</span>{' '}
                  <span className="text-ink-faint">· {r.psPractice} · {r.projectCount} engagements</span>
                  <div className="text-ink-muted text-xs mt-0.5">{r.engagements.join(' · ') || '—'}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── Section 3 ── */}
      <section className="exec-section flex flex-col gap-3">
        <SectionTitle n={3} title="Financial Realization & Burn Health" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Aggregate BAC" value={money(macro.aggregateBac)} masked={!showFinancials} />
          <Kpi label="Actual Cost to Date" value={money(macro.aggregateActualsCost)} masked={!showFinancials} />
          <Kpi
            label="Forecast EAC Cost"
            value={money(macro.aggregateEacCost)}
            masked={!showFinancials}
            tone={macro.aggregateEacCost > macro.aggregateBac ? 'text-critical' : undefined}
          />
          <Kpi
            label="Blended Margin Drift"
            value={pts(-macro.marginDriftPts)}
            masked={!showFinancials}
            tone={macro.marginDriftPts > 1 ? 'text-critical' : 'text-success'}
          />
        </div>
        <div className="exec-card card">
          <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
            <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">
              Aggregated Planned vs. Actual Burn
            </div>
            <div className="text-xs exec-muted text-ink-faint">
              {Math.round(burn.actualToDateHours).toLocaleString('en-US')} h actual vs{' '}
              {Math.round(burn.plannedToDateHours).toLocaleString('en-US')} h planned to date ·{' '}
              <span className={burn.variancePct > 5 ? 'text-critical' : burn.variancePct < -5 ? 'text-success' : ''}>
                {burn.variancePct >= 0 ? '+' : ''}
                {burn.variancePct.toFixed(1)}%
              </span>
            </div>
          </div>
          <BurnChart weekly={burn.weekly} plannedTotal={burn.plannedTotalHours} />
        </div>
      </section>

      {/* ── Section 4 ── */}
      <section className="exec-section exec-page-break flex flex-col gap-3">
        <SectionTitle n={4} title="Critical Risk Register" />
        <p className="text-[12.5px] exec-muted text-ink-muted -mt-1">
          Open items across all engagements flagged CRITICAL or escalated for steering-committee attention.
        </p>
        <div className="exec-card card">
          {criticalRaid.length === 0 ? (
            <p className="text-sm text-ink-muted">No critical or escalated items are currently open.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide border-b border-border">
                    <th className="py-1.5 pr-3">Severity</th>
                    <th className="py-1.5 pr-3">Type</th>
                    <th className="py-1.5 pr-3">Item</th>
                    <th className="py-1.5 pr-3">Engagement</th>
                    <th className="py-1.5 pr-3">Owner</th>
                    <th className="py-1.5 pr-3">Target</th>
                    <th className="py-1.5 pr-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {criticalRaid.map((r) => (
                    <tr key={r.id} className="border-b border-border/60 last:border-0 align-top">
                      <td className="py-2 pr-3">
                        <span
                          className={clsx(
                            'badge !py-0.5 !px-2 text-[10px]',
                            r.severity === 'CRITICAL' ? BAND_CLASS.red : BAND_CLASS.amber
                          )}
                        >
                          {r.severity}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-ink-muted capitalize">{r.type.toLowerCase()}</td>
                      <td className="py-2 pr-3 font-semibold">
                        {r.title}
                        {r.escalated && <span className="ml-2 badge !py-0.5 !px-1.5 text-[10px]">SteerCo</span>}
                        {r.likelihood && r.type === 'RISK' && (
                          <span className="ml-2 text-ink-faint text-xs">· {r.likelihood}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-ink-muted">{r.projectName}</td>
                      <td className="py-2 pr-3 text-ink-muted">{r.ownerName ?? 'Unassigned'}</td>
                      <td className="py-2 pr-3 tabular-nums text-ink-muted">
                        {r.targetDate ? new Date(r.targetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                      </td>
                      <td className="py-2 pr-3 text-ink-muted capitalize">{r.status.toLowerCase().replace('inprogress', 'in progress')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <footer className="exec-section text-[10px] exec-muted text-ink-faint border-t border-border pt-2">
        Confidential &amp; Proprietary — © {generated.getFullYear()} A2R Ventures LLC. Every figure is computed live from the
        same engines the module pages use; nothing here is manually keyed.
      </footer>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────── helpers

function SectionTitle({ n, title }: { n: number; title: string }) {
  return (
    <div className="border-b border-border/70 pb-1.5">
      <h3 className="text-[15.5px] font-bold">
        <span className="text-brand tabular-nums">{n} · </span>
        {title}
      </h3>
    </div>
  );
}

function Kpi({
  label,
  value,
  note,
  tone,
  masked,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: string;
  masked?: boolean;
}) {
  return (
    <div className="exec-card card !p-3">
      <div className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold mb-1">{label}</div>
      <div className={clsx('text-xl font-display font-bold tabular-nums', tone)}>
        <MaskedValue canView={!masked} value={value} />
      </div>
      {note && !masked && <div className="text-[10px] exec-muted text-ink-faint mt-0.5">{note}</div>}
    </div>
  );
}

function HealthBar({
  band,
  label,
  compact,
}: {
  band: { green: number; amber: number; red: number };
  label?: string;
  compact?: boolean;
}) {
  const total = band.green + band.amber + band.red || 1;
  const seg = (n: number) => `${(n / total) * 100}%`;
  return (
    <div>
      <div className={clsx('flex rounded-full overflow-hidden', compact ? 'h-2.5' : 'h-3.5')}>
        <div className="exec-band-green bg-success" style={{ width: seg(band.green) }} />
        <div className="exec-band-amber bg-warning" style={{ width: seg(band.amber) }} />
        <div className="exec-band-red bg-critical" style={{ width: seg(band.red) }} />
      </div>
      {!compact && (
        <div className="flex items-center gap-4 text-[11px] exec-muted text-ink-muted mt-1.5">
          {label && <span className="text-ink-faint">{label}:</span>}
          <span>{band.green} Green</span>
          <span>{band.amber} Amber</span>
          <span>{band.red} Red</span>
        </div>
      )}
    </div>
  );
}

function PlanBar({ target, actual }: { target: number; actual: number }) {
  const scale = Math.max(1, target * 1.4, actual * 1.1);
  const hit = actual >= target;
  return (
    <div className="relative h-2.5 rounded-full bg-surface-3 overflow-hidden">
      <div className={clsx('absolute inset-y-0 left-0 rounded-full', hit ? 'bg-success' : 'bg-warning')} style={{ width: `${Math.min(100, (actual / scale) * 100)}%` }} />
      <div className="absolute inset-y-0 w-[2px] bg-ink" style={{ left: `${Math.min(100, (target / scale) * 100)}%` }} />
    </div>
  );
}

function BurnChart({
  weekly,
  plannedTotal,
}: {
  weekly: { week: string; plannedCum: number; actualCum: number; isFuture: boolean }[];
  plannedTotal: number;
}) {
  if (weekly.length < 2) {
    return <p className="text-sm text-ink-muted">Not enough weekly staffing data to chart the portfolio burn.</p>;
  }
  const W = 720;
  const H = 200;
  const PAD_L = 46;
  const PAD_R = 12;
  const PAD_T = 12;
  const PAD_B = 24;
  const n = weekly.length;
  const maxY = Math.max(1, plannedTotal);
  const x = (i: number) => PAD_L + (i / (n - 1)) * (W - PAD_L - PAD_R);
  const y = (v: number) => PAD_T + (1 - v / maxY) * (H - PAD_T - PAD_B);

  const plannedPath = weekly.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.plannedCum).toFixed(1)}`).join(' ');
  // past weeks are always the leading slice of the sorted series
  const pastCount = weekly.filter((p) => !p.isFuture).length;
  const actualPath = weekly
    .slice(0, pastCount)
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.actualCum).toFixed(1)}`)
    .join(' ');
  const nowIdx = pastCount - 1;

  const yTicks = [0, 0.5, 1].map((f) => f * maxY);
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };
  const labelEvery = Math.ceil(n / 9);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[460px]" role="img" aria-label="Aggregated portfolio planned versus actual burn">
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD_L} y1={y(t)} x2={W - PAD_R} y2={y(t)} className="text-border" stroke="currentColor" strokeWidth={1} />
            <text x={PAD_L - 6} y={y(t) + 3} textAnchor="end" className="fill-ink-faint" fontSize={9}>
              {Math.round(t).toLocaleString('en-US')}
            </text>
          </g>
        ))}
        {weekly.map((p, i) =>
          i % labelEvery === 0 ? (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="fill-ink-faint" fontSize={9}>
              {fmt(p.week)}
            </text>
          ) : null
        )}
        {nowIdx > 0 && nowIdx < n && (
          <line x1={x(nowIdx)} y1={PAD_T} x2={x(nowIdx)} y2={H - PAD_B} className="text-ink-faint" stroke="currentColor" strokeDasharray="2 2" strokeWidth={1} />
        )}
        <path d={plannedPath} fill="none" className="text-ink-faint" stroke="currentColor" strokeWidth={1.75} strokeDasharray="4 3" />
        {actualPath && <path d={actualPath} fill="none" className="text-brand" stroke="currentColor" strokeWidth={2.25} />}
      </svg>
      <div className="flex items-center gap-4 text-[11px] exec-muted text-ink-muted mt-1">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 border-t-2 border-dashed border-ink-faint" /> Planned
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 border-t-2 border-brand" /> Actual (to date)
        </span>
      </div>
    </div>
  );
}
