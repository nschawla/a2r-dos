'use client';

/**
 * The "Icon & Pill Selector Hub" primitive — Apple-style device-row
 * selector cards for category/filter controls (docs/UI_DESIGN_SYSTEM.md
 * §5). Distinct from <ModuleTabs> (§1.4/1.6): ModuleTabs swaps between
 * whole PANELS (different content trees, `role="tablist"`); PillSelector
 * is a filter control (`role="group"` of toggle buttons) that narrows a
 * dataset already on the page — the caller owns the selected-value state
 * and does the filtering, this component only renders the row and reports
 * clicks. That keeps it equally usable for a pure client-side filter (zero
 * network — see RaidBoard's type filter, the Capacity Cockpit's practice
 * filter) and for a selector that has to fetch fresh data per choice (the
 * Reports Hub's engagement picker) — the caller decides what "selecting"
 * does; this component only owns how it looks and feels.
 *
 * Active state: a solid accent border + a soft accent ring (`shadow-*`),
 * exactly the treatment on Apple's own storage/color/device selector rows
 * — never a plain color swap, so the active pill is unmistakable even
 * scanned at a glance.
 */
import type { ReactNode } from 'react';
import clsx from 'clsx';

export interface PillOption {
  key: string;
  label: string;
  /** A small (already-sized) icon or status dot — kept to the caller so
   * this stays icon-library-agnostic. */
  icon?: ReactNode;
  /** An optional trailing count badge, e.g. "12". */
  count?: number;
  disabled?: boolean;
  title?: string;
}

export function PillSelectorRow({
  options,
  isActive,
  onSelect,
  className,
  /** Dims + disables pointer events while a selection is still resolving
   * (e.g. the Reports Hub's per-engagement server fetch) — a visible,
   * non-blocking "this is taking a beat" cue instead of the row going
   * inert with no feedback. */
  pending,
  'aria-label': ariaLabel,
}: {
  options: PillOption[];
  isActive: (key: string) => boolean;
  onSelect: (key: string) => void;
  className?: string;
  pending?: boolean;
  'aria-label'?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={clsx(
        'flex items-center gap-2 flex-wrap transition-opacity duration-150',
        pending && 'opacity-60 pointer-events-none',
        className
      )}
    >
      {options.map((opt) => {
        const active = isActive(opt.key);
        return (
          <button
            key={opt.key}
            type="button"
            disabled={opt.disabled}
            title={opt.title}
            aria-pressed={active}
            onClick={() => onSelect(opt.key)}
            className={clsx(
              'group/pill flex items-center gap-2 rounded-2xl border-2 px-3.5 py-2 text-[13px] font-semibold',
              'transition-all duration-150 ease-out disabled:opacity-40 disabled:cursor-not-allowed',
              active
                ? 'border-brand bg-brand/[0.08] text-brand shadow-[0_0_0_3px_rgba(11,95,209,0.14)]'
                : 'border-border-soft bg-surface-1 text-ink-muted hover:border-border hover:bg-surface-2 hover:text-ink'
            )}
          >
            {opt.icon && (
              <span
                className={clsx(
                  'flex-none flex items-center justify-center w-4 h-4 transition-colors',
                  active ? 'text-brand' : 'text-ink-faint group-hover/pill:text-ink-muted'
                )}
              >
                {opt.icon}
              </span>
            )}
            <span className="whitespace-nowrap">{opt.label}</span>
            {opt.count !== undefined && (
              <span
                className={clsx(
                  'flex-none rounded-full px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums leading-none',
                  active ? 'bg-brand/15 text-brand' : 'bg-surface-3 text-ink-faint'
                )}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
