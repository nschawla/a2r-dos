# Changelog

All notable changes to A2R Delivery OS™ are recorded here. This file
mirrors `src/lib/changelog.ts`, which powers the in-app **Release Notes**
viewer in the Ops Console — that is the authoritative source; keep the two
in sync when cutting a release.

The format follows [Keep a Changelog](https://keepachangelog.com/) and this
project adheres to [Semantic Versioning](https://semver.org/).

---

## [1.3.0] — 2026-09-04

_A2R DOS rebrand, the Gunmetal Ascent Vector logo, an RBAC Master Matrix, and the Self-Service Batch Import Engine._

### Added
- **Self-Service Batch Import Engine** — a drag-and-drop portal (**Admin & Org Setup → Data Ingestion & Templates → Batch Import**) for weekly, tenant-wide CSV or Excel uploads of **Actuals** or **Milestone & Progress** updates spanning any number of engagements in one file — distinct from the existing per-project CSV import. Every row is validated against the tenant's live projects and roster and staged for review, valid and invalid rows alike.
- **Quarantine & inline correction** — malformed rows are isolated with a plain-English reason for every failure (missing primary keys, unmapped project references, unrecognizable dates); an inline grid lets a user fix a row and re-validate it live, with no re-upload.
- **Hard-stop commit safeguard** — **Re-validate & Commit** stays disabled while any row still errors, and the server authoritatively re-checks every row again immediately before writing anything. Commit is all-or-nothing in one transaction; a successful commit is logged to the Audit Trail and hash-chained into the Compliance Ledger (`BATCH_IMPORT_COMMITTED`).
- **RBAC Master Matrix** — a single permission matrix (`src/lib/governance/rbacMatrix.ts`) maps five personas, mapped 1:1 onto the real delivery role, to allowed sidebar groups, per-engagement module pills, and routes. Unauthorized items are **omitted from rendering**, not merely disabled, and an edge middleware guard independently blocks a direct navigation to a disallowed route.
- **`docs/ERD.md`** — a new Entity Relationship Diagram covering the platform's core schema, including the new batch-import models.

### Changed
- **Header cleanup** — the RBAC persona preview and its redundant second role picker moved out of the main tenant header into a dedicated **Persona Preview** control inside the A2R Ops Console.
- **Application renamed** — the flagship demo workspace "A2R Ventures Demo" is now **"A2R DOS Demo"** across the UI, seed data, and documentation.
- **"Concept B: Ascent Vector" logo** — the integrated brand mark is now a single geometric glyph (a solid triangle with a nested triangular counter forming the letter "A"), rendered in a fixed solid **Gunmetal Gray (`#545A61`)** on its own `logo` design token, independent of the `brand` interactive-accent blue used by buttons and links. Crisp from 18px in the Sidebar to 40px on the sign-in screen.
- Navigation pills no longer show trailing item-count badges (e.g. `Engagements 6` → `Engagements`), and **Methodology Reference** was removed from the sidebar's Reporting group — it lives solely under Control Audit now.

### Verification
- `npx tsc --noEmit` → 0 errors. `npx vitest run` → **303 passed** across 25 files. `npx playwright test` → **40 passed** across Suites A–J.

## [1.2.2] — 2026-09-03

_Executive Clarity — a crisp light theme, the integrated A2R logo, and universal sub-navigation._

### Changed
- **"Executive Clarity" visual redesign** — the workspace moves from a dark charcoal theme to a crisp, high-contrast **light theme** built for an executive audience (ages 30–50+) and print/PDF export: a soft off-white page canvas (`#F6F7F9`), white surfaces, deep zinc text (`#18181B` / `#3F3F46`), and a subtle card shadow for separation — never dark-on-dark. Body and table text across the dense modules (Portfolio, Financials, Roster) meets **WCAG AAA** contrast.
- **New integrated A2R logo mark** — the sharp `A2R` wordform with a solid underline rule, in one solid corporate blue (`#0B5FD1`, no gradients), rendered as live text so it is resolution-independent and exports to PDF crisply.
- **Universal sub-navigation pills** — Admin & Org Setup, the Control Tower and the Executive Hub now switch between focused single-screen views instead of one long scroll (Roster / Governance / Data & Compliance; Portfolio / Engagements / Activity; Portfolio Briefing / Engagement Reports). Every per-engagement module route carries a `Baseline · Financials · Schedule · RAID · Control Audit` pill row in its header.
- **Identity Federation moved to the Ops Console** (`/ops/identity`) — it is platform infrastructure an A2R operator configures per tenant, no longer a self-serve panel in tenant Admin & Org Setup.
- The status-report and audit-certificate PDF exports are now **light, ink-on-white** documents.

### Added
- **QA & UAT test-automation framework** — `tests/enterprise-flows.test.ts` (28 scenario tests over the landing / perspective / governance / masking / SSO engines), Playwright **Suite J** (`e2e/enterprise-governance-identity.spec.ts`, 10 tests, self-cleaning), and a full human-executable runbook at **`docs/UAT_TEST_RUNBOOK.md`** with test data, step-by-step instructions and pass/fail checkpoints for every module.

### Fixed
- `<ModuleTabs>` panels not switching — a Tailwind Preflight `[hidden]` rule with zero specificity was overridden by the panel's own `flex` utility; the HTML `hidden` attribute is now authoritative.

## [1.2.0] — 2026-09-03

_Enterprise Governance & Identity — compliance templates, financial masking, and SSO / SAML / OIDC federation._

### Added
- **Enterprise Governance Framework** — a Hybrid Configuration Model in **Admin & Org Setup**. _Layer 1_ is a pre-tested **compliance template**: Standard Delivery, Strict Financial Governance, Agile Delivery, or Board-Only. _Layer 2_ is the tenant's own overrides — which modules appear in navigation (**route visibility**) and whether margins / EAC are scrubbed for delivery roles below VP (**financial data masking**). The stored template resolves to `CUSTOM` once the settings diverge.
- **Enterprise SSO / Identity Federation** — one SAML 2.0 or OIDC identity provider per workspace, with setup presets for **Microsoft Entra ID (Azure AD)**, **Okta**, and **Google Workspace**. Admins paste the IdP metadata (SAML `EntityDescriptor` XML) or an OIDC discovery URL and **verify** it; endpoints and the signing-certificate fingerprint are extracted and pinned.
- **Just-in-time provisioning & security-group → role mapping** — on a federated login the assertion's group / role claims resolve a delivery + console role from the tenant's mapping table (case-insensitive, lowest priority wins), and a `Membership` is created (or an SSO-provisioned one re-synced) in one transaction. Admin-assigned (`MANUAL`) memberships are never re-roled by JIT.
- **Role-based landing & perspective switcher** — a `WorkspaceLens` (Executive / Delivery / Finance / Operations) drops multi-role users on their tailored landing page after sign-in and can be re-pointed from a header switcher. Every module stays reachable from the sidebar and ⌘K.
- User Manual expanded (`docs/USER_MANUAL.md`) with governance-template, financial-masking, perspective-switcher and identity-federation guidance.

### Security
- **SSO enforcement** — when federation is enforced for an email domain, password sign-in for that domain is refused at the authentication callback.
- **OIDC client secrets are AES-256-GCM encrypted at rest** (key derived from `NEXTAUTH_SECRET`); only a non-reversible fingerprint is shown in the Admin panel.
- Every governance and identity-federation change is hash-chained in the Compliance Ledger — new `LedgerActionType`s `GOVERNANCE_CONFIG_CHANGE`, `SSO_CONFIG_CHANGE`, `SSO_JIT_PROVISION`.

### Improved
- Financial data masking is now org-configurable — the Strict Financial Governance and Agile Delivery templates push blended margin, EAC and cost variance out of reach for Practice Director and below, on top of the standard role-based tiers.
- **Sidebar refinement** — minimalist inline icons on every module; child items indented under their section headings.
- **Softer premium charcoal theme** — the pitch-black canvas moves to a cool `#12141C` charcoal ramp while keeping the high-contrast hairline borders and the single blue accent.

## [1.1.0] — 2026-09-03

_The single-pane command layer — obsidian design system, Command Center, universal ⌘K, and the SteerCo Briefing._

### Added
- **Single-Pane Command Center** (`/command`) — a Pulse strip of portfolio vitals, a terminal-style Command Bar for natural-language navigation (`financials for Contoso`), and one chronological **Active Stream** that merges activity, governance, and open escalated risk.
- **Universal ⌘K / Ctrl+K command palette** — available on every screen including the operator console and sign-in, searching destinations, actions, engagements (with a health dot), people, and open escalated RAID in a single list, with full keyboard control and route prefetch.
- **SteerCo Briefing** (`/steerco`) — a lean, board-ready portfolio view (headline, Pulse, margin health, what-moved, watchlist) built from the same engines as the module pages, with a clean light-document print / PDF export.
- **Platform Pulse operator console** (`/ops/pulse`) — automatically ingested engineering telemetry for the platform itself: running build and commit, a live database probe with latency, last test-suite result, and an Engineering Stream of recent commits, test runs, and releases.
- API bulk-ingest now writes to the tenant Active Stream — each scheduled timesheet feed appears as an activity event with the record count, hours, and API key name.
- User Manual & Operator's Guide published (`docs/USER_MANUAL.md`).

### Improved
- **Obsidian design system** — a deep-obsidian ground, a single systemBlue (`#0A84FF`) interactive accent, flat shadow-free surfaces, status colors reserved for status only, a shared `Container` layout primitive, and a flat brand mark.
- **Apple-grade micro-interactions** — crisp 120ms transitions, a consistent blue focus ring on every interactive element, animated command surfaces, and a full `prefers-reduced-motion` opt-out.
- Sidebar navigation reordered to follow the delivery workflow — Commercial Baseline → Financial Realization → Schedule & Milestones → RAID Cockpit → Control Audit — and the Command Bar anchored to the top of the Command Center as its primary execution header.

## [1.0.0] — 2026-09-03

_GA readiness — security hardening, observability, and a unified design system._

### Security
- Sliding-window rate limiting on the sign-in route (10/min per IP) and the Data Ingestion API (60/min per key), returning `429` with `Retry-After`.
- Baseline HTTP security headers on every response — `X-Frame-Options: DENY`, CSP `frame-ancestors`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- Compliance ledger hardened against concurrent-append chain forks (per-tenant advisory lock + a unique chain-link constraint) and against accidental loss (organization foreign keys set to `RESTRICT`).
- Database connections now require TLS (`sslmode=require`), with a production startup check that warns on a misconfiguration.

### Added
- Data retention service — configurable windows for the activity feed, governance audit trail, ended impersonation grants, and revoked API keys, with a dry-run-by-default sweep runnable by script or a token-authed endpoint.
- Health and readiness probes (`/api/health`, `/api/health/ready`) for load balancers and deploy gating.
- Centralized error reporting with structured JSON logging and a drop-in Sentry integration point.
- Data Ingestion & Template Hub — standardized CSV templates and schema reference for the delivery roster, project baselines, and aggregated period actuals, in both the Ops Console and tenant Admin.
- Version Governance & Changelog — build stamp and Release Notes viewer.
- Enterprise Security & Trust overview published (`docs/SECURITY.md`).

### Improved
- App-wide error boundaries with branded recovery screens, plus a toast notification system wired into the key administrative actions.
- Route loading skeletons and branded not-found pages.
- Unified design system — a single brand token set, a shared brand mark, consolidated KPI cards, and a refreshed sign-in screen.
- Practice / department taxonomy modernized to five domain-led categories across seed data and fixtures.

## [0.9.0] — 2026-08-28

_Tenant sovereignty, data masking, and the automated ingestion bridge._

### Added
- Super-Admin Tenant & Data Sovereignty engine — Active / Suspended / Grace-Period lifecycle, a read-only time-boxed Impersonation Gateway (every session audited before it starts), a cryptographic data-export package, and a soft-delete Purge Protocol that issues a Certificate of Destruction.
- Secure Data Ingestion API Bridge — tenant-scoped API keys (issued from the Ops Console) and a bulk timesheet ingestion endpoint that rolls hours into the capacity and EAC engines.
- Role-based data masking — contractor cost rates and blended margins are tiered by delivery role, with a clear "restricted" indicator where a value is hidden.

### Security
- Immutable, hash-chained SOC 2 Compliance Ledger with a live integrity badge on the audit-log view.

## [0.8.0] — 2026-08-14

_Capacity planning, executive reporting, and governance depth._

### Added
- Resource & Capacity Cockpit — blended billable utilization, a concurrency-overload radar, and a 52-week staffing forecast measured against role utilization policies and the corporate holiday calendar.
- Executive Briefing Hub — a portfolio-level briefing with macro rollups, risk distribution, and print-to-PDF export.
- Capacity & concurrency schema foundation — EVM-style project rollups and a five-lens (cost / schedule / scope / quality / resource) health vector.

### Improved
- Executive navigation restructure into Portfolio / Engagement Governance / Reporting, and a cleanup of the Control Audit module to "Delivery Controls & Governance Standards".
- Automated end-to-end test suite (Playwright) and a requirements traceability matrix.

### Fixed
- Resolved the NextAuth "Unexpected end of JSON input" sign-in error and hardened the session refresh path.

[1.0.0]: https://github.com/a2rventures/a2r-dos-app/releases/tag/v1.0.0
[0.9.0]: https://github.com/a2rventures/a2r-dos-app/releases/tag/v0.9.0
[0.8.0]: https://github.com/a2rventures/a2r-dos-app/releases/tag/v0.8.0
