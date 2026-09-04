/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Auto Demo — the hands-free walkthrough script. Pure, dependency-light
 * data (same philosophy as src/lib/governance/rbacMatrix.ts and
 * src/lib/auth/rbac.ts): no React, no Next.js, no Prisma — just the step
 * sequence and a couple of pure helpers, so it is trivially unit-testable
 * and importable from both the client provider that drives it
 * (AutoDemoProvider) and, later, any server-rendered "what will this demo
 * show" preview without dragging in a client bundle.
 *
 * Each DemoStep is one screen the walkthrough lands on: the route it
 * pushes to, how long it lingers there before advancing, and the
 * teleprompter caption CinematicOverlay shows while it's active. Steps are
 * grouped into "acts" (currently Introduction and Ops Console) and tagged
 * with which non-"Full Tour" persona track(s) include them — "Full Tour"
 * always plays every step in script order, in one continuous walkthrough.
 */

export type DemoPersona = 'Executive' | 'Admin' | 'Full Tour';

export const DEMO_PERSONAS: readonly DemoPersona[] = ['Executive', 'Admin', 'Full Tour'] as const;

export type DemoAct = 'Introduction' | 'Ops Console';

export interface DemoStep {
  /** Stable id — used as the React key and for step lookups, independent
   * of the step's position (which shifts per persona once a step is
   * filtered out). */
  id: string;
  /** The route AutoDemoProvider pushes to when this step becomes active. */
  route: string;
  /** How long this step stays on screen before auto-advancing. */
  durationMs: number;
  /** The teleprompter line CinematicOverlay displays for this step. */
  caption: string;
  act: DemoAct;
  /** Which single-persona tracks include this step. Ignored for 'Full
   * Tour', which always plays the entire script regardless of this list. */
  personas: Exclude<DemoPersona, 'Full Tour'>[];
  /**
   * A CSS selector (always an id, e.g. "#batch-import-zone") for the DOM
   * element this step is narrating *about*, if a specific element on the
   * destination route is the point of the beat rather than the page as a
   * whole. Not consumed by anything yet — CinematicOverlay only reads
   * `caption`/`durationMs` today — but the ids it names are real, stable
   * elements already in the DOM (see the `id="..."` attributes on
   * src/components/layout/Header.tsx's <header>, its Perspective switcher
   * wrapper, src/app/(admin)/layout.tsx's <header>, and
   * src/components/ingestion/BatchUploadPortal.tsx's dropzone), so a
   * future spotlight/highlight-ring effect can key off this field with no
   * further plumbing. Omitted where a step is about the page generally.
   */
  highlightSelector?: string;
}

/**
 * The master script, in playback order. "Full Tour" plays it exactly as
 * written; `getStepsForPersona('Executive' | 'Admin')` filters it down to
 * that track without changing the relative order of the steps it keeps.
 */
export const DEMO_SCRIPT: readonly DemoStep[] = [
  {
    id: 'welcome',
    route: '/',
    durationMs: 8000,
    act: 'Introduction',
    personas: ['Executive', 'Admin'],
    highlightSelector: '#global-header',
    caption:
      'Welcome to A2R Delivery OS — the delivery operating system built for professional services firms. This is the Portfolio Control Tower: every engagement, rolled up into one live view.',
  },
  {
    id: 'command-center',
    route: '/command',
    durationMs: 7000,
    act: 'Introduction',
    personas: ['Executive', 'Admin'],
    caption:
      'The Command Center puts your portfolio’s vital signs, and a natural-language command bar, in one pane — type "financials for Contoso" and it just takes you there.',
  },
  {
    id: 'steerco',
    route: '/steerco',
    durationMs: 7000,
    act: 'Introduction',
    personas: ['Executive'],
    caption:
      'For the steering committee, the SteerCo Briefing distills the whole portfolio into a lean, board-ready read-out — and prints straight to a clean PDF.',
  },
  {
    id: 'executive-hub',
    route: '/reports',
    durationMs: 7000,
    act: 'Introduction',
    personas: ['Executive'],
    caption:
      'The Executive Hub goes one layer deeper — a full four-section portfolio briefing, also print-ready, for whenever the board wants the detail behind the headline.',
  },
  {
    id: 'admin-setup',
    route: '/admin',
    durationMs: 8000,
    act: 'Ops Console',
    personas: ['Admin'],
    caption:
      'Now let’s step behind the curtain. Admin & Org Setup is where a delivery leader manages the roster, the rate card, and enterprise governance policy — no spreadsheet required.',
  },
  {
    // `?v=batch` opens straight onto the Batch Import tab (ModuleTabs
    // reads this param on mount) — without it, #batch-import-zone exists
    // in the DOM (every ModuleTabs panel renders, just hidden) but isn't
    // the tab a viewer actually sees, which would make highlightSelector
    // point at something invisible.
    id: 'admin-ingestion',
    route: '/admin/ingestion?v=batch',
    durationMs: 8000,
    act: 'Ops Console',
    personas: ['Admin'],
    highlightSelector: '#batch-import-zone',
    caption:
      'And this is brand new: the Self-Service Batch Import Engine. A client’s own team drops in a week of actuals, and anything that doesn’t check out is quarantined — never silently dropped, never committed until it’s clean.',
  },
  {
    id: 'ops-console',
    route: '/ops',
    durationMs: 8000,
    act: 'Ops Console',
    personas: ['Admin'],
    caption:
      'Zooming out further, the A2R Ops Console is our own operator view across every client we run — platform health, tenant provisioning, and identity federation, all in one place.',
  },
  {
    id: 'ops-pulse',
    route: '/ops/pulse',
    durationMs: 7000,
    act: 'Ops Console',
    personas: ['Admin'],
    caption:
      'Platform Pulse is engineering telemetry for A2R Delivery OS itself — build, tests, and database health, ingested automatically, never typed in by hand.',
  },
  {
    id: 'closing',
    route: '/',
    durationMs: 6000,
    act: 'Introduction',
    personas: ['Executive', 'Admin'],
    caption: 'That’s the tour. Feel free to take the wheel from here — everything you just saw is one click away.',
  },
];

/**
 * The step sequence for a persona track, in script order. 'Full Tour'
 * always returns the whole script; 'Executive' / 'Admin' return only the
 * steps tagged for that track.
 */
export function getStepsForPersona(persona: DemoPersona): DemoStep[] {
  if (persona === 'Full Tour') return [...DEMO_SCRIPT];
  return DEMO_SCRIPT.filter((step) => step.personas.includes(persona));
}

export function isDemoPersona(value: unknown): value is DemoPersona {
  return typeof value === 'string' && (DEMO_PERSONAS as readonly string[]).includes(value);
}
