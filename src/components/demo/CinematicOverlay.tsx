'use client';

/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Auto Demo — the "Teleprompter" subtitle bar. Fixed to the bottom of the
 * viewport, above every route the walkthrough drives through (mounted
 * once at the app root alongside AutoDemoProvider — see that file's doc
 * comment for why). Renders nothing at all while the demo is inactive.
 *
 * Deliberately NOT built from this app's own light "Executive Clarity"
 * surface tokens (`surface-*`/`ink-*`) — a presentation-mode overlay reads
 * as a distinct layer of chrome sitting *on top of* the product, closer to
 * a film subtitle or a teleprompter than to another card in the UI, so it
 * uses a fixed near-black scrim + white text regardless of the app's own
 * (always-light) theme. The one thing it borrows from the design system is
 * the `brand` accent, on the progress bar and the step counter, so the
 * walkthrough still visually reads as *this* product's demo.
 */
import { useEffect, useState } from 'react';
import { useAutoDemo } from './AutoDemoProvider';

export function CinematicOverlay() {
  const { isActive, activeStep, currentStep, steps, selectedPersona, stopDemo } = useAutoDemo();

  if (!isActive || !activeStep) return null;

  return (
    <div
      role="region"
      aria-label="Auto Demo narration"
      className="fixed inset-x-0 bottom-0 z-[200] flex justify-center px-4 pb-4 sm:pb-6"
    >
      <div className="w-full max-w-3xl rounded-lg bg-black/90 text-white shadow-elevated backdrop-blur-sm overflow-hidden">
        <StepProgressBar key={activeStep.id} durationMs={activeStep.durationMs} />

        <div className="flex items-start gap-4 px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-wide text-brand font-semibold mb-1.5">
              <span>Auto Demo</span>
              <span className="text-white/30">&middot;</span>
              <span className="text-white/60">{selectedPersona} Track</span>
              <span className="text-white/30">&middot;</span>
              <span className="text-white/60">
                Step {currentStep + 1} of {steps.length}
              </span>
            </div>
            <p className="text-[15px] sm:text-[16px] leading-snug text-white/95">{activeStep.caption}</p>
          </div>

          <button
            type="button"
            onClick={stopDemo}
            className="flex-none rounded-md border border-white/25 px-3.5 py-2 text-xs font-semibold text-white/90 hover:bg-white/10 hover:text-white hover:border-white/40 transition-colors"
          >
            Exit Demo
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * A thin bar that animates from empty to full over exactly `durationMs` —
 * a visual countdown to the next auto-advance. Keyed by the parent on
 * `activeStep.id` so each step gets a fresh mount (and therefore a fresh
 * 0%→100% run) instead of trying to reset a transition mid-flight.
 */
function StepProgressBar({ durationMs }: { durationMs: number }) {
  const [filled, setFilled] = useState(false);

  useEffect(() => {
    // One frame of "0%" before flipping to "100%" so the browser has
    // something to transition *from* — setting both in the same commit
    // would just render already-full with no visible animation.
    const raf = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="h-[3px] w-full bg-white/10">
      <div
        className="h-full bg-brand transition-[width] ease-linear motion-reduce:transition-none"
        style={{ width: filled ? '100%' : '0%', transitionDuration: `${durationMs}ms` }}
      />
    </div>
  );
}
