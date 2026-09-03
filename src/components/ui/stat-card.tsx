import clsx from 'clsx';
import { MaskedValue } from '@/components/security/Masked';

/**
 * The one KPI / stat tile used across the Control Tower, the Capacity
 * Cockpit, and the Ops Console — same padding (`card !p-4`), same label /
 * value / sub typography, so a stat strip reads identically everywhere.
 */
export function StatCard({
  label,
  value,
  sub,
  /** Semantic tone class for the figure, e.g. `text-warning` / `text-critical`. */
  tone,
  /** When true the figure renders masked (viewer not authorized to see it). */
  restricted = false,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
  restricted?: boolean;
  className?: string;
}) {
  return (
    <div className={clsx('card !p-4 flex flex-col', className)}>
      <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1.5">{label}</div>
      <div className={clsx('text-2xl font-display font-bold tabular-nums leading-none', tone)}>
        <MaskedValue canView={!restricted} value={value} />
      </div>
      {sub && <div className="text-[11px] text-ink-faint mt-1.5">{sub}</div>}
    </div>
  );
}
