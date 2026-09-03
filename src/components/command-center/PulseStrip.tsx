import clsx from 'clsx';

/**
 * The Pulse strip — venture vitals across the top of the Command Center.
 * One flat obsidian plane, hairline-divided cells, razor-sharp figures
 * (display face, tabular). No shadow, no chrome, no chart clutter — just
 * the numbers that decide where attention goes.
 */
export type PulseTone = 'default' | 'good' | 'warn' | 'critical';

export interface PulseVital {
  label: string;
  value: string;
  sub?: string;
  tone?: PulseTone;
}

const TONE_CLASS: Record<PulseTone, string> = {
  default: 'text-ink',
  good: 'text-success',
  warn: 'text-warning',
  critical: 'text-critical',
};

export function PulseStrip({ vitals }: { vitals: PulseVital[] }) {
  return (
    <section
      aria-label="Venture vitals"
      className="rounded-lg border border-border bg-surface-1 grid grid-cols-2 lg:grid-cols-4
        divide-x divide-y lg:divide-y-0 divide-border"
    >
      {vitals.map((v) => (
        <div key={v.label} className="px-5 py-4 flex flex-col gap-1.5 min-w-0">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
            {v.label}
          </span>
          <span
            className={clsx(
              'font-display font-bold tabular-nums leading-none text-[26px] tracking-tight truncate',
              TONE_CLASS[v.tone ?? 'default']
            )}
          >
            {v.value}
          </span>
          {v.sub && <span className="text-[11.5px] text-ink-muted truncate">{v.sub}</span>}
        </div>
      ))}
    </section>
  );
}
