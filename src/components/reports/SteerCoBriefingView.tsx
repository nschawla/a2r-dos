'use client';

import clsx from 'clsx';
import { relativeTime } from '@/lib/relative-time';
import { compactMoney, pctFromNumber, pointsDelta } from '@/lib/format';
import { PulseStrip } from '@/components/command-center/PulseStrip';
import { RestrictedBadge } from '@/components/security/Masked';
import type { SteerCoBriefing } from '@/server/queries/steerco-briefing';
import type { StreamTone } from '@/server/queries/active-stream';

const DOT: Record<StreamTone, string> = {
  default: 'bg-ink-faint',
  good: 'bg-success',
  warn: 'bg-warning',
  critical: 'bg-critical',
};
const BAND: Record<string, string> = {
  CRITICAL: 'exec-band-red bg-critical-soft text-critical',
  HIGH: 'exec-band-amber bg-warning-soft text-warning',
  MED: 'bg-surface-2 text-ink-muted',
  LOW: 'bg-surface-2 text-ink-muted',
};
const SEV_LABEL: Record<string, string> = { CRITICAL: 'Critical', HIGH: 'High', MED: 'Medium', LOW: 'Low' };

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint exec-muted">
      {children}
    </div>
  );
}

export function SteerCoBriefingView({ briefing }: { briefing: SteerCoBriefing }) {
  const { headline, margin } = briefing;
  const generated = new Date(briefing.generatedAt);
  const scaleMax = Math.max(margin.baselineMarginPct, margin.eacMarginPct, 40);

  return (
    <div className="exec-briefing flex flex-col gap-8">
      {/* action bar — screen only */}
      <div className="no-print card !p-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <Eyebrow>SteerCo Briefing</Eyebrow>
          <p className="text-[12.5px] text-ink-muted mt-0.5">
            A lean board-meeting view of the portfolio — Pulse, margin, what moved, and the risk watchlist. Print-optimised for PDF.
          </p>
        </div>
        <button type="button" onClick={() => window.print()} className="btn-primary !w-auto px-5 text-sm">
          Print / Export PDF
        </button>
      </div>

      {/* cover */}
      <section className="exec-section flex flex-col gap-3 border-b border-border pb-7">
        <Eyebrow>Portfolio Review</Eyebrow>
        <h1 className="text-[34px] leading-[1.05] font-display font-extrabold tracking-tight">
          {briefing.organizationName}
        </h1>
        <p className="text-ink-muted text-sm">
          SteerCo Briefing ·{' '}
          {generated.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12.5px] text-ink-muted mt-1 tabular-nums">
          <span>
            <span className="text-ink font-semibold">{headline.activeEngagements}</span> active engagements
          </span>
          <span>
            <span className={clsx('font-semibold', headline.greenSharePct >= 70 ? 'text-success' : 'text-ink')}>
              {headline.greenSharePct}%
            </span>{' '}
            green health
          </span>
          <span>
            <span className={clsx('font-semibold', headline.redCount > 0 ? 'text-critical' : 'text-ink')}>
              {headline.redCount}
            </span>{' '}
            red
          </span>
          <span>
            <span className="text-ink font-semibold">{headline.compliancePct}%</span> control compliance
          </span>
        </div>
      </section>

      {/* pulse */}
      <section className="exec-section flex flex-col gap-3">
        <Eyebrow>Portfolio Pulse</Eyebrow>
        <PulseStrip vitals={briefing.vitals} />
      </section>

      {/* margin health */}
      <section className="exec-section flex flex-col gap-3">
        <Eyebrow>Margin Health</Eyebrow>
        <div className="card exec-card">
          {margin.showFinancials ? (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-3 gap-6">
                <Figure label="Baseline Margin" value={pctFromNumber(margin.baselineMarginPct)} />
                <Figure
                  label="EAC Margin"
                  value={pctFromNumber(margin.eacMarginPct)}
                  tone={margin.eacMarginPct >= 30 ? 'good' : margin.eacMarginPct >= 15 ? 'warn' : 'critical'}
                />
                <Figure
                  label="Drift vs Plan"
                  value={pointsDelta(margin.deltaPts)}
                  tone={margin.deltaPts >= 0 ? 'good' : margin.deltaPts >= -3 ? 'warn' : 'critical'}
                />
              </div>

              <div className="flex flex-col gap-2 no-print">
                <MarginBar label="Baseline" pct={margin.baselineMarginPct} max={scaleMax} tone="neutral" />
                <MarginBar
                  label="EAC"
                  pct={margin.eacMarginPct}
                  max={scaleMax}
                  tone={margin.eacMarginPct >= 30 ? 'good' : margin.eacMarginPct >= 15 ? 'warn' : 'critical'}
                />
              </div>

              <p className="text-[12px] text-ink-faint exec-muted tabular-nums">
                TCV {compactMoney(margin.tcv)} · EAC cost {compactMoney(margin.eacCost)} · BAC {compactMoney(margin.bac)}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <RestrictedBadge />
              <p className="text-sm text-ink-muted">
                Portfolio margin figures are restricted to Partners and authorized Finance / Ops leads.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* what moved */}
      <section className="exec-section flex flex-col gap-3">
        <Eyebrow>What Moved Since the Last Review</Eyebrow>
        <div className="card exec-card !p-0 overflow-hidden">
          {briefing.highlights.length === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-muted text-center">
              No governance events or new escalations in the window.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {briefing.highlights.map((h) => (
                <li key={h.id} className="flex gap-3.5 px-5 py-3">
                  <span className={clsx('mt-1.5 w-1.5 h-1.5 rounded-full flex-none', DOT[h.tone])} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[13px] text-ink font-medium truncate">{h.label}</span>
                      <span className="ml-auto flex-none text-[11px] text-ink-faint tabular-nums">
                        {relativeTime(h.at)}
                      </span>
                    </div>
                    {(h.detail || h.context) && (
                      <div className="text-[11.5px] text-ink-muted exec-muted truncate mt-0.5">
                        {[h.detail, h.context].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* watchlist */}
      <section className="exec-section flex flex-col gap-3">
        <Eyebrow>Watchlist — Escalated &amp; Critical Risk</Eyebrow>
        <div className="card exec-card !p-0 overflow-hidden">
          {briefing.watchlist.length === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-muted text-center">No escalated or critical risks open.</p>
          ) : (
            <ul className="divide-y divide-border">
              {briefing.watchlist.map((w) => (
                <li key={w.id} className="flex items-start gap-3.5 px-5 py-3">
                  <span
                    className={clsx(
                      'flex-none mt-0.5 text-[9.5px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5',
                      BAND[w.severity] ?? BAND.MED
                    )}
                  >
                    {SEV_LABEL[w.severity] ?? w.severity}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-ink font-medium truncate">{w.title}</div>
                    <div className="text-[11.5px] text-ink-muted exec-muted truncate mt-0.5">
                      {w.context}
                      {w.owner && <> · owner {w.owner}</>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <p className="text-[11px] text-ink-faint exec-muted pt-2">
        Generated {generated.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })} · every figure is drawn
        live from the same engines the module pages use.
      </p>
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: StreamTone }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint exec-muted">{label}</span>
      <span
        className={clsx(
          'font-display font-bold tabular-nums text-[24px] leading-none tracking-tight',
          tone && tone !== 'default' ? DOT_TEXT[tone] : 'text-ink'
        )}
      >
        {value}
      </span>
    </div>
  );
}

const DOT_TEXT: Record<StreamTone, string> = {
  default: 'text-ink',
  good: 'text-success',
  warn: 'text-warning',
  critical: 'text-critical',
};

function MarginBar({
  label,
  pct,
  max,
  tone,
}: {
  label: string;
  pct: number;
  max: number;
  tone: 'neutral' | 'good' | 'warn' | 'critical';
}) {
  const width = Math.max(0, Math.min(100, (pct / max) * 100));
  const fill =
    tone === 'good' ? 'bg-success' : tone === 'warn' ? 'bg-warning' : tone === 'critical' ? 'bg-critical' : 'bg-ink-faint';
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 flex-none text-[11px] text-ink-faint exec-muted">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
        <div className={clsx('h-full rounded-full', fill)} style={{ width: `${width}%` }} />
      </div>
      <span className="w-12 flex-none text-right text-[11px] tabular-nums text-ink-muted">{pct.toFixed(1)}%</span>
    </div>
  );
}
