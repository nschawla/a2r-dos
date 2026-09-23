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
    version: '1.29.0',
    date: '2026-09-23',
    headline: 'Sidebar Flattening, Command Center Merge, 4-Tier RBAC, Demo Script',
    changes: [
      { type: 'improvement', text: 'Sidebar flattened — the three grouped sections (Portfolio / Engagement Governance / Reporting) collapsed into one ordered stack: Control Tower, Commercial Baseline, Financial Realization, Schedule & Milestones, RAID Cockpit, Resource & Capacity, SteerCo Briefing, Executive Hub, Control Audit. Admin & Org Setup and the Compliance Ledger stay pinned at the bottom; the A2R Ops Console link stays staff-only.' },
      { type: 'improvement', text: 'The standalone Command Center (/command) is retired — the route now permanently redirects to the Control Tower. Its Impact-Aware Decision Cards feed was already duplicated there (the Decisions tab); its natural-language Command Bar moved there too, pinned above the module tabs so it stays reachable regardless of which one is active.' },
      { type: 'improvement', text: '4-Tier RBAC: the six-persona navigation layer (RbacPersona) collapsed to five. Practice Director and VP-Professional Services now share one merged tier with identical, full-operational navigation — built by elevating VP_EXECUTIVE up to Practice Director\'s existing breadth, never by narrowing Practice Director down, so real edit/approval authority is completely unchanged. Delivery/Project Director gained visibility into aggregate financials and commercial baselines across their PMs\' projects. The underlying six-value DeliveryAccessRole enum and every Membership row are untouched — no migration.' },
      { type: 'improvement', text: 'New docs/DEMO_WALKTHROUGH.md — a presenter-facing, manual click-through demo script mirroring the flattened UI, alongside the existing hands-free docs/AUTO_DEMO_SCRIPT.md. Added to the in-app Documentation Hub (/ops/docs).' },
      { type: 'improvement', text: 'The flagship demo tenant is renamed from "PS-DOS Demo" to "Apex Global Services" (display name only — the slug, routes, and guest-account emails are unchanged), removing the confusing double-"Demo" naming against the Ops Console\'s own Auto Demo launcher.' },
    ],
  },
  {
    version: '1.28.0',
    date: '2026-09-23',
    headline: 'Documentation Hub, Implementation & Client Support Runbooks, Support Trace IDs',
    changes: [
      { type: 'feature', text: 'New in-app Documentation Hub at /ops/docs — a native Markdown reader for the repo\'s curated docs/*.md, organized into Architecture, RTM, Module Specs, QA, Implementation Guide, Release Notes, and Operations & Support. Content is baked in at build time (scripts/build-docs-hub.ts), so it never depends on reading the filesystem at runtime. Same devdocs:view gate as the existing /ops/dev-docs summary, which it complements rather than replaces.' },
      { type: 'improvement', text: 'Server Action and API route failures now carry a support-ticket-friendly trace id — "(Ref: <id>)" in the generic error message, or traceId in a Route Handler\'s 500 body — matching the reference id Next.js already shows on a page-render error boundary. A client can quote it verbatim; Tier 2/3 grep the exact structured log line back out.' },
      { type: 'improvement', text: 'Two new docs: docs/IMPLEMENTATION_GUIDE.md (a from-zero setup-to-deploy runbook for a new engineer) and docs/CLIENT_SUPPORT_RUNBOOK.md (graceful error states, the trace-id convention, and a Tier 1/2/3 support escalation playbook).' },
    ],
  },
  {
    version: '1.27.0',
    date: '2026-09-23',
    headline: 'Documentation & Schema/RLS Alignment Sweep',
    changes: [
      { type: 'security', text: 'Fixed a real gap the documentation sweep surfaced: PortfolioIntervention (added v1.20.0) was missing its Row-Level Security tenant_isolation policy and was never registered in the ORM auto-scope guardrail — both silently missed at the time. Migration 29 closes it; no application query was ever affected, since every existing read/write already filtered by organizationId explicitly.' },
      { type: 'improvement', text: 'Added docs/EXECUTIVE_TRIAGE_STANDARD.md — the cross-cutting architecture doc for the five Executive Triage modules shipped in v1.21.0–v1.25.0, with a full classification-mechanism comparison table and the shared design principles behind them.' },
      { type: 'improvement', text: 'Synchronized docs/ERD.md, TENANT_MODEL_INVENTORY.md, RTM.md, FRD.md, TEST_COVERAGE.md, EXECUTIVE_SUMMARY.md, and QUICK_REFERENCE.md with the current v1.20.0–v1.26.0 schema and feature state; renamed a colliding Playwright suite label (K → L) for clarity.' },
    ],
  },
  {
    version: '1.26.0',
    date: '2026-09-23',
    headline: 'Control Tower UX Refactor — Bento Grid & the Decisions Tab',
    changes: [
      { type: 'improvement', text: 'The PS Control Tower (/portfolio) no longer stacks its stat cards, Decision Center, utilization, and program rollups in one long vertical column. Its default "Overview" tab now lays every top-line signal out as a responsive Bento Grid — scannable above the fold, no more scrolling to see the operational pulse.' },
      { type: 'improvement', text: 'The full Decision Center (Impact-Aware Decision Cards, pending decisions, high-severity RAID) moved into a new "Decisions" tab alongside Engagements and Activity. The Overview tab keeps a compact summary tile — the same headline plus a flagged/pending/RAID badge row — linking straight there.' },
      { type: 'improvement', text: 'Cards throughout the new Overview grid use the same tighter density (card !p-4) as the stat cards and the five triage-module dual-tile headers shipped earlier today, for visual consistency across the whole app.' },
    ],
  },
  {
    version: '1.25.0',
    date: '2026-09-23',
    headline: 'Commercial Baseline Cockpit Executive Triage & Thematic Clustering',
    changes: [
      { type: 'feature', text: 'The Commercial Baseline Cockpit (/commercial-baseline) now opens on a portfolio-wide Executive Triage summary instead of going straight to a per-project picker: total contracted value, active-contract count, a locked-vs-draft baseline split, a Red/Amber margin-health count, and a Fixed Fee vs. T&M breakdown.' },
      { type: 'feature', text: 'Commercial Risk & Margin Leakage Clusters group the at-risk engagements by likely root cause — Change Order Exposure, Margin Squeeze on Fixed-Fee Deliverables, Blended Rate Erosion, Exceeded Baseline Scope Caps — sorted by how many distinct projects each pattern touches. Click a cluster to expand it inline; double-click any engagement for a shortcut straight to its Commercial Baseline view.' },
      { type: 'improvement', text: 'The per-project engagement picker stays one click away below the new triage summary — nothing about the existing per-project commercial workflow changed.' },
    ],
  },
  {
    version: '1.24.0',
    date: '2026-09-23',
    headline: 'Resource & Capacity Cockpit Executive Triage & Thematic Clustering',
    changes: [
      { type: 'feature', text: 'The Resource & Capacity Cockpit (/capacity) now opens on a portfolio-wide Executive Triage banner above its existing tabs: blended utilization, unassigned headcount, a count of severely over-allocated resources (>110% of capacity), and a Red/Amber/Optimal resource-health split.' },
      { type: 'feature', text: 'Allocation Bottleneck & Skill Risk Clusters group the at-risk roster by likely staffing root cause — Senior/Architect Over-allocation, Cross-Project Contention for Lead PMs, Junior/Analyst Under-utilization, Bench/Unassigned Capacity — sorted by how many distinct projects each pattern touches. Click a cluster to expand it inline; click a resource for a same-page shortcut to its row in the Utilization table.' },
      { type: 'improvement', text: 'The existing Utilization & Attainment, Concurrency Radar, 52-Week Forecast, and Policy & Holiday Controls tabs are unchanged — the triage banner sits above them, loaded concurrently rather than in series.' },
    ],
  },
  {
    version: '1.23.0',
    date: '2026-09-23',
    headline: 'Schedule & Milestones Cockpit Executive Triage & Thematic Clustering',
    changes: [
      { type: 'feature', text: 'The Schedule & Milestone Burndown Cockpit (/schedule) now opens on a portfolio-wide Executive Triage summary instead of going straight to a per-project picker: active-milestone count, upcoming go-lives in the next 30 and 60 days, and a Red/Amber/on-track milestone-health split across your whole scope.' },
      { type: 'feature', text: 'Schedule Bottleneck & Risk Clusters group the at-risk engagements by likely root cause — Third-Party Dependency Cascades, UAT Sign-off Lags, Resource Contention on Deployment Windows, Scope Expansion Slippage — sorted by how many distinct projects each pattern touches. Click a cluster to expand it inline; double-click any engagement for a shortcut straight to its schedule view.' },
      { type: 'improvement', text: 'The per-project engagement picker stays one click away below the new triage summary — nothing about the existing per-project schedule workflow changed.' },
    ],
  },
  {
    version: '1.22.0',
    date: '2026-09-23',
    headline: 'Financial Realization Cockpit Executive Triage & Thematic Clustering',
    changes: [
      { type: 'feature', text: 'The Financial Realization Cockpit (/financials) now opens on a portfolio-wide Executive Triage summary instead of going straight to a per-project picker: total BAC, Actuals, and EAC Variance across your whole scope, a Red/Amber over-budget project count, and a Fixed Price vs. T&M breakdown.' },
      { type: 'feature', text: 'Financial Variance & Risk Clusters group the Amber/Red engagements by likely root cause — Unbilled Milestone Delays, Scope Creep Overruns, Subcontractor Rate Variances, Labor Burn Accelerations — sorted by how many distinct projects each pattern touches. Click a cluster to expand it inline; double-click any engagement for a shortcut straight to its Financial Realization view.' },
      { type: 'improvement', text: 'The per-project engagement picker stays one click away below the new triage summary — nothing about the existing per-project EAC workflow changed.' },
    ],
  },
  {
    version: '1.21.0',
    date: '2026-09-23',
    headline: 'RAID Cockpit Executive Triage & Thematic Clustering',
    changes: [
      { type: 'feature', text: 'The RAID Cockpit now opens on a portfolio-wide Executive Triage summary instead of going straight to a per-project picker: a Red/Amber aggregate across every open Critical/High/Medium item in your scope, plus a breakdown by type (Risk/Assumption/Issue/Dependency).' },
      { type: 'feature', text: 'Thematic Risk Clusters group those same items by likely root cause — Resource Bottlenecks, Integration / Data Failures, Scope Creep, Vendor Delays — sorted by how many distinct projects each pattern touches, so a systemic issue reads as one story instead of scattered line items. Click a cluster to expand it inline; double-click any item for a shortcut straight to that project’s RAID board.' },
      { type: 'improvement', text: 'The per-project engagement picker stays one click away below the new triage summary — nothing about the existing per-project RAID workflow changed.' },
    ],
  },
  {
    version: '1.20.0',
    date: '2026-09-22',
    headline: 'PS Orchestration & Decision Engine — Impact-Aware Decision Cards and governed execution',
    changes: [
      { type: 'feature', text: 'Every Red or over-budget engagement on the Command Center and the Control Tower\'s Decision Center now shows 2-3 real, commercially viable response options — a Change Order draft, Resource Re-leveling / Skill Swap, Internal Margin Absorption, a Timeline Extension request, or a Governance Remediation Plan, chosen by what actually flagged the engagement — each with its Client Strategic Context and a Portfolio Domino & Trade-off preview: the real margin impact, which other project loses staffing, and the team velocity risk.' },
      { type: 'feature', text: 'A governance drawer opens on any option: a compliance/guardrail check (SOW type, baseline lock state, approval authority) runs before you can act, and "Submit for Governance Approval & Execute" records the decision, logs it to the Audit Trail and the Immutable Compliance Ledger, and tags the engagement "Intervention Applied" for longitudinal accountability — in one governed step, no separate approval queue.' },
      { type: 'feature', text: 'The Executive Agent is now a proactive orchestration co-pilot: it leads with how many decisions need your authority, names the real response options for a flagged engagement, and points you to the Decision Card to act — it never executes a decision itself, only guides you to where you can.' },
      { type: 'improvement', text: 'A new tenant-level Decision Card approval threshold (Admin → Enterprise Governance, default $25,000) decides which options a Project Manager can execute alone versus which need Practice Director, Delivery Manager, or Admin sign-off.' },
    ],
  },
  {
    version: '1.19.0',
    date: '2026-09-16',
    headline: 'Enterprise SAML SSO: a live IdP handshake, not just configuration',
    changes: [
      { type: 'feature', text: "A real SAML 2.0 sign-in — not just the connection settings. The corporate identity provider's signed response is cryptographically verified (XML digital signature against the certificate on file, exact-match audience and issuer, replay protection on every request), then handed to PS-DOS's existing Just-In-Time provisioning: a first-time federated sign-in creates the user and their membership automatically, mapping the IdP's security-group claims onto the same six-tier role matrix (Global Admin through Viewer / Guest) every account in PS-DOS already uses." },
      { type: 'feature', text: "The Ops Console's Identity Federation panel now shows the exact three values an IdP admin needs to finish trust setup (SP Entity ID, ACS URL, SP metadata URL, each one-click copyable), and a Recent Sign-In Failures log in the same plain-language style as the External Integrations dashboard — \"the IdP rotated its signing certificate,\" not a raw exception." },
      { type: 'improvement', text: "The sign-in page offers a Continue with single sign-on button once an email's domain is recognized as federated, and every SSO failure path — an expired assertion, a replayed sign-in link, a misconfigured tenant — now shows a specific, actionable message instead of a generic error." },
      { type: 'fix', text: "The identity-federation role picker (both the IdP's default-role setting and each security-group mapping) was missing the Viewer / Guest tier — one of the platform's six real roles was silently unreachable from SSO group mapping. All six are selectable now." },
      { type: 'security', text: "Replay protection is enforced at the database, not in memory — each SP-initiated sign-in request is tracked in a tenant-isolated table and consumed exactly once, so a resubmitted SAML response is rejected on the second attempt regardless of which serverless instance handled the first. A cross-tenant edge case in that same replay cache — where knowing another tenant's request identifier could delete their in-flight sign-in — was caught by this release's own test suite and closed before shipping." },
    ],
  },
  {
    version: '1.18.0',
    date: '2026-09-16',
    headline: 'Read-only external integrations, and an Ops Console health dashboard for them',
    changes: [
      { type: 'feature', text: "Read-only connectors for the PSA/CRM systems clients already run: Jira, Asana, and Monday.com for sprint velocity, issue counts, and milestone status; NetSuite, Certinia, Kantata, and OpenAir for baseline margins, financial actuals, and resource allocation; Salesforce for pipeline and deal stages. Every connector is strictly read-only — nothing PS-DOS does ever writes back to the external system." },
      { type: 'feature', text: "New Ops Console page, External Integrations: a Connection Health Matrix across every tenant (status, last sync, records ingested, average sync duration, rate-limit headroom), a plain-language error log in place of raw stack traces (\"Jira API token expired or lacks read scope,\" \"NetSuite rate limit reached; backing off for 15 minutes\"), and a one-click Retry Sync." },
      { type: 'security', text: "Connection credentials are sealed at rest with the same AES-256-GCM primitive that protects SSO client secrets, and never appear in any query result an operator's browser receives — only a short, non-reversible fingerprint confirms which secret is stored." },
    ],
  },
  {
    version: '1.17.0',
    date: '2026-09-16',
    headline: 'PS-DOS rebrand, an enterprise showcase portfolio, and a real Persona Preview',
    changes: [
      { type: 'feature', text: 'The platform is now PS-DOS (Professional Services Delivery Operating System) — renamed throughout the app, documentation, and generated reports. No functional change; every account, project, and integration keeps working exactly as before.' },
      { type: 'feature', text: "A curated, role-aware home screen: each persona lands on a tailored view, and the Control Tower's Decision Center surfaces exactly what needs attention today — overdue SteerCo decisions and critical RAID escalations — instead of a generic dashboard." },
      { type: 'improvement', text: 'Sidebar navigation is grouped and color-coded by function (Portfolio Governance, Delivery Tracking, Commercials), an at-risk project shows a short executive status blurb next to its health badge, and RAID / decision tables distinguish Due Soon from genuinely Overdue instead of one generic "Open" state.' },
      { type: 'improvement', text: 'Typed number inputs sit alongside percentage sliders (utilization, margin) for exact entry, Resource & Capacity tables show TOTAL rows, and raw internal record IDs no longer leak into audit-trail diffs.' },
      { type: 'feature', text: 'Five new hyper-realistic demo engagements across utilities, healthcare, legal/IT, and manufacturing — each with a full RAID log, SteerCo decision history, and financial trail, so the Decision Center and portfolio views show meaningful data out of the box.' },
      { type: 'feature', text: "Persona Preview: a tenant Admin or A2R staff member can preview the app as any of the six roles from an explicit banner at the top of the workspace. The sidebar, module tabs, and every write control (Lock Baseline, and the RAID / Schedule / Audit / Financials / Commercial Baseline editors) morph to match exactly what that role would see, and picking a persona lands you on that role's own tailored page — never orphaned on a URL the previewed role can't reach. A solid warning-colored bar and an Exit preview button make an active preview impossible to mistake for real access. Every other signed-in role sees no switcher at all." },
      { type: 'fix', text: 'The Commercial Baseline effort-matrix editor and the RAID / Schedule / Audit / Financials editors now correctly hide their edit controls when previewing a read-only or client-facing persona — previously only the Lock Baseline button respected an active preview.' },
    ],
  },
  {
    version: '1.16.0',
    date: '2026-09-07',
    headline: 'A2R organizational roles, guest viewer accounts, and Ops Console role management',
    changes: [
      { type: 'feature', text: 'Operator (Ops Console) access now carries a role: Super Admin, Provisioning Staff, Support / Troubleshooting, Auditor / Compliance, Billing / Finance, or Viewer / Guest. Each role reaches only the console sections and actions its remit needs — enforced in the route guard, the middleware, and every mutating action. Existing operators are Super Admin, unchanged.' },
      { type: 'feature', text: 'New Ops Console → Role & Access page: a Super Admin can view every operator, change a role (recorded as a re-grant so the audit trail is preserved), and see the full capability matrix. New Billing and Audit & Compliance sections for those roles.' },
      { type: 'feature', text: 'A strict read-only tenant tier (Viewer): full portfolio and SteerCo visibility, zero edit authority, financial figures scrubbed. Five family guest accounts provisioned as Viewers of the demo organization.' },
      { type: 'improvement', text: 'The sign-in screen has a show/hide toggle on the password field (eye / eye-off), with proper accessibility labelling.' },
    ],
  },
  {
    version: '1.15.2',
    date: '2026-09-07',
    headline: 'Readiness probe no longer leaks infrastructure detail to the internet',
    changes: [
      { type: 'security', text: 'The public readiness endpoint (/api/health/ready) now returns only up/down to unauthenticated callers — the database dependency, query latency, and error type are no longer disclosed. A monitoring caller presenting a HEALTH_CHECK_TOKEN still gets the full diagnostic; every failure is recorded server-side regardless.' },
    ],
  },
  {
    version: '1.15.1',
    date: '2026-09-07',
    headline: 'MFA key separation, atomic replay protection, and hardened operator CLIs',
    changes: [
      { type: 'security', text: 'The operator MFA (TOTP) secret is now encrypted with a dedicated, versioned key (MFA_ENCRYPTION_KEY) instead of reusing the session-signing secret. A key version is recorded with each ciphertext, and a secret on an older key is transparently re-encrypted on the next successful verification, so future key rotation needs no downtime.' },
      { type: 'security', text: 'TOTP and recovery-code verification are now strictly atomic at the database — a single conditional update for the TOTP anti-replay counter, and a row lock for recovery-code consumption. Two concurrent requests presenting the same valid code can no longer both succeed.' },
      { type: 'security', text: 'The direct-database operator CLIs no longer accept a password as a command-line argument (it leaked into process listings and shell history). Passwords are read from a masked prompt or stdin. An admin-forced password reset now requires the account to choose a new one on next sign-in by default and always invalidates existing sessions, and any write against the production database requires an explicit confirmation.' },
    ],
  },
  {
    version: '1.15.0',
    date: '2026-09-07',
    headline: 'Rate limiter fails closed in production; mandatory operator MFA for elevation',
    changes: [
      { type: 'security', text: 'The distributed rate limiter now fails closed in production. If a shared Upstash backend is configured and a request to it fails, the request is denied rather than silently falling back to weaker per-instance limiting; the failure is reported at error level. A deployment that runs no shared backend still uses the in-process limiter, unchanged.' },
      { type: 'security', text: 'Every Just-In-Time operator elevation now requires a second factor: a 6-digit code from an authenticator app (or a single-use recovery code) on top of your password. Operators enroll once at Ops → Operator Security; the TOTP secret is encrypted at rest, replayed codes are rejected, and disabling a factor is a direct-database operation only — a stolen password cannot strip it.' },
      { type: 'improvement', text: 'New Operator Security page in the Ops Console for authenticator enrollment, with a QR code, manual key, and ten one-time recovery codes shown once. A command-line reset is available for a fully locked-out operator.' },
    ],
  },
  {
    version: '1.14.0',
    date: '2026-09-07',
    headline: 'Exact-decimal financials end-to-end, step-up elevation, test-rig isolation',
    changes: [
      { type: 'improvement', text: 'The calculation engine now performs every monetary and rate operation in exact decimal arithmetic — revenue, cost, contingency, EAC, and portfolio totals are accumulated without floating-point drift and rounded once, at a defined accounting boundary (money to the cent, half-up). A new precision test suite proves large portfolios and multi-row EAC totals are exact.' },
      { type: 'security', text: 'Obtaining a Just-In-Time operator elevation now requires re-entering your password (step-up authentication), and the elevation is bound to your session: a password change or a global sign-out invalidates every elevation immediately. Repeated elevation attempts are rate-limited.' },
      { type: 'security', text: 'The automated test suites can no longer run against the production database. Vitest and Playwright refuse to start unless pointed at a staging or local database; production verification is now a dedicated read-only check that issues no writes.' },
    ],
  },
  {
    version: '1.13.0',
    date: '2026-09-06',
    headline: 'Engine-level ledger immutability, complete composite tenant keys, break-glass removed',
    changes: [
      { type: 'security', text: 'The Immutable Compliance Ledger is now immutable at the database engine, not just by convention: the application runtime role can no longer update or delete a ledger row, and a database trigger rejects any modification or truncation from any role except through a deliberate, audited maintenance opt-in reserved for lawful data-subject erasure.' },
      { type: 'security', text: 'Every remaining relationship between two tenant-owned records now carries a composite foreign key, so the database itself rejects a row that references a parent belonging to a different organization — closing the last cross-tenant reference gaps (assignments, timesheets, RAID/SteerCo owners, project leads, practices, SSO group mappings, and more).' },
      { type: 'improvement', text: 'The fast global break-glass was removed after review. It dropped the entire application fleet to an owner-level database role and was toggleable from a console action. Normal tenant traffic is now always constrained to the least-privilege role; the sole rollback lever is a deliberate configuration change and redeploy.' },
    ],
  },
  {
    version: '1.12.0',
    date: '2026-09-06',
    headline: 'Production RLS cutover prep, identity-table lockdown, and break-glass',
    changes: [
      { type: 'security', text: 'Database-level Row-Level Security is now staged on production: the restricted role and tenant-isolation policies are applied and verified (inert until enforcement is switched on), so a single environment-variable change completes the cutover. Staging has run fully enforced since v1.9.0.' },
      { type: 'security', text: 'The identity and routing tables (sessions, staff grants, elevations, impersonation grants, memberships, …) are now hard-denied to the restricted application role — the tenant runtime cannot read or modify them at all. They are reached only through the privileged administrative path.' },
      { type: 'feature', text: 'Break-glass: a time-boxed, auto-expiring control that disables database-level tenant isolation within seconds during an incident — no redeploy — while keeping application-tier scoping in force and paging the on-call on every affected request. Operable from the Ops Console or an incident shell.' },
      { type: 'improvement', text: 'A complete tenant-model inventory (docs/TENANT_MODEL_INVENTORY.md) maps all 37 data models to how their tenant boundary is enforced, with a test that fails if the schema drifts from it. The direct-SQL RLS smoke test now covers SELECT/INSERT/UPDATE/DELETE/UPSERT, cross-tenant foreign keys, and the ingestion path.' },
    ],
  },
  {
    version: '1.11.0',
    date: '2026-09-06',
    headline: 'Financial precision (exact NUMERIC money) + audit-trail retention',
    changes: [
      { type: 'improvement', text: 'Every monetary, rate, margin and EAC/BAC field is now stored as exact decimal (Postgres NUMERIC), not floating point — so amounts are exact at rest and totals never accumulate rounding error as a portfolio grows. The calculation engine is unchanged; values are converted at one boundary.' },
      { type: 'security', text: 'Deleting a user or an organization can no longer cascade-destroy the operator-access history. Staff entitlements, Just-In-Time elevations and tenant-impersonation records are now protected by the database from any cascade, matching the immutable audit ledger.' },
      { type: 'security', text: 'The data-retention sweep no longer deletes ended impersonation grants — operator-access history is retained indefinitely for compliance, with the tamper-evident ledger as the permanent record. Staff grants and elevations were already never swept.' },
    ],
  },
  {
    version: '1.10.0',
    date: '2026-09-06',
    headline: 'Payload strictness, explicit global sign-out, and production polish',
    changes: [
      { type: 'security', text: 'Every API request body and server-action payload is now validated with a strict schema that rejects unexpected properties — closing the mass-assignment surface, including the workspace restore snapshot which writes into ~10 tables.' },
      { type: 'feature', text: 'Added "Sign out of all sessions" to the user menu — one click revokes every active session on every device and server instance (the same database-backed mechanism a password change uses). The normal "Sign out" stays local to the current device.' },
      { type: 'security', text: 'The app\'s own cookies (active organization, workspace lens, operator elevation, tenant impersonation) are now SameSite=Strict + Secure in production + HttpOnly, and the NextAuth session/CSRF cookie flags are pinned explicitly so they can\'t drift.' },
      { type: 'improvement', text: 'Serverless database pooling: the app now warns in production on Vercel if DATABASE_URL is not tuned for connection reuse, and the setup docs prescribe the pooler + connection-limit settings that prevent connection exhaustion.' },
      { type: 'security', text: 'Hardened error sanitization — the data-retention endpoint now shares the centralized error boundary, and a static guard fails the build if any handler would surface a raw backend error or stack trace to a client.' },
    ],
  },
  {
    version: '1.9.0',
    date: '2026-09-06',
    headline: 'Database-level tenant isolation enforced on staging (RLS) + a dedicated staging database',
    changes: [
      { type: 'security', text: 'Row-Level Security is now enforced end-to-end on a dedicated staging database. Every tenant-scoped transaction switches to a non-privileged database role and sets the active organization, so the database itself — not just the application — rejects any cross-tenant read or write. Verified with direct SQL across all 28 tenant tables and the full automated suite.' },
      { type: 'improvement', text: 'Introduced a dedicated staging Supabase project so risky schema and security migrations are rehearsed off the shared production database. Migrations 16 (restricted role) and 17 (per-table policies) are applied there; production remains on the application-tier isolation shipped in 1.7–1.8 pending its own cutover.' },
      { type: 'improvement', text: 'Every multi-statement database transaction that touches tenant data now goes through a single `withTenantTx` wrapper (~20 call sites), which carries the tenant identity into the database session for RLS and is a no-op when enforcement is off — so production behaviour is unchanged.' },
      { type: 'security', text: 'A least-privilege runtime database role (no superuser, no RLS bypass) is now the identity every tenant query runs under when enforcement is on, replacing reliance on the all-powerful `postgres` role for application queries.' },
    ],
  },
  {
    version: '1.8.0',
    date: '2026-09-06',
    headline: 'Tenant-isolation & security hardening — composite FKs, hashed bearer tokens, distributed rate limiting',
    changes: [
      { type: 'security', text: 'The database now physically rejects a cross-tenant child row. Every project- and batch-scoped table carries a composite foreign key on (organization, parent) referencing a matching composite key on the parent, so a row whose tenant disagrees with its project’s / batch’s tenant cannot be created even if both application isolation layers were bypassed.' },
      { type: 'security', text: 'Staff-elevation and tenant-impersonation bearer tokens are no longer stored in the clear. The cookie carries a 256-bit secret; the database keeps only its SHA-256 hash and looks sessions up by hash. A database read or a leaked backup no longer yields a usable token. Live elevation / impersonation sessions are invalidated on deploy (re-elevate once).' },
      { type: 'security', text: 'Rate limiting can now enforce one atomic global window across every serverless instance via Upstash Redis (set UPSTASH_REDIS_REST_URL / _TOKEN). Unset, it keeps the existing in-process limiter; a transient Redis failure falls back to it automatically so a Redis blip never blocks sign-in.' },
      { type: 'improvement', text: 'Database Row-Level Security groundwork ships complete but dormant: the per-request SET LOCAL Prisma bridge, the restricted-role and per-table-policy migrations, a direct-SQL enforcement smoke test, and a staged enforcement runbook. Nothing is enforced until a rehearsal database and maintenance window exist (Phase C).' },
    ],
  },
  {
    version: '1.7.1',
    date: '2026-09-06',
    headline: 'Framework upgrade — Next.js 15 (LTS) and a clean lint sweep',
    changes: [
      { type: 'security', text: 'Upgraded to Next.js 15.5.25 (the security-maintained LTS line) and next-auth 4.24.15, clearing the Next.js advisories that affected the 14.2 line. React stays on 18.3.' },
      { type: 'improvement', text: 'Migrated every server component, route handler, and server action to the async request APIs (cookies / headers / route params are awaited) that Next.js 15 requires.' },
      { type: 'fix', text: 'The tenant-scope cell is now a process-wide singleton — this removes a class of spurious "ran with no tenant scope" errors that could appear during sign-in when the module was evaluated more than once.' },
      { type: 'improvement', text: 'The linter now reports zero errors and zero warnings: fixed unescaped text entities, stopped linting TypeScript declaration files, and registered the TypeScript ESLint plugin so rule directives resolve.' },
      { type: 'security', text: 'Forced the bundled PostCSS build tool up to a patched 8.5.x, clearing its source-map path-traversal advisories.' },
    ],
  },
  {
    version: '1.7.0',
    date: '2026-09-06',
    headline: 'Security architecture hardening — tenant isolation, session integrity, JIT operator elevation, and production observability',
    changes: [
      { type: 'security', text: 'Every tenant database query is now auto-scoped by organization at the ORM layer. A Prisma client extension rewrites each query on a tenant-owned table to include the active organization and refuses to run one with no resolved tenant — a backstop under the hand-written scoping the app already applied.' },
      { type: 'security', text: 'The 9 remaining "child" tables (audit entries, RAID, financials, schedule, scope, effort cells, SteerCo decisions, contributors, import rows) now carry their own organization column + foreign key, so the database itself ties every row to its tenant (migration 00000000000012).' },
      { type: 'security', text: 'A2R operator access is now split into eligibility (a standing staff grant) and use (a Just-In-Time elevation): every state-changing /ops action — provisioning, suspension, impersonation, export, purge, API keys, identity federation, granting staff — requires a reason-logged elevation that auto-expires after a strict TTL (default 30 minutes). No standing privileged sessions. Every elevation is on the in-console audit trail.' },
      { type: 'security', text: 'Operator access is an explicit, attributed database grant — the previous "any @a2rventures.com email is staff" wildcard and the isA2rStaff boolean are gone. Grant/revoke from /ops/staff or the staff CLI.' },
      { type: 'security', text: 'Forced-password-rotation is now enforced on every server action and API route, not just the browser redirect: a restricted session is rejected with 403 rather than being able to script around the UI. Changing a password atomically revokes every other device in one step.' },
      { type: 'security', text: 'Sessions are validated against the database on every authenticated request through an explicit state machine (Active / Pending-password-change / Revoked). Any lookup failure or timeout fails closed — the session is treated as revoked, never served stale.' },
      { type: 'security', text: 'Advanced sliding-window rate limiting on the high-risk boundaries — sign-in, registration, password change, the AI document parser, bulk CSV / JSON exports, print-document generation, batch ingestion, and workspace snapshots — with X-RateLimit-* headers on allowed responses, not just the 429.' },
      { type: 'feature', text: 'A named, server-only Data Access Layer: pages and UI components can no longer import the database client directly (enforced by lint + a test). Reads go through query modules, writes through server actions.' },
      { type: 'improvement', text: 'A centralized server-side error boundary wraps every mutation action and the download/report API routes: an unhandled exception or database timeout is captured as one structured, secret-redacted log line and returned as a safe generic error instead of an opaque 500.' },
      { type: 'improvement', text: 'The site front door is now a server-only setting (A2R_SITE_MODE = marketing | internal | live), fail-closed: an unknown or missing value in production serves the marketing page and never the internal app. Replaces the browser-exposed NEXT_PUBLIC_COMING_SOON flag.' },
      { type: 'security', text: 'A build- and boot-time guardrail hard-fails any Vercel Preview / Development deployment that is wired to the production database.' },
    ],
  },
  {
    version: '1.6.0',
    date: '2026-09-05',
    headline: 'Forced password change on first sign-in',
    changes: [
      { type: 'security', text: 'An account whose password was set by someone else — an A2R-operator-provisioned tenant admin who received a temp password — must now set their own on first sign-in. Until they do, every route redirects them to a Change Password screen; a self-registered user (who chose their own password) is never prompted.' },
      { type: 'security', text: 'New shared password policy for the change: at least 12 characters, an upper- and lowercase letter, and a number. The change screen also refuses re-using the current password.' },
      { type: 'improvement', text: 'Any signed-in user can now reach /change-password to change their password voluntarily.' },
    ],
  },
  {
    version: '1.5.2',
    date: '2026-09-05',
    headline: 'Coming-soon mode is an env toggle — one codebase, two front doors',
    changes: [
      { type: 'improvement', text: 'The site root is coming-soon by default. A deploy that should present the full app instead — an internal preview, for example — sets NEXT_PUBLIC_COMING_SOON to a falsy value, and `/` then forwards every visitor to sign-in. Production and preview run the identical build; only the environment differs.' },
    ],
  },
  {
    version: '1.5.1',
    date: '2026-09-05',
    headline: 'The landing page becomes a "Coming Soon" early-access page',
    changes: [
      { type: 'improvement', text: 'The site root is now a sleek dark "Coming Soon" page: the "Deliver Projects with Absolute Clarity. Zero Chaos." headline, a "Sneak Peek" modal that previews the platform, and an early-access form capturing full name, organization, work email and phone. A signed-in visitor is still sent straight into the app.' },
      { type: 'improvement', text: 'Lead submissions are validated (Zod), protected by a honeypot field and a per-IP rate limit, and — like the in-app support form — emitted as one structured log line for a real deployment to forward to a CRM. Until that forwarding is wired, a lead lives only in the server log.' },
    ],
  },
  {
    version: '1.5.0',
    date: '2026-09-05',
    headline: 'A public landing page — and the app moves off the bare root',
    changes: [
      { type: 'feature', text: 'A2R Ventures now has a public marketing landing page at the site root, readable with no account: a hero, the delivery problems PS-DOS solves (scattered spreadsheets, invisible risks, status-report fatigue), the three capabilities that answer them, and a "Launch App" button. A signed-in visitor is forwarded straight into their workspace.' },
      { type: 'improvement', text: 'The authenticated Portfolio Control Tower moved from "/" to "/portfolio". Every post-sign-in landing, the perspective switcher, "back to workspace" links, and the Auto Demo tour follow the new path; the sidebar and ⌘K are unchanged. Existing bookmarks to "/" now land on the marketing page, which forwards a signed-in user onward.' },
    ],
  },
  {
    version: '1.4.1',
    date: '2026-09-05',
    headline: 'Production hardening — database Row Level Security, serverless connection pooling, and restored security headers',
    changes: [
      { type: 'security', text: 'Row Level Security is now enabled on every database table, with all privileges revoked from the managed provider’s web-exposed roles — the database can no longer be read or written around the application, only through it. The application connects as a role that owns the tables and bypasses RLS, so nothing in the product is affected.' },
      { type: 'security', text: 'Restored the baseline HTTP security headers (X-Frame-Options: DENY, CSP frame-ancestors ‘none’, nosniff, Referrer-Policy, Permissions-Policy) on every response — they had been dropped by an unrelated build-config edit. Verified live on the deployment.' },
      { type: 'fix', text: 'The serverless deployment could not reach its database (the provider’s direct host is IPv6-only; serverless functions have no IPv6). Runtime queries now go through the connection pooler, and schema migrations use a dedicated direct URL.' },
      { type: 'fix', text: 'Restored the build version stamp shown in the Ops Console (it had been reading “0.0.0-dev”) along with React strict mode and the server-action body-size limit.' },
    ],
  },
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
    headline: 'PS-DOS rebrand, the Gunmetal Ascent Vector logo, an RBAC Master Matrix, and the Self-Service Batch Import Engine',
    changes: [
      { type: 'feature', text: 'Self-Service Batch Import Engine — a drag-and-drop portal (Admin & Org Setup → Data Ingestion & Templates → Batch Import) for weekly, tenant-wide CSV or Excel uploads of Actuals or Milestone & Progress updates spanning any number of engagements in one file. Every row is validated against your live projects and roster and staged for review — valid and invalid rows alike, so nothing is lost to a bad upload.' },
      { type: 'feature', text: 'Quarantine & inline correction — malformed rows are isolated with a plain-English reason for every failure (missing primary keys, unmapped project references, unrecognizable dates); fix a row directly in the grid and re-validate it live, with no re-upload required.' },
      { type: 'feature', text: 'Hard-stop batch commit — Re-validate & Commit stays disabled while any row still errors, and the server re-checks every row one more time immediately before writing anything. A batch can never partially land: it is all-or-nothing in one transaction, logged to both the Audit Trail and the hash-chained Compliance Ledger.' },
      { type: 'feature', text: 'Centralized RBAC Master Matrix — a single permission matrix maps five personas to allowed sidebar groups, per-engagement module pills, and routes. Unauthorized items are omitted from rendering entirely, not just disabled, and an edge middleware guard independently blocks a direct navigation to a disallowed route.' },
      { type: 'improvement', text: 'Header cleanup — the RBAC persona preview and its redundant second role picker moved out of the main tenant header into a dedicated "Persona Preview" control inside the A2R Ops Console, restoring a clean, uncluttered executive header.' },
      { type: 'improvement', text: 'Application renamed — the "A2R Ventures Demo" flagship demo workspace is now "PS-DOS Demo" across the UI, seed data, and documentation.' },
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
