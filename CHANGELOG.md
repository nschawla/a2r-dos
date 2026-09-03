# Changelog

All notable changes to A2R Delivery OS™ are recorded here. This file
mirrors `src/lib/changelog.ts`, which powers the in-app **Release Notes**
viewer in the Ops Console — that is the authoritative source; keep the two
in sync when cutting a release.

The format follows [Keep a Changelog](https://keepachangelog.com/) and this
project adheres to [Semantic Versioning](https://semver.org/).

---

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
