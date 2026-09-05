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
 *
 * Also renders the "visual spotlight": when the active step names a
 * `highlightSelector` (src/lib/demo/demo-script.ts), a soft pulsing glow
 * ring is drawn around that DOM element — see HighlightSpotlight below.
 */
import { useEffect, useState } from 'react';
import { useAutoDemo } from './AutoDemoProvider';

export function CinematicOverlay() {
  const { isActive, activeStep, currentStep, steps, selectedPersona, stopDemo } = useAutoDemo();

  if (!isActive || !activeStep) return null;

  return (
    <>
      <HighlightSpotlight key={activeStep.id} selector={activeStep.highlightSelector} />

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
    </>
  );
}

/**
 * The glow ring drawn around `activeStep.highlightSelector`'s element, if
 * the step names one. `useHighlightRect` re-measures every animation
 * frame — cheap (one querySelector + getBoundingClientRect) and the
 * simplest way to cover three things at once with no extra listeners:
 * waiting for the element to exist after a route change lands, tracking
 * layout shifts (a sticky header, a resize), and clearing itself if the
 * element goes away. `pointer-events-none` throughout so the ring never
 * intercepts a real click on the thing it's pointing at.
 */
function HighlightSpotlight({ selector }: { selector: string | undefined }) {
  const rect = useHighlightRect(selector);
  if (!rect) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-[150] rounded-lg shadow-[0_0_0_2px_rgba(11,95,209,0.55),0_0_16px_3px_rgba(11,95,209,0.30)] animate-demo-pulse motion-reduce:animate-none transition-[top,left,width,height] duration-150 ease-out"
      style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
    />
  );
}

function sameRect(a: DOMRect | null, b: DOMRect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}

/** Tracks `document.querySelector(selector)`'s bounding rect for as long
 * as `selector` is set, re-measuring every frame via requestAnimationFrame
 * but only re-rendering when the rect actually changes (returning the
 * previous state object from a functional update is React's own signal
 * to bail out of the render, so a static page costs one comparison a
 * frame, not sixty re-renders a second). Resets to null — no highlight —
 * whenever `selector` is undefined or names an element not in the DOM. */
function useHighlightRect(selector: string | undefined): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    let raf: number;
    function tick() {
      const el = document.querySelector(selector!);
      const next = el ? el.getBoundingClientRect() : null;
      setRect((prev) => (sameRect(prev, next) ? prev : next));
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [selector]);

  return rect;
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
