'use client';

/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Auto Demo — hands-free walkthrough core context and drive logic.
 *
 * Mounted once at the app root (src/app/layout.tsx), ABOVE both the
 * (dashboard) tenant shell and the (admin) Ops Console shell — a "Full
 * Tour" or the "Admin" track crosses between those two route groups, each
 * of which fully unmounts/remounts its own layout on navigation, so the
 * demo's own state has to live somewhere neither of them owns. This is
 * exactly the same "one shared state, two unrelated shells" constraint
 * src/lib/client/rbac-preview.ts was extracted to solve for the RBAC
 * Persona Preview, except here the state is genuinely shared top-down via
 * context rather than independently by localStorage, since a single
 * client session drives its own single active walkthrough — there's
 * nothing to keep in sync across tabs or shells the way a preview choice
 * needs to be.
 *
 * Inert by default: `isActive` starts `false`, and nothing here renders
 * anything on its own (see CinematicOverlay) or touches routing until
 * `startDemo()` is called from somewhere with a trigger UI — this file is
 * the foundation the trigger and the overlay both build on, not the
 * trigger itself.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getStepsForPersona, type DemoPersona, type DemoStep } from '@/lib/demo/demo-script';

export type { DemoPersona };

interface AutoDemoState {
  isActive: boolean;
  currentStep: number;
  selectedPersona: DemoPersona;
  /** The persona's resolved step sequence, in playback order. */
  steps: DemoStep[];
  /** The step currently on screen, or null while inactive. */
  activeStep: DemoStep | null;
  /** (Re)starts the walkthrough from step 0 on the given persona's track. */
  startDemo: (persona: DemoPersona) => void;
  /** Ends the walkthrough immediately — the "Exit Demo" action. Does not
   * navigate away; the user keeps whatever screen was on when they exited. */
  stopDemo: () => void;
  /** Jumps to an arbitrary step in the current track (a no-op out of range). */
  goToStep: (index: number) => void;
}

const AutoDemoContext = createContext<AutoDemoState | null>(null);

export function AutoDemoProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedPersona, setSelectedPersona] = useState<DemoPersona>('Full Tour');

  // Referentially stable across re-renders for the same persona — the
  // underlying DemoStep objects are shared with the DEMO_SCRIPT module
  // constant, never cloned, so effects keyed on `activeStep` below only
  // ever refire on a genuine step/persona change, not on unrelated
  // re-renders elsewhere in the tree.
  const steps = useMemo(() => getStepsForPersona(selectedPersona), [selectedPersona]);
  const activeStep = isActive && currentStep < steps.length ? steps[currentStep]! : null;

  const startDemo = useCallback((persona: DemoPersona) => {
    setSelectedPersona(persona);
    setCurrentStep(0);
    setIsActive(true);
  }, []);

  const stopDemo = useCallback(() => {
    setIsActive(false);
    setCurrentStep(0);
  }, []);

  const goToStep = useCallback(
    (index: number) => {
      if (index < 0 || index >= steps.length) return;
      setCurrentStep(index);
    },
    [steps.length]
  );

  // Drive the route: push the active step's route whenever the step
  // itself changes. `pathname` is read only to skip a redundant push when
  // a step happens to land on the page the demo was already showing —
  // it is deliberately NOT a dependency, so a manual navigation mid-step
  // (before the auto-advance timer below fires) is never fought or
  // "corrected" back; only a step change ever pushes a route.
  useEffect(() => {
    if (!activeStep) return;
    if (pathname !== activeStep.route) {
      router.push(activeStep.route);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep, router]);

  // Auto-advance: one timer per active step, cleared the moment the step,
  // persona, or active flag changes (including via stopDemo/goToStep).
  useEffect(() => {
    if (!isActive || !activeStep) return;
    const timer = setTimeout(() => setCurrentStep((prev) => prev + 1), activeStep.durationMs);
    return () => clearTimeout(timer);
  }, [isActive, activeStep]);

  // End the walkthrough once currentStep runs past the last step —
  // separate from the timer effect above so advancing is never coupled to
  // the "are we done" check inside a setState updater.
  useEffect(() => {
    if (isActive && currentStep >= steps.length) stopDemo();
  }, [isActive, currentStep, steps.length, stopDemo]);

  const value = useMemo<AutoDemoState>(
    () => ({ isActive, currentStep, selectedPersona, steps, activeStep, startDemo, stopDemo, goToStep }),
    [isActive, currentStep, selectedPersona, steps, activeStep, startDemo, stopDemo, goToStep]
  );

  return <AutoDemoContext.Provider value={value}>{children}</AutoDemoContext.Provider>;
}

export function useAutoDemo(): AutoDemoState {
  const ctx = useContext(AutoDemoContext);
  if (!ctx) throw new Error('useAutoDemo must be used within an AutoDemoProvider');
  return ctx;
}
