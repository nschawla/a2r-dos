# Changelog

All notable changes to A2R Delivery OS™ are recorded here. This file
mirrors `src/lib/changelog.ts`, which powers the in-app **Release Notes**
viewer in the Ops Console — that is the authoritative source; keep the two
in sync when cutting a release.

The format follows [Keep a Changelog](https://keepachangelog.com/) and this
project adheres to [Semantic Versioning](https://semver.org/).

---

## [1.9.0] — 2026-09-06

_Enterprise environment separation & live database security — Phase C of the
enterprise production-readiness track (P0-2 enforcement)._

### Added

- **Dedicated staging database.** A separate Supabase project
  (`urdlkmlhjhvoxsphvwte`, `us-east-2`) provisioned from `prisma db push` +
  `prisma/seed.ts`, so schema and security migrations are rehearsed off the
  shared production project. `.env` on staging carries `RLS_ENFORCE=1` and
  `SESSION_LOOKUP_TIMEOUT_MS=8000` (remote pooler + RLS round-trip headroom).
- **`src/lib/db/with-tenant-tx.ts`** — `withTenantTx(fn)` /
  `withTenantTxFor(orgId, fn)`. Every former `db.$transaction(fn)` that
  touches a tenant model (~20 call sites in `src/server/actions/**`,
  `src/server/services/**`, the ingest route, `src/lib/audit-ledger.ts`) now
  routes through it.

### Changed

- **RLS is enforced on staging.** With `RLS_ENFORCE=1`, every tenant-scoped
  transaction runs `SET LOCAL ROLE a2r_app` + `SET LOCAL app.current_org`
  (`src/lib/db/rls-transaction.ts` + `with-tenant-tx.ts`); `a2r_app` is
  `NOBYPASSRLS`, so the migration-17 policies apply. A bare `db.model.op()`
  in a tenant request is wrapped per-op by the extension. Cross-tenant /
  pre-session flows (ops console, provisioning, SSO JIT, retention sweep)
  run as `postgres` (BYPASSRLS). **`RLS_ENFORCE` is unset on production**, so
  the wrapper and extension are byte-for-byte no-ops there.
- **Migration `00000000000016`** — `CREATE ROLE a2r_app` (NOSUPERUSER,
  NOBYPASSRLS, NOCREATEDB, NOCREATEROLE) + `SELECT/INSERT/UPDATE/DELETE` on
  all tables + default privileges + `GRANT a2r_app TO postgres` (so
  `postgres` can `SET ROLE` to it in-band — the pooler does not accept a
  custom-role login). **Applied to staging only.**
- **Migration `00000000000017`** — `tenant_isolation` (`organizationId =
  current_setting('app.current_org', true)`) on the 28 org-owned tables and
  `rls_app_plumbing` (`USING (true)`) on the 9 identity / tenant-routing
  tables, all `TO "a2r_app"`. `FORCE ROW LEVEL SECURITY` left commented.
  **Applied to staging only.**
- `withTenantTx` raises the interactive-transaction ceiling to 8s maxWait /
  20s timeout (the two extra `SET LOCAL` round trips + heavy flows like
  tenant provisioning's `seedOrganizationDefaults`).
- `scripts/rls-smoke.ts` + `tests/security/rls-policies.test.ts` reworked to
  the `SET LOCAL ROLE` model over the ordinary `DATABASE_URL` connection
  (no separate `RLS_APP_DATABASE_URL`); both auto-detect the `a2r_app` role
  and run on staging / skip on production.

### Security

- The database itself now rejects a cross-tenant read or write on staging —
  `npm run db:rls:smoke` proves all 28 tenant tables enforce isolation for
  `a2r_app` (scoped counts match ground truth; empty GUC → 0 rows;
  cross-tenant INSERT → `42501`; cross-tenant UPDATE → 0 rows).
- Application queries no longer depend on the BYPASSRLS `postgres` role once
  enforcement is on — they run as the least-privilege `a2r_app`.

### Verification

- Against **staging with `RLS_ENFORCE=1`** and the `a2r_app` role:
  `npx tsc --noEmit` → 0 · `npm run lint` → 0/0 ·
  `npx vitest run` → **542 passed** (45 files, 0 skipped — the RLS suite now
  runs) · `npx playwright test` → **60 passed** (Suites A–P) ·
  `npm run build` → clean · `npm run db:rls:smoke` → OK (28 tables).

## [1.8.0] — 2026-09-06

_Tenant-isolation & security hardening — Phase B of the enterprise
production-readiness track (P0-3, P0-5, P0-6; P0-2 groundwork)._

### Added

- **Composite tenant foreign keys (P0-3).** Migration
  `00000000000014_composite_fk_tenant_guard` adds a composite
  `UNIQUE ("organizationId", "id")` to `projects` / `data_import_batches`
  and replaces the single-column parent FK on all 11 project- / batch-scoped
  child tables (`scope_items`, `effort_cells`, `audit_entries`,
  `raid_entries`, `financial_actuals`, `schedule_phases`,
  `steerco_decisions`, `project_contributors`, `weekly_assignment_slots`,
  `timesheet_entries`, `data_import_rows`) with a **composite** FK
  `("organizationId", <parentId>)` → `parent("organizationId", "id")`.
  Postgres now rejects any child row whose tenant disagrees with its
  parent's. Schema models this as a composite `@relation`; a pre-flight
  block aborts the migration if any existing row would violate it (none do).
- **Distributed rate limiting (P0-6).** `src/lib/rate-limiter-redis.ts` —
  when `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are set, every
  boundary that goes through `rateLimitGuard` / `rateLimitByUser` /
  `rateLimitByIp` enforces **one atomic sliding window** in Redis (single
  server-side Lua script) consistent across all instances. Unset → the
  in-process limiter, unchanged. A per-call Redis failure falls back to the
  in-process limiter. Added `@upstash/redis`.
- **RLS groundwork (P0-2), dormant.** `src/lib/db/rls-transaction.ts` (the
  `SET LOCAL app.current_org` bridge, no-op unless `RLS_ENFORCE=1`),
  migrations `16_rls_restricted_role` + `17_rls_tenant_policies` (**not
  applied**), `scripts/rls-smoke.ts` (`npm run db:rls:smoke`) +
  `tests/security/rls-policies.test.ts` (direct-SQL enforcement checks,
  skipped without `RLS_APP_DATABASE_URL`), and
  `docs/RLS_ENFORCEMENT_RUNBOOK.md`.

### Changed

- **Bearer tokens are hashed at rest (P0-5).** `staff_elevations.token` and
  `impersonation_grants.token` become `tokenHash` (migration
  `00000000000015_hashed_bearer_tokens`). The cookie carries a 256-bit
  secret via the new `src/lib/crypto/bearer-token.ts`
  (`mintToken` / `hashToken`, constant-time compare); the DB stores only
  `sha256(secret)` and resolves sessions by hash — mirrors the existing
  `ApiKey.hashedKey`. **No backfill:** in-flight elevation / impersonation
  cookies stop resolving on deploy (windows are ≤ 60 min; operators
  re-elevate once).
- `rateLimitGuard` / `rateLimitByUser` are now `async` (they may do a
  Redis round trip); ~20 call sites updated.

### Security

- Cross-tenant child-row creation is now blocked by a database constraint,
  not only by the app tier + ORM extension — true defence in depth for the
  formerly join-scoped models.
- A database read or leaked backup no longer yields a usable elevation /
  impersonation bearer token.
- Rate limits can be enforced globally rather than per-instance.

### Verification

- `npx tsc --noEmit` → 0 errors. `npm run lint` → **0 / 0**.
- Migration rehearsal (`BEGIN; \i 14; \i 15; ROLLBACK;`) → clean against
  live data; pre-flight consistency counts all 0. Migrations 14 + 15
  **applied**; `prisma migrate diff` → no drift.
- `npx vitest run` → **539 passed, 3 skipped** (dormant RLS suite) across
  45 files. `npx playwright test` → **60 passed** (Suites A–P).
- `npm run build` → clean on Next 15.5.25.
  `npm run db:rls:smoke` → runs, reports dormant, exits 0.

## [1.7.1] — 2026-09-06

_Framework upgrade — Next.js 15 (LTS) and a clean lint sweep._

### Changed

- **Next.js `14.2.35` → `15.5.25`** (the `backport` / security-maintained LTS
  line), **`next-auth` → `4.24.15`**, **`eslint-config-next` → `15.5.25`**.
  React stays on `18.3` (Next 15 peer-supports it). Clears the Next.js
  advisories affecting the 14.2 line; `npm audit` no longer flags `next`
  or `react`.
- **Async request APIs.** Every `cookies()` / `headers()` call and every
  dynamic-route `params` / `searchParams` prop is now awaited, as Next 15
  requires. ~25 files across pages, route handlers, and server actions.
  `next.config.mjs` drops the removed `experimental.instrumentationHook`.
- **`postcss` forced to `^8.5.6`** via a package override — Next 15 bundled
  an 8.4.31 with the source-map path-traversal advisories.

### Fixed

- **The org-scope `AsyncLocalStorage` cell is now a `globalThis` singleton**
  (`src/lib/db/org-scope.ts`). Next's dev module graph could evaluate the
  module twice, so `runUnscoped()` wrote one instance while the Prisma
  extension read another — a legitimately cross-tenant pre-session query
  (the NextAuth `signIn` callback's `isSsoEnforcedForEmail`) then saw no
  scope and threw. Pinning the cell on `globalThis` removes it.
- **Linter clean sweep — `npm run lint` reports 0 errors, 0 warnings.**
  Escaped three text apostrophes (`react/no-unescaped-entities`), added
  `**/*.d.ts` / `**/*.d.mts` to `ignorePatterns` (ESLint's parser can't read
  TS declaration syntax), and registered the `@typescript-eslint` plugin so
  the inline rule directives in `src/lib/db.ts` resolve.

### Verification

- `npx tsc --noEmit` → 0 errors. `npm run lint` → **0 errors, 0 warnings**.
  `npx vitest run` → **536 passed** (43 files). `npx playwright test` →
  **60 passed** (Suites A–P). `npm run build` → compiled cleanly on
  Next 15.5.25.

## [1.7.0] — 2026-09-06

_Security architecture hardening — tenant isolation, session integrity, JIT operator elevation, and production observability._

Nine focused changes from a Principal-Architect audit of the v1.6.0 release,
plus a production-readiness observability pass.

### Security

- **ORM-level tenant auto-scoping.** A Prisma client extension
  (`src/lib/db/org-scope.ts`, `src/lib/db.ts`) rewrites every query on a
  tenant-owned model to include the request's `organizationId` and **throws**
  if a tenant query runs with no resolved scope — a backstop under the
  hand-written `where` clauses. Fed by an `AsyncLocalStorage` cell + a lazy
  session/cookie resolver. `docs/RLS_ROADMAP.md` covers the DB-level follow-up.
- **Composite tenant keys** (migration `00000000000012`). `audit_entries`,
  `effort_cells`, `financial_actuals`, `project_contributors`, `raid_entries`,
  `schedule_phases`, `scope_items`, `steerco_decisions`, `data_import_rows`
  each gained an `organizationId` column + FK + index (backfilled from the
  parent). Every tenant table now ties its rows to a tenant at the database.
- **Explicit A2R-staff grants (P0 #2).** The `@a2rventures.com` email wildcard
  and the `User.isA2rStaff` boolean are removed (migration
  `00000000000009`). Staff access is one attributed, revocable `staff_grants`
  row. Manage at `/ops/staff` or `npm run staff:grant|revoke|list`.
- **Deep forced-password-rotation enforcement (P0 #3).** `mustChangePassword`
  is now rejected with `403 PASSWORD_CHANGE_REQUIRED` in **every**
  server-action / route-handler auth path, not only the middleware redirect.
  `changePasswordAction` atomically bumps `users.sessionVersion` →
  every other device is logged out on its next request (migration
  `00000000000011`).
- **Restricted-session state machine (P1).** `src/lib/auth/session-state.ts`
  — `ACTIVE | PENDING_PASSWORD_CHANGE | REVOKED`, re-derived from the
  database on every authenticated request. Any lookup error / timeout →
  `REVOKED` (**fail-closed**). `docs/SESSION_STATE_MACHINE.md`.
- **Just-In-Time (JIT) staff elevation (P1).** A standing `staff_grants` row
  is now eligibility only; every mutating `/ops` operation requires a live,
  reason-logged, auto-expiring `staff_elevations` grant (migration
  `00000000000013`, TTL 30 min default / 60 max). `docs/JIT_STAFF_ELEVATION.md`.
- **Preview / production data-isolation guardrail (P0 #4).** The build, the
  server boot, and the Prisma client all hard-fail a Vercel Preview /
  Development deployment wired to the production database.
  `docs/PREVIEW_ENVIRONMENT_ISOLATION.md`.
- **Advanced rate limiting (P2).** Named sliding-window rules
  (`src/lib/rate-limits.ts`, `RL_*_LIMIT` overrides) on sign-in,
  registration, password change, the AI parser, bulk exports, print-doc
  generation, batch ingestion, and workspace snapshots. `X-RateLimit-*`
  headers on the allowed 200, not only the 429. `docs/OBSERVABILITY.md`.

### Added

- **A named, server-only Data Access Layer** (`src/lib/dal/`). `src/app/**`
  and `src/components/**` may no longer import `@/lib/db` — enforced by an
  ESLint `no-restricted-imports` rule **and** `tests/dal-boundary.test.ts`.
  Reads go through `src/server/queries/**`, writes through
  `src/server/actions/**`. `docs/DATA_ACCESS_LAYER.md`.
- **Server-only site routing** — `A2R_SITE_MODE` (`marketing | internal |
  live`), a strict fail-closed enum. An unknown / missing value in
  production serves the marketing page, never the internal app. Replaces the
  browser-exposed `NEXT_PUBLIC_COMING_SOON`. `docs/SITE_ROUTING_MODEL.md`.

### Changed

- **Centralized server-side error boundary** — `withAction()` wraps every
  `{ ok }`-returning mutation action, `withRouteHandler()` wraps the
  download / report routes. An unhandled throw becomes one structured,
  secret-redacted `captureException` line + a safe generic error, never an
  opaque 500. Next.js control-flow (`redirect` / `notFound` / static
  bailout) still propagates.

### Verification

- `npx tsc --noEmit` → 0 errors. `npx vitest run` → **536 passed** across
  43 files. `npx playwright test` → **60 passed** (Suites A–P). `npm run
  build` → compiled cleanly.

## [1.6.0] — 2026-09-05

_Forced password change on first sign-in._

### Added
- **`User.mustChangePassword`** (`prisma/migrations/00000000000008_must_change_password/`). Set `true` for an account whose password was assigned by someone else — an A2R-operator-provisioned tenant admin (`provisionTenantAction`) who received a temp password. Rides on the JWT (refreshed from the DB every request by the `jwt` callback) and is enforced in `src/middleware.ts`: while it is set, **every route redirects to `/change-password`**, ahead of the `/ops` and RBAC checks. A self-registered user is never flagged; seeded demo accounts are left at the default `false` (the shared password is the point of the demo).
- **`/change-password`** (`src/app/(auth)/change-password/page.tsx`, `changePasswordAction`) — used both for the forced first-sign-in change and a voluntary change by any signed-in user. Verifies the current password, enforces the new shared policy, refuses re-use of the current password, then signs the user out for a clean re-login.
- **`src/lib/auth/password-policy.ts`** — one pure `validatePasswordStrength` (≥12 chars, upper + lower + digit, no edge whitespace), shared by the action and the form's live feedback. `tests/password-policy.test.ts` (8).

### Changed
- The seed's `navinder@a2rventures.com` master account no longer has its `passwordHash` reset on re-seed (only on a first-ever `create`), so a password rotated in a live deployment survives `npm run db:seed`. A dedicated `master.e2e@a2rventures.com` account (isA2rStaff + OWNER/ADMIN in every org, shared demo password) now backs the enterprise-verification suite's Suite A / I, so those tests never depend on a human's real credential.

### Verification
- `npx tsc --noEmit` → 0 errors. `npx vitest run` → **396 passed** across 30 files. `npx playwright test` → **47 passed**. Live: an armed demo account is redirected to `/change-password` on sign-in, can't reach `/portfolio`, and lands normally after setting a policy-compliant new password.

## [1.5.2] — 2026-09-05

_Coming-soon mode is an env toggle — one codebase, two front doors._

### Changed
- **`NEXT_PUBLIC_COMING_SOON` gates the site root.** ON by default (a missing env var must not accidentally expose the app's front door): `/` serves the public early-access page. A deploy sets it to a falsy value (`0` / `false` / `off` / `no`) — e.g. an internal preview deployment — and `/` forwards every visitor to `/launch` (sign-in) instead. `src/app/page.tsx`, `.env.example`. Production (`main`) and the preview branch run the byte-identical build; only the Vercel environment differs. A signed-in visitor is always sent to `/launch` regardless of mode.

### Verification
- `npx tsc --noEmit` → 0 errors. `npx vitest run` → **388 passed**. `npx playwright test` → **47 passed**. Live: with the flag unset, `/` renders the dark coming-soon page; with `NEXT_PUBLIC_COMING_SOON=0`, `/` 307s to `/login`.

## [1.5.1] — 2026-09-05

_The landing page becomes a "Coming Soon" early-access page._

### Changed
- **Site root is now a dark "Coming Soon" page** (`src/app/page.tsx`, moved out of the `(public)` group to the root layout so it owns its own theme): the "Deliver Projects with Absolute Clarity. Zero Chaos." headline, a **Sneak Peek** modal that previews the platform (`src/components/marketing/SneakPeekModal.tsx`), and a lead-capture form for **full name, organization, work email, phone** (`EarlyAccessForm.tsx`). A signed-in visitor is still redirected to `/launch`. `/terms` and `/privacy` keep the light `(public)` shell.
- The `(public)` layout no longer carries a "Launch App" button (it now only frames the legal pages).

### Added
- `submitEarlyAccessLead` (`src/server/actions/early-access.ts`) — public, unauthenticated. Zod-validated, honeypot-guarded, rate-limited to 5 / 10 min per IP. Mirrors the support-ticket action: emits one structured `[EARLY_ACCESS_LEAD]` log line for a deployment's pipeline to forward to a CRM. **No persistence yet — a submitted lead lives only in the server log until that forwarding is wired.**

### Fixed
- Pre-existing `react/no-unescaped-entities` lint error in `OnboardingJourneyWizard.tsx`.

### Verification
- `npx tsc --noEmit` → 0 errors. `npx vitest run` → **388 passed**. `npx playwright test` → **47 passed**. Live: `/` renders the dark page (200) / forwards a signed-in visitor to `/portfolio`; Sneak Peek modal opens (portaled past the `backdrop-blur` header), closes on Escape / backdrop; the form submits and logs a `WAIT-…` reference.

## [1.5.0] — 2026-09-05

_A public landing page — and the app moves off the bare root._

### Added
- **Public marketing landing page at `/`.** Readable with no account (the middleware auth gate now excludes the bare root — `src/app/(public)/page.tsx`, on the existing lightweight public shell). Hero headline "Deliver Projects with Absolute Clarity. Zero Chaos.", the three problems A2R DOS addresses (scattered spreadsheets, invisible project risks, status-report fatigue), the three capabilities that answer them (AI document parsing, real-time engagement visibility, centralized governed workflows), a clean header/footer, and a **Launch App** button → `/launch`. A signed-in visitor to `/` is redirected to `/launch` (the role-aware dispatcher) rather than shown marketing.

### Changed
- **The Portfolio Control Tower moved from `/` to `/portfolio`.** The `control-tower` route in `GOVERNABLE_MODULES`, the Delivery lens landing, `middleware.ts` fallback redirects, `requireOpsContext`'s non-staff bounce, the onboarding "enter workspace" links, the `/admin` "← Client Workspace" link, and the Auto Demo `welcome`/`closing` beats all follow the new path. The Sidebar and ⌘K entries are unchanged (they already resolve through the same route registry). `findOwningModule` no longer special-cases `/`.
- `/terms` and `/privacy` now wrap their own reading-width container (the public layout no longer imposes one, since the landing page is full-bleed).

### Verification
- `npx tsc --noEmit` → 0 errors. `npx vitest run` → **388 passed** across 29 files. `npx playwright test` → **47 passed** (Suites A–K; sign-in helpers and Control Tower navigation updated to `/portfolio`). Live: `/` renders publicly (200), `/portfolio` gates to `/login?callbackUrl=%2Fportfolio` (307), a signed-in visit to `/` forwards to `/portfolio`.

## [1.4.1] — 2026-09-05

_Production hardening — database Row Level Security, serverless connection pooling, and restored security headers._

### Security
- **Row Level Security on every table.** `ALTER TABLE … ENABLE ROW LEVEL SECURITY` (not `FORCE`) is now applied to all 35 `public` tables with **no policies** — deny-all for every role except the Prisma-owned role, which owns the tables and carries `BYPASSRLS`. All table / sequence / function privileges are revoked from the managed provider's web-exposed `anon` / `authenticated` roles, and the schema default privileges are altered so a future schema push does not re-grant them. The app uses no Supabase client (`@supabase/*` is not a dependency), so nothing in the product is affected — verified with full Prisma read + write after apply. See `prisma/migrations/00000000000007_rls_lockdown/migration.sql` and `docs/SECURITY.md` § "Database-level access control".
- **Restored baseline HTTP security headers** (`X-Frame-Options: DENY`, CSP `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`) on every response — an unrelated `next.config.mjs` edit had removed them. Confirmed live via response inspection.

### Fixed
- **Serverless database connectivity.** The Vercel deployment could not reach Postgres — the provider's direct host (`db.<ref>.supabase.co`) is IPv6-only and Vercel functions have no IPv6 egress, so every query failed. `DATABASE_URL` now points at the IPv4 connection pooler; `datasource.directUrl` (a new `DIRECT_URL`) carries the direct session that `prisma db push` / `migrate` require. `.env.example` documents both.
- **Ops Console build stamp** was reading `0.0.0-dev`; restored the `NEXT_PUBLIC_APP_VERSION` / `_BUILD_SHA` / `_BUILD_TIME` injection in `next.config.mjs`, along with `reactStrictMode` and the 2 MB server-action body limit that the same edit had dropped.

### Verification
- `npx tsc --noEmit` → 0 errors. `npx vitest run` → **387 passed** across 29 files (incl. the live-DB `tests/security/*` suites). `npx playwright test` → **47 passed**. Production `/api/health/ready` → `{"database":"ok"}`; security headers confirmed on live responses.

## [1.4.0] — 2026-09-05

_Role-Based Scoped Filtering, the Custom KPI Definition Engine, and the complete 4-pillar Batch Import Engine._

### Added
- **Role-Based Scoped Filtering** — a new, distinct enforcement axis from the RBAC Master Matrix's navigation gating: which project/resource *rows* a role's own queries return. VPs, PMO Heads, and PS Ops leads (`VP_EXECUTIVE`, `ADMIN`) keep a global, tenant-wide view; Practice Directors are automatically scoped to their own `practiceId`'s projects and roster, Delivery Managers to their direct reports, and Project Managers to their own assignments — enforced on the Control Tower, the Resource & Capacity Cockpit, and every Financial Realization / RAID Cockpit / Commercial Baseline / Control Audit / Schedule & Milestones project picker.
- **Custom KPI Definition Engine** (`Admin & Org Setup → Custom KPIs`, `/admin/kpis`) — an Admin binds a curated metric (never an arbitrary formula) from one of four data sources — Financial Realization, Schedule & Milestones, RAID Cockpit, Resource & Capacity — to a target/warning threshold and a set of target personas. The resulting card renders live on the Control Tower and the Executive Hub for exactly those personas, with no redeploy.
- **Forecast & EAC Updates** — a third Batch Import pillar. Ingests forward-looking cost-to-complete and revised Estimate-at-Completion hours by rate-card role, upserting directly into `FinancialActual`. Matrix-mode engagements only; a Direct Intake project's rows quarantine with a clear pointer back to that project's own Financial Realization import.
- **Status Reports & RAID Log** — a fourth Batch Import pillar. Ingests a weekly narrative status highlight, a new RAID item, or both, per engagement — narrative rows become Activity Log entries, RAID rows become RAID Cockpit entries — sharing the same stage / correct / commit pipeline as the other three pillars.
- Two new starter templates in the Data Ingestion & Templates hub (`forecast-eac-batch`, `status-raid-batch`).

### Changed
- The Auto Demo cinematic tour gained a dedicated role-aware-scoping beat (a VP's global view vs. a Practice Director's scoped view, on the same screen) and an expanded Custom KPI Builder beat that narrates the card appearing on both the Control Tower and the Executive Hub; `docs/AUTO_DEMO_SCRIPT.md` stays synced.

### Verification
- `npx tsc --noEmit` → 0 errors. `npx vitest run` → **387 passed** across 29 files. `npx playwright test` → **47 passed** across Suites A–K.

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
