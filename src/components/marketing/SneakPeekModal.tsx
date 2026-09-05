'use client';

/**
 * "Sneak Peek" — a self-contained trigger button + modal for the public
 * "Coming Soon" landing page (src/app/page.tsx). Renders its own trigger
 * so the page (a server component) can drop it straight into the header.
 *
 * Same overlay conventions as src/components/support/SupportTicketModal.tsx
 * (fixed inset-0, role=dialog, click-outside + Escape to close), restyled
 * for the landing page's dark theme.
 */
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const PEEK_MODULES: { name: string; blurb: string }[] = [
  { name: 'Portfolio Control Tower', blurb: 'Every engagement — margin, schedule health, risk, utilization — rolled into one live view, scoped to who’s looking.' },
  { name: 'RAID Cockpit', blurb: 'A real register for risks, assumptions, issues and dependencies, with a heatmap and SteerCo escalation built in.' },
  { name: 'AI status parsing', blurb: 'Paste a weekly status email; get structured narrative + RAID rows back, ready to review and commit.' },
  { name: 'Financial Realization', blurb: 'Sold → approved baseline → true EAC margin, with a burn curve and per-role actuals.' },
  { name: 'Compliance Ledger', blurb: 'Every material change hash-chained into a tamper-evident SOC 2-aligned audit trail.' },
];

export function SneakPeekModal() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    // Lock scroll behind the modal.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="whitespace-nowrap rounded-md border border-[#2E3E5E] bg-white/[0.03] px-3.5 py-1.5 text-[13px] font-semibold text-[#D7DEEE] transition-colors hover:border-[#4C8DFF]/60 hover:text-white sm:px-4"
      >
        Sneak Peek
      </button>

      {open &&
        mounted &&
        createPortal(
        <div
          className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-[#03060F]/85 px-4 py-8 backdrop-blur-md sm:py-12"
          role="dialog"
          aria-modal="true"
          aria-label="A sneak peek at A2R Delivery OS"
          onClick={close}
        >
          <div
            className="my-auto w-full max-w-lg rounded-2xl border border-white/10 bg-[#111C33] p-6 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.8)] sm:p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6BA5FF]">
                  Sneak Peek
                </div>
                <h2 className="mt-1 font-display text-[20px] font-bold text-white">
                  What’s inside A2R Delivery OS
                </h2>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="flex h-8 w-8 flex-none items-center justify-center rounded-md border border-white/15 text-[#95A0BB] transition-colors hover:border-[#4C8DFF]/60 hover:text-white"
              >
                &times;
              </button>
            </div>

            {/* Stylized product frame — no real screenshot yet. */}
            <div className="mt-4 overflow-hidden rounded-lg border border-white/10 bg-[#0A1224]">
              <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-3 py-2">
                <span className="h-2 w-2 rounded-full bg-white/15" />
                <span className="h-2 w-2 rounded-full bg-white/15" />
                <span className="h-2 w-2 rounded-full bg-white/15" />
                <span className="ml-2.5 font-mono text-[10.5px] text-[#5A6683]">app.a2rdos.com / portfolio</span>
              </div>
              <div className="flex divide-x divide-white/[0.06]">
                {[
                  ['Book of Business', '$12.4M'],
                  ['Velocity', '81%'],
                  ['Margin', '37.5%'],
                ].map(([label, value]) => (
                  <div key={label} className="flex-1 px-3 py-2.5">
                    <div className="text-[9.5px] uppercase tracking-wide text-[#5A6683]">{label}</div>
                    <div className="mt-0.5 font-mono text-[14px] font-semibold text-white">{value}</div>
                  </div>
                ))}
              </div>
            </div>

            <ul className="mt-4 flex flex-col divide-y divide-white/[0.06]">
              {PEEK_MODULES.map((m) => (
                <li key={m.name} className="flex flex-col gap-0.5 py-2.5 first:pt-0">
                  <span className="font-display text-[14px] font-bold text-white">{m.name}</span>
                  <span className="text-[12.5px] leading-snug text-[#95A0BB]">{m.blurb}</span>
                </li>
              ))}
            </ul>

            <p className="mt-4 text-[11.5px] text-[#5A6683]">
              Full walkthrough available on request — add yourself to the early-access list.
            </p>
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}
