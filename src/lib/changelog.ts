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
  feature: { label: 'New', badgeClass: 'text-brand-hi border-brand-hi/40 bg-brand-hi/10' },
  improvement: { label: 'Improved', badgeClass: 'text-success border-success/40 bg-success-soft' },
  fix: { label: 'Fixed', badgeClass: 'text-warning border-warning/40 bg-warning-soft' },
  security: { label: 'Security', badgeClass: 'text-critical border-critical/40 bg-critical-soft' },
};

export const CHANGELOG: ReleaseNote[] = [
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
