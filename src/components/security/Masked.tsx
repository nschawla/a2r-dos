import clsx from 'clsx';
import { MASK, RESTRICTED_BADGE_LABEL } from '@/lib/security/masking';

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={clsx('w-3 h-3 flex-none', className)} fill="none" aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" fill="currentColor" opacity="0.9" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** A subtle "restricted" chip shown where a sensitive field is masked. */
export function RestrictedBadge({ label = RESTRICTED_BADGE_LABEL, className }: { label?: string; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full border border-border-soft bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-ink-faint uppercase tracking-wide',
        className
      )}
      title={label}
    >
      <LockIcon />
      {label}
    </span>
  );
}

/**
 * Renders `value` when the viewer is authorized, otherwise the mask token
 * with a small lock. Drop-in for a KPI card figure or a table cell.
 */
export function MaskedValue({
  value,
  canView,
  className,
}: {
  value: string | number;
  canView: boolean;
  className?: string;
}) {
  if (canView) return <span className={className}>{value}</span>;
  return (
    <span className={clsx('inline-flex items-center gap-1.5 text-ink-faint', className)} title={RESTRICTED_BADGE_LABEL}>
      <LockIcon />
      {MASK}
    </span>
  );
}

/** Page/section-level banner explaining that fields are masked for this role. */
export function RestrictedNotice({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="card !p-3 !bg-surface-2 border-border-soft flex items-start gap-2.5">
      <LockIcon className="mt-0.5 text-ink-faint" />
      <p className="text-[12.5px] text-ink-muted">{text}</p>
    </div>
  );
}
