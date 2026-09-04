'use client';

/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Auto Demo — the launch trigger. A single self-contained component (own
 * button + own modal + own open state — same shape as
 * src/components/ops/RbacPersonaSwitcher.tsx) so dropping
 * `<AutoDemoLaunchModal />` into a header is the entire integration; no
 * parent needs to own open/close state or import a second file.
 *
 * Mounted in both global headers this app has — the tenant Header
 * (src/components/layout/Header.tsx) and the Ops Console header
 * (src/app/(admin)/layout.tsx) — since AutoDemoProvider lives above both
 * shells at the app root (see that file's doc comment) and a track can
 * reasonably be launched from either one.
 *
 * Hides itself entirely while a walkthrough is already running —
 * CinematicOverlay's own "Exit Demo" is the one active control at that
 * point, so there is never a moment with two competing demo controls of
 * a session's own on screen at once.
 */
import { useEffect, useState } from 'react';
import { useAutoDemo, type DemoPersona } from './AutoDemoProvider';

const TRACKS: { persona: DemoPersona; label: string; blurb: string }[] = [
  {
    persona: 'Full Tour',
    label: 'Full Platform Tour',
    blurb: 'Every screen, front-to-back — delivery, financials, governance, and the A2R Ops Console.',
  },
  {
    persona: 'Executive',
    label: 'Executive Lens',
    blurb: 'The board-level view: Control Tower, Command Center, the SteerCo Briefing, and the Executive Hub.',
  },
  {
    persona: 'Admin',
    label: 'Admin / Ops Lens',
    blurb: 'Behind the curtain: roster & governance, the Self-Service Batch Import Engine, and the A2R Ops Console.',
  },
];

export function AutoDemoLaunchModal() {
  const { isActive, startDemo } = useAutoDemo();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (isActive) return null;

  function pick(persona: DemoPersona) {
    setOpen(false);
    startDemo(persona);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Launch Auto Demo"
        title="Launch Auto Demo"
        className="w-8 h-8 rounded-full border border-border-soft text-ink-muted hover:text-ink hover:border-ink-faint flex items-center justify-center text-sm"
      >
        <span aria-hidden>🎬</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Launch Auto Demo"
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/35 p-4"
          onClick={() => setOpen(false)}
        >
          <div className="card w-full max-w-lg !p-0 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-border px-5 py-4">
              <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Auto Demo</div>
              <h2 className="text-lg font-display font-bold">Launch a guided walkthrough</h2>
              <p className="text-[12.5px] text-ink-muted mt-1">
                A2R Delivery OS drives itself — narrated captions, automatic navigation, no clicking required. Exit
                anytime from the bar at the bottom of the screen.
              </p>
            </div>

            <ul className="p-2">
              {TRACKS.map((t) => (
                <li key={t.persona}>
                  <button
                    type="button"
                    onClick={() => pick(t.persona)}
                    className="w-full text-left px-3.5 py-3 rounded-md hover:bg-surface-2 transition-colors flex flex-col gap-0.5"
                  >
                    <span className="text-sm font-semibold text-ink">{t.label}</span>
                    <span className="text-[12px] text-ink-muted">{t.blurb}</span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="border-t border-border px-5 py-3 flex justify-end">
              <button type="button" onClick={() => setOpen(false)} className="text-ink-faint hover:text-ink text-xs px-3 py-2">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
