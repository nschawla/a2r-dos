/**
 * Release notes — the single source of truth for the in-app "Release Notes
 * / Changelog" viewer in the Ops Console. `CHANGELOG.md` at the repo root
 * mirrors this file for git / GitHub releases.
 *
 * Newest release first. The top entry's `version` must match
 * package.json's version (there's a unit test enforcing it) — bump both
 * together and add an entry whenever the app version changes.
 */

export type ChangeType = 'feature' | 'improvement' | 'fix' | 'security';

export interface ChangeEntry {
  type: ChangeType;
  text: string;
}

export interface ReleaseNote {
  version: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  /** One-line theme for the release. */
  headline: string;
  changes: ChangeEntry[];
}

export const CHANGE_TYPE_META: Record<
  ChangeType,
  { label: string; badgeClass: string }
> = {
  feature: { label: 'New', badgeClass: 'text-brand border-brand/40 bg-brand/10' },
  improvement: { label: 'Improved', badgeClass: 'text-success border-success/40 bg-success-soft' },
  fix: { label: 'Fixed', badgeClass: 'text-warning border-warning/40 bg-warning-soft' },
  security: { label: 'Security', badgeClass: 'text-critical border-critical/40 bg-critical-soft' },
};

export const CHANGELOG: ReleaseNote[] = [
  {
    version: '1.4.0',
    date: '2026-09-05',
    headline: 'Role-Based Scoped Filtering, the Custom KPI Definition Engine, and the complete 4-pillar Batch Import Engine',
    changes: [
      { type: 'feature', text: 'Role-Based Scoped Filtering — every practice-level view now enforces who sees what by row, not just by route. VPs, PMO Heads, and PS Ops leads keep a global, tenant-wide view; Practice Directors, Delivery Managers, and Project Managers are automatically scoped to their own practice, direct reports, or assignments on the Control Tower, the Resource & Capacity Cockpit, and every Financial Realization / RAID / Commercial Baseline / Control Audit / Schedule project picker.' },
      { type: 'feature', text: 'Custom KPI Definition Engine (Admin & Org Setup → Custom KPIs) — build your own metric cards by binding a real metric from Financial Realization, Schedule & Milestones, RAID Cockpit, or Resource & Capacity to a target and warning threshold, then assign the personas who should see it. Cards render immediately on the Control Tower and the Executive Hub for everyone in that persona, with no redeploy.' },
      { type: 'feature', text: 'Forecast & EAC Updates — a third Batch Import pillar ingesting forward-looking cost-to-complete and revised Estimate-at-Completion hours by rate-card role, for matrix-mode engagements.' },
      { type: 'feature', text: 'Status Reports & RAID Log — a fourth Batch Import pillar ingesting a weekly narrative status highlight, a new RAID item, or both, per engagement, sharing the same quarantine/correction/commit workflow as the other three pillars.' },
      { type: 'improvement', text: 'The Auto Demo cinematic tour gained a dedicated role-aware-scoping beat (a VP’s global view vs. a Practice Director’s scoped view on the same screen) and an expanded Custom KPI Builder beat that narrates the card appearing on both the Control Tower and the Executive Hub.' },
    ],
  },
  {
    version: '1.3.0',
    date: '2026-09-04',
    headline: 'A2R DOS rebrand, the Gunmetal Ascent Vector logo, an RBAC Master Matrix, and the Self-Service Batch Import Engine',
    changes: [
      { type: 'feature', text: 'Self-Service Batch Import Engine — a drag-and-drop portal (Admin & Org Setup → Data Ingestion & Templates → Batch Import) for weekly, tenant-wide CSV or Excel uploads of Actuals or Milestone & Progress updates spanning any number of engagements in one file. Every row is validated against your live projects and roster and staged for review — valid and invalid rows alike, so nothing is lost to a bad upload.' },
      { type: 'feature', text: 'Quarantine & inline correction — malformed rows are isolated with a plain-English reason for every failure (missing primary keys, unmapped project references, unrecognizable dates); fix a row directly in the grid and re-validate it live, with no re-upload required.' },
      { type: 'feature', text: 'Hard-stop batch commit — Re-validate & Commit stays disabled while any row still errors, and the server re-checks every row one more time immediately before writing anything. A batch can never partially land: it is all-or-nothing in one transaction, logged to both the Audit Trail and the hash-chained Compliance Ledger.' },
      { type: 'feature', text: 'Centralized RBAC Master Matrix — a single permission matrix maps five personas to allowed sidebar groups, per-engagement module pills, and routes. Unauthorized items are omitted from rendering entirely, not just disabled, and an edge middleware guard independently blocks a direct navigation to a disallowed route.' },
      { type: 'improvement', text: 'Header cleanup — the RBAC persona preview and its redundant second role picker moved out of the main tenant header into a dedicated "Persona Preview" control inside the A2R Ops Console, restoring a clean, uncluttered executive header.' },
      { type: 'improvement', text: 'Application renamed — the "A2R Ventures Demo" flagship demo workspace is now "A2R DOS Demo" across the UI, seed data, and documentation.' },
      { type: 'improvement', text: '"Concept B: Ascent Vector" logo — the brand mark is now a single geometric glyph (a solid triangle with a nested triangular counter forming the letter "A") rendered in a fixed solid Gunmetal Gray, on its own design token independent of the interactive-accent blue used by buttons and links.' },
    ],
  },
  {
    version: '1.2.2',
    date: '2026-09-03',
    headline: 'Executive Clarity — a crisp light theme, the integrated A2R logo, and universal sub-navigation',
    changes: [
      { type: 'improvement', text: 'Executive Clarity visual redesign — the workspace moves from dark charcoal to a crisp, high-contrast light theme built for an executive audience and print/PDF export: soft off-white canvas, white surfaces, deep zinc text, and subtle card shadows for separation. Body text across dense tables (Portfolio, Financials, Roster) meets WCAG AAA.' },
      { type: 'improvement', text: 'New integrated A2R logo mark — the sharp "A2R" wordform with a solid underline rule, in one solid corporate blue (no gradients), rendered as live text so it stays crisp at any size and in exported PDFs.' },
      { type: 'improvement', text: 'Universal sub-navigation pills — Admin & Org Setup, the Control Tower, and the Executive Hub now switch between focused single-screen views (Roster / Governance / Data & Compliance, etc.) instead of one long scroll; every per-engagement module carries a Baseline · Financials · Schedule · RAID · Control Audit pill row.' },
      { type: 'improvement', text: 'Identity Federation is now managed by A2R in the Ops Console (/ops/identity) as platform infrastructure, configured per tenant — it is no longer a self-serve panel in tenant Admin.' },
      { type: 'improvement', text: 'The dark status-report and audit-certificate PDF exports are now light, ink-on-white documents.' },
      { type: 'feature', text: 'QA & UAT framework — a scenario-based enterprise-flow test suite (landing resolution, perspective switching, governance templates, financial masking, SSO configuration), a matching Playwright E2E suite (J1–J5), and a full human-executable runbook at docs/UAT_TEST_RUNBOOK.md.' },
    ],
  },
  {
    version: '1.2.0',
    date: '2026-09-03',
    headline: 'Enterprise Governance & Identity — compliance templates, financial masking, and SSO / SAML / OIDC federation',
    changes: [
      { type: 'feature', text: 'Enterprise Governance Framework — a Hybrid Configuration Model in Admin & Org Setup: start from a pre-tested compliance template (Standard Delivery, Strict Financial Governance, Agile Delivery, or Board-Only), then override which modules appear in navigation and whether margins / EAC are scrubbed for delivery roles below VP.' },
      { type: 'feature', text: 'Enterprise SSO / Identity Federation — configure one SAML 2.0 or OIDC identity provider per workspace, with setup presets for Microsoft Entra ID (Azure AD), Okta and Google Workspace; paste the IdP metadata or discovery URL and verify it (endpoints and signing-certificate fingerprint are extracted and pinned).' },
      { type: 'feature', text: 'Just-in-time provisioning & security-group mapping — on a federated login, the assertion’s group / role claims resolve a delivery and console role from the tenant’s mapping table (lowest priority wins), and a membership is created or an SSO-provisioned one re-synced. Admin-assigned roles are never overwritten by JIT.' },
      { type: 'feature', text: 'Role-based landing & perspective switcher — a Workspace Lens (Executive / Delivery / Finance / Operations) drops multi-role users on their tailored landing page after sign-in and can be re-pointed from a header switcher; every module stays reachable from the sidebar and ⌘K.' },
      { type: 'security', text: 'SSO enforcement — when federation is enforced for an email domain, password sign-in for that domain is refused. OIDC client secrets are AES-256-GCM encrypted at rest; only a fingerprint is shown in the UI.' },
      { type: 'security', text: 'Every governance and identity-federation change is hash-chained in the Compliance Ledger (GOVERNANCE_CONFIG_CHANGE, SSO_CONFIG_CHANGE, SSO_JIT_PROVISION).' },
      { type: 'improvement', text: 'Financial data masking is now org-configurable — the Strict Financial Governance and Agile Delivery templates push blended margin, EAC and cost variance out of reach for Practice Director and below, on top of the standard role-based tiers.' },
      { type: 'improvement', text: 'Sidebar refinement — minimalist inline icons on every module, child items indented under their section headings.' },
      { type: 'improvement', text: 'Softer premium charcoal theme — the pitch-black canvas moves to a cool `#12141C` charcoal ramp while keeping the high-contrast hairline borders and single blue accent.' },
      { type: 'improvement', text: 'User Manual expanded with governance templates, financial-masking, perspective-switcher and identity-federation guidance.' },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-09-03',
    headline: 'The single-pane command layer — obsidian design system, Command Center, universal ⌘K, and the SteerCo Briefing',
    changes: [
      { type: 'feature', text: 'Single-Pane Command Center (/command) — a Pulse strip of portfolio vitals, a terminal-style Command Bar for natural-language navigation ("financials for Contoso"), and one chronological Active Stream that merges activity, governance, and open escalated risk.' },
      { type: 'feature', text: 'Universal ⌘K / Ctrl+K command palette — available on every screen including the operator console and sign-in, searching destinations, actions, engagements (with a health dot), people, and open escalated RAID in a single list, with full keyboard control and route prefetch.' },
      { type: 'feature', text: 'SteerCo Briefing (/steerco) — a lean, board-ready portfolio view (headline, Pulse, margin health, what-moved, watchlist) built from the same engines as the module pages, with a clean light-document print / PDF export.' },
      { type: 'feature', text: 'Platform Pulse operator console (/ops/pulse) — automatically ingested engineering telemetry for the platform itself: running build and commit, a live database probe with latency, last test-suite result, and an Engineering Stream of recent commits, test runs, and releases.' },
      { type: 'feature', text: 'API bulk-ingest now writes to the tenant Active Stream — each scheduled timesheet feed appears as an activity event with the record count, hours, and API key name.' },
      { type: 'improvement', text: 'Obsidian design system — a deep-obsidian ground, a single systemBlue (#0A84FF) interactive accent, flat shadow-free surfaces, status colors reserved for status only, a shared Container layout primitive, and a flat brand mark.' },
      { type: 'improvement', text: 'Apple-grade micro-interactions — crisp 120ms transitions, a consistent blue focus ring on every interactive element, animated command surfaces, and a full prefers-reduced-motion opt-out.' },
      { type: 'improvement', text: 'Sidebar navigation reordered to follow the delivery workflow — Commercial Baseline → Financial Realization → Schedule & Milestones → RAID Cockpit → Control Audit — and the Command Bar anchored to the top of the Command Center as its primary execution header.' },
      { type: 'improvement', text: 'User Manual & Operator’s Guide published (docs/USER_MANUAL.md).' },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-09-03',
    headline: 'GA readiness — security hardening, observability, and a unified design system',
    changes: [
      { type: 'security', text: 'Sliding-window rate limiting on the sign-in route (10/min per IP) and the Data Ingestion API (60/min per key), returning 429 with Retry-After.' },
      { type: 'security', text: 'Baseline HTTP security headers on every response — X-Frame-Options: DENY, CSP frame-ancestors, nosniff, Referrer-Policy, Permissions-Policy.' },
      { type: 'security', text: 'Compliance ledger hardened against concurrent-append chain forks (per-tenant advisory lock + a unique chain-link constraint) and against accidental loss (organization foreign keys set to RESTRICT).' },
      { type: 'security', text: 'Database connections now require TLS (sslmode=require), with a production startup check that warns on a misconfiguration.' },
      { type: 'feature', text: 'Data retention service — configurable windows for the activity feed, governance audit trail, ended impersonation grants, and revoked API keys, with a dry-run-by-default sweep runnable by script or a token-authed endpoint.' },
      { type: 'feature', text: 'Health and readiness probes (/api/health, /api/health/ready) for load balancers and deploy gating.' },
      { type: 'feature', text: 'Centralized error reporting with structured JSON logging and a drop-in Sentry integration point.' },
      { type: 'feature', text: 'Data Ingestion & Template Hub — standardized CSV templates and schema reference for the delivery roster, project baselines, and aggregated period actuals, in both the Ops Console and tenant Admin.' },
      { type: 'feature', text: 'Version Governance & Changelog — this build stamp and Release Notes viewer.' },
      { type: 'feature', text: 'Enterprise Security & Trust overview published (docs/SECURITY.md).' },
      { type: 'improvement', text: 'App-wide error boundaries with branded recovery screens, plus a toast notification system wired into the key administrative actions.' },
      { type: 'improvement', text: 'Route loading skeletons and branded not-found pages.' },
      { type: 'improvement', text: 'Unified design system — a single brand token set, a shared brand mark, consolidated KPI cards, and a refreshed sign-in screen.' },
      { type: 'improvement', text: 'Practice / department taxonomy modernized to five domain-led categories across seed data and fixtures.' },
    ],
  },
  {
    version: '0.9.0',
    date: '2026-08-28',
    headline: 'Tenant sovereignty, data masking, and the automated ingestion bridge',
    changes: [
      { type: 'feature', text: 'Super-Admin Tenant & Data Sovereignty engine — Active / Suspended / Grace-Period lifecycle, a read-only time-boxed Impersonation Gateway (every session audited before it starts), a cryptographic data-export package, and a soft-delete Purge Protocol that issues a Certificate of Destruction.' },
      { type: 'feature', text: 'Secure Data Ingestion API Bridge — tenant-scoped API keys (issued from the Ops Console) and a bulk timesheet ingestion endpoint that rolls hours into the capacity and EAC engines.' },
      { type: 'feature', text: 'Role-based data masking — contractor cost rates and blended margins are tiered by delivery role, with a clear "restricted" indicator where a value is hidden.' },
      { type: 'security', text: 'Immutable, hash-chained SOC 2 Compliance Ledger with a live integrity badge on the audit-log view.' },
    ],
  },
  {
    version: '0.8.0',
    date: '2026-08-14',
    headline: 'Capacity planning, executive reporting, and governance depth',
    changes: [
      { type: 'feature', text: 'Resource & Capacity Cockpit — blended billable utilization, a concurrency-overload radar, and a 52-week staffing forecast measured against role utilization policies and the corporate holiday calendar.' },
      { type: 'feature', text: 'Executive Briefing Hub — a portfolio-level briefing with macro rollups, risk distribution, and print-to-PDF export.' },
      { type: 'feature', text: 'Capacity & concurrency schema foundation — EVM-style project rollups and a five-lens (cost / schedule / scope / quality / resource) health vector.' },
      { type: 'improvement', text: 'Executive navigation restructure into Portfolio / Engagement Governance / Reporting, and a cleanup of the Control Audit module to "Delivery Controls & Governance Standards".' },
      { type: 'improvement', text: 'Automated end-to-end test suite (Playwright) and a requirements traceability matrix.' },
      { type: 'fix', text: 'Resolved the NextAuth "Unexpected end of JSON input" sign-in error and hardened the session refresh path.' },
    ],
  },
];

/** The most recent release. */
export const LATEST_RELEASE: ReleaseNote = CHANGELOG[0]!;
