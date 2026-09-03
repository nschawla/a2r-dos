'use client';

/**
 * Header Workspace-Lens switcher. Lets a multi-role user flip their default
 * perspective — Executive / SteerCo, Delivery Lead, Finance Controller,
 * Operations — and drops them on that lens's landing page. Purely a
 * navigation + preference control: it gates nothing, and every module
 * stays reachable from the sidebar and ⌘K (see src/lib/workspace/lenses.ts).
 */
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { LENSES, LENS_ORDER, type WorkspaceLens } from '@/lib/workspace/lenses';
import { setWorkspaceLens } from '@/server/actions/workspace-lens';

export function LensSwitcher({
  current,
  available,
}: {
  current: WorkspaceLens;
  available: WorkspaceLens[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Nothing to switch between — don't clutter the header.
  if (available.length < 2) return null;

  const activeLabel = LENSES[current].short;
  const ordered = LENS_ORDER.filter((l) => available.includes(l));

  function pick(lens: WorkspaceLens) {
    setOpen(false);
    startTransition(async () => {
      if (lens !== current) await setWorkspaceLens(lens);
      router.push(LENSES[lens].landing);
      router.refresh();
    });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Switch workspace perspective"
        className={clsx(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm border text-xs font-semibold whitespace-nowrap transition-colors',
          open ? 'border-brand text-ink' : 'border-border-soft text-ink-muted hover:text-ink hover:border-ink-faint',
          pending && 'opacity-60'
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="h-[14px] w-[14px] flex-none"
        >
          <path d="M4 8V5a1 1 0 0 1 1-1h3" />
          <path d="M16 4h3a1 1 0 0 1 1 1v3" />
          <path d="M20 16v3a1 1 0 0 1-1 1h-3" />
          <path d="M8 20H5a1 1 0 0 1-1-1v-3" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
        <span className="hidden md:inline text-ink-faint font-normal">Perspective ·</span>
        {activeLabel}
        <span className="text-ink-faint text-[10px]">▾</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1.5 w-72 bg-surface-1 border border-border-soft rounded-md shadow-elevated overflow-hidden z-50"
        >
          <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-ink-faint font-semibold border-b border-border">
            Land me on
          </div>
          <ul className="py-1">
            {ordered.map((key) => {
              const lens = LENSES[key];
              const active = key === current;
              return (
                <li key={key}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => pick(key)}
                    className={clsx(
                      'w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-surface-2 transition-colors',
                      active ? 'text-brand' : 'text-ink'
                    )}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold leading-tight">{lens.label}</span>
                      <span className="block text-[11px] text-ink-faint leading-tight mt-0.5">{lens.blurb}</span>
                    </span>
                    {active && <span className="flex-none text-xs mt-0.5">✓</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
