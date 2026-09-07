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
 * grouped into "acts" (Introduction, Ops Console, Security & Trust) and
 * tagged with which non-"Full Tour" persona track(s) include them — "Full Tour"
 * always plays every step in script order, in one continuous walkthrough.
 *
 * Tracks (persona-filtered subsequences of the one master script, in
 * script order — never a rewrite):
 *   - 'Executive'   — board-level: portfolio, command, scoped visibility,
 *                     SteerCo, Exec Hub, plus the one tenant-isolation beat.
 *   - 'Admin'       — the delivery-leader / ops walkthrough end to end,
 *                     including the full Security & Trust segment.
 *   - 'Security'    — the CISO / security-reviewer cut: scoped visibility +
 *                     tenant isolation + least-privilege operator RBAC +
 *                     step-up MFA + the immutable audit ledger.
 *   - 'Full Tour'   — every beat, in order.
 */

export type DemoPersona = 'Executive' | 'Admin' | 'Security' | 'Full Tour';

export const DEMO_PERSONAS: readonly DemoPersona[] = ['Executive', 'Admin', 'Security', 'Full Tour'] as const;

export type DemoAct = 'Introduction' | 'Ops Console' | 'Security & Trust';

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
   * whole. CinematicOverlay draws a pulsing glow ring around this element
   * for as long as the step is active (see HighlightSpotlight in that
   * file) — the ids it names are real, stable elements already in the DOM:
   *   #global-header               — src/components/layout/Header.tsx +
   *                                  src/app/(admin)/layout.tsx <header>
   *   #capacity-scope-indicator    — src/app/(dashboard)/capacity/page.tsx
   *   #batch-import-zone           — src/components/ingestion/BatchUploadPortal.tsx
   *   #new-kpi-button              — src/components/admin/KpiBuilderPanel.tsx
   *   #operator-capability-matrix  — src/components/ops/OperatorAccessManager.tsx
   *   #operator-mfa-panel          — src/app/(admin)/ops/security/page.tsx
   *   #jit-elevation-log           — src/app/(admin)/ops/audit/page.tsx
   * Omitted where a step is about the page generally, not one element on it.
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
    route: '/portfolio',
    // 28-word VO at ~168 wpm — see docs/AUTO_DEMO_SCRIPT.md §3 for the
    // pacing math behind every duration in this file.
    durationMs: 10000,
    act: 'Introduction',
    personas: ['Executive', 'Admin', 'Security'],
    highlightSelector: '#global-header',
    caption:
      'Welcome to A2R Delivery OS — the delivery operating system built for professional services firms. This is the Portfolio Control Tower: every engagement, rolled up into one live view.',
  },
  {
    id: 'command-center',
    route: '/command',
    durationMs: 10000, // 26 words at ~156 wpm
    act: 'Introduction',
    personas: ['Executive', 'Admin'],
    caption:
      'The Command Center puts your portfolio’s vital signs, and a natural-language command bar, in one pane — type "financials for Contoso" and it just takes you there.',
  },
  {
    id: 'scoped-practice-view',
    route: '/capacity',
    durationMs: 15000, // 41 words at ~164 wpm
    act: 'Introduction',
    personas: ['Executive', 'Admin', 'Security'],
    highlightSelector: '#capacity-scope-indicator',
    caption:
      'Every view in A2R Delivery OS is role-aware. A VP or Ops lead sees the whole portfolio here — tenant-wide. Switch to a Practice Director’s seat, and the exact same screen scopes itself to just their own practice’s roster and projects, automatically.',
  },
  {
    id: 'steerco',
    route: '/steerco',
    durationMs: 8000, // 23 words at ~172 wpm
    act: 'Introduction',
    personas: ['Executive'],
    caption:
      'For the steering committee, the SteerCo Briefing distills the whole portfolio into a lean, board-ready read-out — and prints straight to a clean PDF.',
  },
  {
    id: 'executive-hub',
    route: '/reports',
    durationMs: 9000, // 24 words at ~160 wpm
    act: 'Introduction',
    personas: ['Executive'],
    caption:
      'The Executive Hub goes one layer deeper — a full four-section portfolio briefing, also print-ready, for whenever the board wants the detail behind the headline.',
  },
  {
    id: 'admin-setup',
    route: '/admin',
    durationMs: 10000, // 27 words at ~162 wpm
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
    // The longest line in the script (36 words) — this was the pacing
    // bottleneck flagged in docs/AUTO_DEMO_SCRIPT.md (270 wpm at the old
    // 8s). 13s brings it to a comfortable ~166 wpm.
    durationMs: 13000,
    act: 'Ops Console',
    personas: ['Admin'],
    highlightSelector: '#batch-import-zone',
    caption:
      'And this is brand new: the Self-Service Batch Import Engine. A client’s own team drops in a week of actuals, and anything that doesn’t check out is quarantined — never silently dropped, never committed until it’s clean.',
  },
  {
    id: 'admin-kpis',
    route: '/admin/kpis',
    durationMs: 22000, // 61 words at ~166 wpm
    act: 'Ops Console',
    personas: ['Admin'],
    highlightSelector: '#new-kpi-button',
    caption:
      'And this is the Custom KPI Builder. An admin picks a real metric — margin, schedule health, RAID exposure, utilization — sets a target and a warning line, and assigns it to exactly the personas who should see it. Save it, and the card appears immediately on the Control Tower and the Executive Hub for everyone in that persona — no redeploy, no waiting.',
  },
  {
    // `/ops` itself 307-redirects to the role's landing route
    // (`/ops/telemetry` for a full operator) as of the v1.16.0 operator-RBAC
    // work — point the beat straight at the resolved route so the demo
    // never shows a redirect flash.
    id: 'ops-console',
    route: '/ops/telemetry',
    durationMs: 10000, // 28 words at ~168 wpm
    act: 'Ops Console',
    personas: ['Admin'],
    caption:
      'Zooming out further, the A2R Ops Console is our own operator view across every client we run — platform health, tenant provisioning, and identity federation, all in one place.',
  },
  {
    id: 'ops-pulse',
    route: '/ops/pulse',
    durationMs: 8000, // 22 words at ~165 wpm
    act: 'Ops Console',
    personas: ['Admin'],
    caption:
      'Platform Pulse is engineering telemetry for A2R Delivery OS itself — build, tests, and database health, ingested automatically, never typed in by hand.',
  },
  {
    // Tenant-side security beat — shown to every single-persona track. The
    // point of the beat is the org name/switcher in the header (the only
    // tenant you can ever see), so it reuses #global-header.
    id: 'tenant-isolation',
    route: '/portfolio',
    durationMs: 16000, // 45 words at ~169 wpm
    act: 'Security & Trust',
    personas: ['Executive', 'Admin', 'Security'],
    highlightSelector: '#global-header',
    caption:
      'Everything you have seen sits inside one tenant. A2R Delivery OS enforces that at the database itself — row-level security, composite keys, and a query layer scoped by default. One client’s data is never one bug away from another’s. Not a UI rule — a database guarantee.',
  },
  {
    id: 'operator-roles',
    route: '/ops/access',
    durationMs: 21000, // 53 words at ~151 wpm — see docs/AUTO_DEMO_SCRIPT.md §3
    act: 'Security & Trust',
    personas: ['Admin', 'Security'],
    highlightSelector: '#operator-capability-matrix',
    caption:
      'Our own operators run under least privilege. Six roles — provisioning, support, audit, billing, read-only, owner — each with an exact capability set, enforced in three independent layers: the edge, the page, and the action itself. No operator can widen their own access, and no role can reach a screen it is not cleared for.',
  },
  {
    id: 'step-up-mfa',
    route: '/ops/security',
    durationMs: 17000, // 43 words at ~152 wpm
    act: 'Security & Trust',
    personas: ['Admin', 'Security'],
    highlightSelector: '#operator-mfa-panel',
    caption:
      'And there is no standing admin access. Every privileged action takes a fresh step-up — a stated reason, a re-entered password, and a one-time code from an authenticator app — valid for a few minutes, then gone. Changing a password kills every active elevation instantly.',
  },
  {
    id: 'audit-ledger',
    route: '/ops/audit',
    durationMs: 15000, // 42 words at ~168 wpm
    act: 'Security & Trust',
    personas: ['Admin', 'Security'],
    highlightSelector: '#jit-elevation-log',
    caption:
      'Every elevation, and every action taken on a client’s data, is written to a hash-chained ledger that is immutable at the database engine — the application’s own role cannot update or delete a single row of it. What happened, happened, on the record.',
  },
  {
    id: 'closing',
    route: '/portfolio',
    durationMs: 7000, // 19 words at ~163 wpm
    act: 'Introduction',
    personas: ['Executive', 'Admin', 'Security'],
    caption: 'That’s the tour. Feel free to take the wheel from here — everything you just saw is one click away.',
  },
];

/**
 * The step sequence for a persona track, in script order. 'Full Tour'
 * always returns the whole script; 'Executive' / 'Admin' / 'Security'
 * return only the steps tagged for that track, in the same relative order.
 */
export function getStepsForPersona(persona: DemoPersona): DemoStep[] {
  if (persona === 'Full Tour') return [...DEMO_SCRIPT];
  return DEMO_SCRIPT.filter((step) => step.personas.includes(persona));
}

export function isDemoPersona(value: unknown): value is DemoPersona {
  return typeof value === 'string' && (DEMO_PERSONAS as readonly string[]).includes(value);
}
