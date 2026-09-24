'use client';

/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Local, zero-infrastructure triage actions for one "flagged" row in the
 * Decision Center's Pending Decisions / High-Severity RAID lists
 * (DecisionCenter.tsx's AlertRow). Deliberately NOT the Impact-Aware
 * Decision Card's own intervention flow (InterventionDrawer.tsx) — that
 * writes a real PortfolioIntervention row and is gated by
 * `project:approve` authority. This is the opposite by design: an
 * ungated, personal scratchpad for a reviewer's own triage pass, with zero
 * backend writes, zero external calls, and zero effect on any other
 * viewer, device, or session.
 *
 *   - Status tag ("Under Review" / "Acknowledged") — browser
 *     `localStorage`, keyed per row, so it survives a reload or reopening
 *     the tab tomorrow (a triage pass often spans more than one sitting).
 *   - Snooze ("hide for this session") — `sessionStorage` instead, so a
 *     snoozed row always comes back once the tab/session ends. This is a
 *     "clear the noise while I work" control, never a standing dismissal
 *     that could silently hide a still-real risk forever — that
 *     distinction is why it's a different storage from the tag above, not
 *     just a stylistic choice.
 *   - Export — builds a one-row CSV client-side (Blob + a synthetic
 *     download link) from the same fields already visible in the row.
 *     Never touches the network.
 *
 * Every storage read/write is try/catched and no-ops on failure (private
 * browsing, storage disabled, quota) — worst case an action doesn't
 * persist; it never breaks the row itself.
 */
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

export type TriageTag = 'UNDER_REVIEW' | 'ACKNOWLEDGED';

const TAG_META: Record<TriageTag, { label: string; cls: string }> = {
  UNDER_REVIEW: { label: 'Under Review', cls: 'bg-brand/10 text-brand' },
  ACKNOWLEDGED: { label: 'Acknowledged', cls: 'bg-success-soft text-success' },
};

const tagKey = (rowId: string) => `a2r_triage_tag:${rowId}`;
const snoozeKey = (rowId: string) => `a2r_triage_snoozed:${rowId}`;

function readTag(rowId: string): TriageTag | null {
  try {
    const v = window.localStorage.getItem(tagKey(rowId));
    return v === 'UNDER_REVIEW' || v === 'ACKNOWLEDGED' ? v : null;
  } catch {
    return null;
  }
}

function readSnoozed(rowId: string): boolean {
  try {
    return window.sessionStorage.getItem(snoozeKey(rowId)) === '1';
  } catch {
    return false;
  }
}

/** Minimal RFC 4180 CSV — one header row, one data row (this is always a
 * single flagged row, not a bulk export). */
function downloadCsv(filename: string, fields: Record<string, string | null>): void {
  const headers = Object.keys(fields);
  const escape = (v: string) => (/["\n,]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const csv = `${headers.map(escape).join(',')}\n${headers.map((h) => escape(fields[h] ?? '')).join(',')}\n`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function useTriageRowState(rowId: string) {
  // Hydration-safe: SSR and the first client render both start "untouched"
  // (no tag, not snoozed) — same guard pattern as PersonaPreviewBar's
  // `mounted` flag — then this effect reads the real browser state a tick
  // later, so there's never a server/client markup mismatch.
  const [tag, setTagState] = useState<TriageTag | null>(null);
  const [snoozed, setSnoozedState] = useState(false);

  useEffect(() => {
    setTagState(readTag(rowId));
    setSnoozedState(readSnoozed(rowId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowId]);

  function setTag(next: TriageTag | null) {
    setTagState(next);
    try {
      if (next) window.localStorage.setItem(tagKey(rowId), next);
      else window.localStorage.removeItem(tagKey(rowId));
    } catch {
      /* best-effort only */
    }
  }

  function setSnoozed(next: boolean) {
    setSnoozedState(next);
    try {
      if (next) window.sessionStorage.setItem(snoozeKey(rowId), '1');
      else window.sessionStorage.removeItem(snoozeKey(rowId));
    } catch {
      /* best-effort only */
    }
  }

  return { tag, setTag, snoozed, setSnoozed };
}

/**
 * Wraps one flagged row's existing (server-rendered) markup and adds a
 * "•••" local triage menu beside it. `children` is ordinary JSX produced
 * by a Server Component (DecisionCenter.tsx's AlertRow) — a Client
 * Component may render Server-Component-produced children like this
 * without those children needing 'use client' themselves; only this
 * wrapper and its menu run on the client.
 *
 * Owns visibility too: while snoozed, renders nothing — the row
 * disappears from the panel until the tab/session ends.
 */
export function TriageRow({
  rowId,
  exportFilename,
  exportFields,
  className,
  children,
}: {
  rowId: string;
  exportFilename: string;
  exportFields: Record<string, string | null>;
  className?: string;
  children: React.ReactNode;
}) {
  const { tag, setTag, snoozed, setSnoozed } = useTriageRowState(rowId);
  const [open, setOpen] = useState(false);
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

  if (snoozed) return null;

  return (
    <div className={clsx('flex items-center gap-1.5 group', className)}>
      <div className="min-w-0 flex-1">{children}</div>
      {tag && (
        <span
          className={clsx(
            'flex-none text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full',
            TAG_META[tag].cls
          )}
        >
          {TAG_META[tag].label}
        </span>
      )}
      <div className="relative flex-none" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Local triage actions"
          aria-haspopup="menu"
          aria-expanded={open}
          title="Local triage actions — this device only"
          className={clsx(
            'w-6 h-6 rounded-sm flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2 transition-colors focus:opacity-100',
            !open && 'opacity-0 group-hover:opacity-100'
          )}
        >
          ⋯
        </button>
        {open && (
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 w-56 bg-surface-1 border border-border-soft rounded-md shadow-elevated overflow-hidden z-50 text-left font-normal"
          >
            <div className="px-3 py-2 border-b border-border">
              <div className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold">
                Local triage — this device only
              </div>
            </div>
            <ul className="py-1">
              <li>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={tag === 'UNDER_REVIEW'}
                  onClick={() => {
                    setTag(tag === 'UNDER_REVIEW' ? null : 'UNDER_REVIEW');
                    setOpen(false);
                  }}
                  className="w-full px-3 py-1.5 text-[13px] text-left hover:bg-surface-2 transition-colors"
                >
                  {tag === 'UNDER_REVIEW' ? '✓ ' : ''}Mark as Under Review
                </button>
              </li>
              <li>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={tag === 'ACKNOWLEDGED'}
                  onClick={() => {
                    setTag(tag === 'ACKNOWLEDGED' ? null : 'ACKNOWLEDGED');
                    setOpen(false);
                  }}
                  className="w-full px-3 py-1.5 text-[13px] text-left hover:bg-surface-2 transition-colors"
                >
                  {tag === 'ACKNOWLEDGED' ? '✓ ' : ''}Mark as Acknowledged
                </button>
              </li>
              <li className="h-px bg-border/70 my-1 mx-3" />
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setSnoozed(true);
                    setOpen(false);
                  }}
                  className="w-full px-3 py-1.5 text-[13px] text-left hover:bg-surface-2 transition-colors"
                >
                  Snooze for this session
                </button>
              </li>
              <li className="h-px bg-border/70 my-1 mx-3" />
              <li>
                <button
                  type="button"
                  onClick={() => {
                    downloadCsv(exportFilename, exportFields);
                    setOpen(false);
                  }}
                  className="w-full px-3 py-1.5 text-[13px] text-left hover:bg-surface-2 transition-colors"
                >
                  Export row as CSV
                </button>
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
