# Functional Requirements Document — PS-DOS™

_Consolidated current-state, **v1.29.0**. Per-phase functional narratives
live in `README.md` (Phases 1–13); this document is the flattened,
deduplicated view of what the production system does today. Traceability to
code and tests: `docs/RTM.md`. Security posture: `docs/SECURITY.md` +
`docs/ROLE_ACCESS_MATRIX.md`. Forward plan (not yet shipped):
`docs/ROADMAP.md`._

---

## 1. Product scope

PS-DOS is a multi-tenant SaaS "Delivery Operating System" for
Professional-Services organizations: portfolio governance, engagement
delivery, financial realization (EAC / margin), capacity planning, and an
internal operator control plane for the vendor (A2R). Next.js 15 App Router
· Prisma 5.22 · PostgreSQL 17 (Supabase) · NextAuth v4 (JWT).

---

## 2. Authentication & session

| # | Requirement |
| --- | --- |
| FR-AUTH-1 | Credentials sign-in (email + password), bcrypt cost 10. Password policy ≥ 12 chars, upper + lower + digit, enforced at `/register` and `/change-password`. |
| FR-AUTH-2 | The sign-in password field has a show/hide toggle (eye / eye-off), `aria-label` + `aria-pressed`, toggling `type` password ↔ text (v1.16.0). |
| FR-AUTH-3 | **Restricted-session state machine** — every authenticated request re-derives session state from the DB (`users.sessionVersion` / `passwordChangedAt` / `mustChangePassword`). Any uncertainty (DB error, timeout, missing user, epoch mismatch) → `REVOKED` → user-less session. There is no fail-open path. |
| FR-AUTH-4 | A password change (`changePasswordAction`) atomically writes the new hash, clears `mustChangePassword`, stamps `passwordChangedAt`, and `sessionVersion += 1` — an all-device logout — then mints one fresh token for the acting device. |
| FR-AUTH-5 | A fresh credential login pins `token.sessionVersion` to the account's current epoch before the state check, so an account whose epoch was previously bumped can still sign in (fixed v1.15.1, `2db2ab7`). |
| FR-AUTH-6 | `SESSION_LOOKUP_TIMEOUT_MS` (prod: 8000) bounds the per-request session-state DB read; a timeout fails closed. |
| FR-AUTH-7 | SSO (SAML / OIDC) per tenant with metadata verification, JIT provisioning, and security-group → role mapping. Password login is refused for an SSO-enforced email domain. |
| FR-AUTH-8 | **Live SAML 2.0 handshake** (v1.19.0) — SP-initiated: `/api/auth/saml/login` builds a signed AuthnRequest and redirects to the tenant's IdP; `/api/auth/saml/acs` validates the returned SAMLResponse (XML signature against the tenant's stored certificate, Conditions window, Audience, InResponseTo replay check via a DB-backed cache, explicit Issuer cross-check) and hands the verified identity to the existing JIT provisioning seam (`applyFederatedLogin`), then mints a normal session. Every failure is classified and logged to the tenant's Ops Console (`SsoLoginError`). See `docs/SAML_SSO_LIVE_HANDSHAKE.md`. |

---

## 3. Tenant workspace (client-facing)

| # | Requirement |
| --- | --- |
| FR-TEN-1 | Role-based landing: each `DeliveryAccessRole` resolves to a tailored default route via `/launch`. |
| FR-TEN-2 | **RBAC** — two axes: `MembershipRole` (org/billing tier) and `DeliveryAccessRole` (portfolio scope + edit authority). Five `RbacPersona`s (4-Tier RBAC, v1.29.0 — `PRACTICE_DIRECTOR` and `VP_EXECUTIVE` merged into one shared tier, plus the read-only guest tier) gate sidebar / tab-pill / route visibility (`rbacMatrix.ts`), server-enforced in `middleware.ts` and every mutation via `authorizeProjectEdit` / `authorizeAdminAction`. The underlying six-value `DeliveryAccessRole` enum is unchanged — the persona layer is a friendly presentation collapse on top of it, not a schema change. |
| FR-TEN-3 | **Row-level scoping** — `getScopedProjectWhere` / `isProjectInScope` restrict portfolio reads by role (global for ADMIN / VP / VIEWER; practice- or report- or assignment-scoped otherwise). |
| FR-TEN-4 | **Viewer tier** (`DeliveryAccessRole.VIEWER`, v1.16.0) — whole-org read of portfolio + SteerCo, **zero** edit authority, financial figures `restricted` (cost rates, margins, variance scrubbed). `MembershipRole.VIEWER` resolves here. |
| FR-TEN-5 | Financial data masking — `full` / `summary` / `restricted` visibility tiers per role, plus a tenant-level `maskFinancialsForDelivery` governance toggle. Enforced centrally in `src/lib/security/masking.ts`. |
| FR-TEN-6 | Delivery modules: Commercial Baseline (sizing + rate card), Control Audit (CTRL_01–10 weighted scoring), RAID, Financial Realization (EAC / BAC / margin drift), Schedule & Milestones, Executive Briefing Hub, SteerCo Briefing, Capacity & Concurrency cockpit, Custom KPI engine, 4-pillar Batch Import. |
| FR-TEN-7 | Governance config — compliance templates (Strict Financial / Agile / Board-Only / Standard) toggling route visibility + financial masking per tenant. |
| FR-TEN-8 | Exact-decimal financial arithmetic — the calc engine accumulates every `$`/rate in `decimal.js`, rounds once at the accounting boundary (money HALF_UP 2 dp). No IEEE-754 drift on large portfolios. |
| FR-TEN-9 | Tenant lifecycle states: `ACTIVE` / `SUSPENDED` (locks non-staff out) / `GRACE_PERIOD` (read-only). |
| FR-TEN-10 | **Persona Preview** (v1.17.0) — a tenant Admin or A2R staff member simulates any of the five RBAC personas from an explicit banner; the Sidebar, module tabs, and every per-project write control (Lock Baseline, RAID / Schedule / Audit / Financials / Commercial Baseline editors) render exactly as that persona would, and picking one navigates to its `landing` route. Display-only — never changes what `middleware.ts` or any server action actually permits for the real signed-in session. No switcher renders for any other role. |

---

## 4. Operator control plane (`/ops`, A2R-internal)

| # | Requirement |
| --- | --- |
| FR-OPS-1 | **Eligibility** — reachable only with an explicit, attributed, revocable `staff_grants` row. No `isA2rStaff` boolean, no email-domain wildcard. |
| FR-OPS-2 | **Organizational role** (v1.16.0) — the live grant carries one `OperatorRole` (`SUPER_ADMIN` / `PROVISIONING` / `SUPPORT` / `AUDITOR` / `BILLING` / `VIEWER`). The `src/lib/ops/operator-roles.ts` capability matrix gates every `/ops` sub-route (Edge middleware + `requireOpsCapability`) and every mutating action (`requireElevatedOps(capability)` → `ROLE_FORBIDDEN`). |
| FR-OPS-3 | **JIT elevation** — every state-changing `/ops` action requires a live, reason-logged, auto-expiring `staff_elevations` row on top of the grant + role. TTL default 30 min, hard cap `OPS_ELEVATION_MAX_MINUTES` (≤ 240). One live elevation per operator. |
| FR-OPS-4 | Obtaining an elevation requires, in one request: a reason (≥ 10 chars), a **fresh password** re-verification (`bcrypt.compare`), and a **valid TOTP code or single-use recovery code**. The row is bound to `sessionVersion` — a password change / global sign-out kills it instantly. |
| FR-OPS-5 | **Operator MFA** — mandatory activated TOTP enrollment (`operator_mfa`). Self-service enrollment at `/ops/security` (standing grant + fresh password — MFA cannot gate its own setup). Rotation needs an elevation; disabling is CLI-only (a phished password must not strip MFA). |
| FR-OPS-6 | **Role & Access Management** (`/ops/access`, `roles:manage` = SUPER_ADMIN + elevation) — view every operator, change a role (a re-grant, audit-preserving; not your own), and the capability matrix. |
| FR-OPS-7 | Tenant management — provision (org + admin invite + defaults, one transaction), lifecycle change, cryptographic export (type-to-confirm, payload digest), Purge Protocol (type-the-name, Certificate of Destruction), tenant-scoped API keys. |
| FR-OPS-8 | Impersonation Gateway — a read-only, reason-logged, auto-expiring tenant session for support. |
| FR-OPS-9 | Read surfaces — Platform Telemetry, Platform Pulse (build / test / DB health), Billing (contract tiers / seats), Audit & Compliance (operator roster + elevation history), Ingestion & Templates, Developer Docs, **Documentation Hub** (v1.28.0 — `/ops/docs`, a full in-app Markdown reader for the repo's curated `docs/*.md`, categorized Architecture / RTM / Module Specs / QA / Implementation Guide / Release Notes / Operations & Support; content baked in at build time, not read from disk at runtime). |
| FR-OPS-10 | Every operator action that touches a tenant records an `ImmutableAuditLedger` entry (hash-chained) on that tenant's chain; operator-axis events (grants, elevations) are their own audit trail. |
| FR-OPS-11 | **Read-Only External Integration Adapters** (v1.18.0) — an operator configures a tenant's connection to Jira/Asana/Monday (sprint velocity, issue counts, milestone status), NetSuite/Certinia/Kantata/OpenAir (baseline margin, financial actuals, resource allocation), or Salesforce (pipeline/deal stages) from `/ops/integrations` (`integrations:manage`, elevation-gated). Every driver (`src/lib/integrations/adapters/*.ts`) is READ-ONLY by construction — no write/push method exists on the shared `BaseAdapter` interface. The Connection Health Matrix (`integrations:view`, no elevation) tracks per-connection status, last sync, records ingested, average duration, and rate-limit headroom across every tenant; a categorized, human-readable error log replaces raw stack traces, with a manual Retry Sync action. See `docs/INTEGRATION_ADAPTERS.md`. |

---

## 5. Data isolation & integrity

| # | Requirement |
| --- | --- |
| FR-ISO-1 | Every tenant-owned model carries its own `organizationId`; the Prisma `$extends` org-scope extension auto-filters every tenant query and injects `organizationId` on create. `runUnscoped` is the audited exception for cross-tenant operator paths. |
| FR-ISO-2 | **Composite foreign keys** — every intra-tenant relationship is `(organizationId, col) → parent(organizationId, id)`, so the database itself rejects a cross-tenant reference. |
| FR-ISO-3 | **DB-level RLS** — `SET LOCAL ROLE a2r_app` + `SET LOCAL app.current_org` per tenant transaction; `tenant_isolation` policies on 28 tenant tables, `rls_deny_app` on the 9 identity tables. Enforced on staging; applied and structurally verified on production (`RLS_ENFORCE=1`). |
| FR-ISO-4 | **Engine-level ledger immutability** — `a2r_app` has no `UPDATE`/`DELETE` on `immutable_audit_ledger`; a `BEFORE UPDATE/DELETE/TRUNCATE` trigger rejects every role bar a deliberate GUC opt-in (`a2r.ledger_admin`) that the runtime role can never set. |
| FR-ISO-5 | Preview / production isolation — build + boot + Prisma-client hard-fail if a non-production deployment's `DATABASE_URL` points at the production project ref. |

---

## 6. Cryptography & secrets

| # | Requirement |
| --- | --- |
| FR-CRY-1 | Bearer tokens (elevation, impersonation, API keys) stored as `sha256` only; the plaintext lives only in the httpOnly cookie / one-time response. Constant-time comparison. |
| FR-CRY-2 | **Operator MFA secret** — AES-256-GCM sealed under a **dedicated, versioned** `MFA_ENCRYPTION_KEY` (required in production; rejected if it equals `NEXTAUTH_SECRET`). Ciphertext `v2.<keyVersion>.<iv>.<tag>.<ct>`; legacy `v1` still decrypts; a secret on an old key is re-sealed on next successful verification. Rotation via `MFA_ENCRYPTION_KEY_V<n>`. |
| FR-CRY-3 | **Atomic replay protection** — TOTP anti-replay is a single conditional `UPDATE` (`lastStepCounter` advances only when strictly newer); recovery-code consumption runs under `SELECT … FOR UPDATE`. Two concurrent requests with the same valid code → exactly one succeeds. |
| FR-CRY-4 | SSO client secrets AES-256-GCM encrypted at rest (`src/lib/identity/crypto.ts`). |
| FR-CRY-5 | Session JWTs signed with `NEXTAUTH_SECRET` (operator-supplied, distinct per environment). App cookies `sameSite: 'strict'`. |

---

## 7. Abuse protection & observability

| # | Requirement |
| --- | --- |
| FR-OBS-1 | Sliding-window rate limiting on auth / export / doc-gen / ingest / snapshot / elevation boundaries. `RL_<NAME>_LIMIT` env-overridable; `X-RateLimit-*` headers on the allowed response, `Retry-After` on the 429. |
| FR-OBS-2 | **Distributed limiter fails closed in production** — with a shared Upstash backend configured, a failing Redis call denies the request (429 + `error` report) rather than degrading to per-instance limiting. No backend configured → in-process limiter, clean fallback (one `info` breadcrumb). |
| FR-OBS-3 | Centralized server-side error boundary (`withAction` / `withRouteHandler`) — no raw backend error (Prisma exception, stack, driver message) ever reaches the client; a generic 500 / `{ ok:false }` is returned and the real error is `captureException`-recorded. |
| FR-OBS-4 | **Health endpoints** — `GET /api/health` returns a constant `{ status: "ok" }`. `GET /api/health/ready` returns **only** `{ status: "ready" | "unavailable" }` to unauthenticated callers (no DB dependency / latency / error-type leak); `x-a2r-internal-token: <HEALTH_CHECK_TOKEN>` unlocks `{ database, latencyMs, checkedAt }`. |
| FR-OBS-5 | Security headers on every response (`X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, CSP `frame-ancestors 'none'`). |
| FR-OBS-6 | **Support trace ids** (v1.28.0) — every `captureException` call mints an 8-character correlation id and returns it; `withAction`/`withRouteHandler` surface it to the caller (`(Ref: <id>)` in the generic Server Action failure message, `traceId` in a Route Handler's 500 JSON body), so a client can quote it in a support ticket and Tier 2/3 can grep the exact structured log line back out. Distinct from, and a deliberate parity fix alongside, Next.js's own pre-existing `error.digest` shown on a page-render error boundary. See `docs/CLIENT_SUPPORT_RUNBOOK.md`. |

---

## 8. Operational tooling (direct-DB CLIs)

| # | Requirement |
| --- | --- |
| FR-CLI-1 | `staff:list` / `staff:grant --role` / `staff:revoke`, `operator:create --role`, `ops:mfa:status` / `ops:mfa:reset`, `user:password:status` / `user:password:set`, `guests:seed` / `guests:access --tier full\|viewer`, `health:prod`, `db:rls:verify` / `db:rls:smoke`. |
| FR-CLI-2 | A password is **never** a command-line argument — masked interactive prompt, `--password-stdin`, or `--generate`. A positional password is rejected. |
| FR-CLI-3 | `user:password:set` / `operator:create` default to `mustChangePassword = true` (`--no-force-change` to opt out) and always bump `sessionVersion`. |
| FR-CLI-4 | Any mutating CLI run against the **production** database requires `--yes-prod` / `A2R_ALLOW_PROD_WRITE=1` or a typed project-ref confirmation; a non-interactive prod run is refused. |
| FR-CLI-5 | The automated test suites (Vitest DB-integration, Playwright) refuse to run against the production database (`tests/helpers/db-target.ts`); production is verified only by read-only `db:rls:verify`. |

---

## 9. Executive governance — triage & orchestration

FR-TEN-6 (§3) names the delivery modules; the requirements below are the
governance layer built on top of them since v1.20.0 — turning each module
from a per-project tool into a portfolio-wide executive read, plus the
governed-execution engine that acts on what they flag. Full architecture:
`docs/EXECUTIVE_TRIAGE_STANDARD.md`.

| # | Requirement |
| --- | --- |
| FR-GOV-1 | **PS Orchestration & Decision Engine** (v1.20.0) — every Red or over-budget/behind-schedule engagement surfaces 2-3 real, commercially viable response options (Change Order, Resource Re-leveling, Margin Absorption, Timeline Extension, Scope Descope, Governance Remediation), each with a real domino/trade-off preview computed from actual data, never fabricated. A governance drawer runs a compliance/guardrail check (SOW type, baseline lock state, RBAC/$-threshold approval authority) before any option can execute; execution is single-step (no separate approval queue), immutable-ledger-logged, and tags the engagement "Intervention Applied" for longitudinal accountability. |
| FR-GOV-2 | **Executive Triage & Thematic Clustering** (v1.21.0–v1.25.0) — the RAID, Financial Realization, Schedule, Resource & Capacity, and Commercial Baseline modules each open on a portfolio-wide dual-tile macro summary (an aggregate/RAG-split Tile 1, a thematic-cluster Tile 2) instead of going straight to a per-project picker, with the existing per-project drill-down still one click away. Every classifier is deterministic and instant — never a live LLM call — so the page renders identically regardless of `ANTHROPIC_API_KEY` configuration; a theme this app has no real data for is honestly substituted or omitted rather than fabricated (see `docs/RESOURCE_CAPACITY_TRIAGE.md` §2 and `docs/COMMERCIAL_BASELINE_TRIAGE.md` §2). |
| FR-GOV-3 | RAID Cockpit triage (`docs/RAID_EXECUTIVE_TRIAGE.md`) — every open Critical/High/Medium RAID item in scope, clustered by root cause (Resource Bottlenecks, Integration/Data Failures, Scope Creep, Vendor Delays) via keyword scoring against each item's own text. |
| FR-GOV-4 | Financial Realization triage (`docs/FINANCIAL_REALIZATION_TRIAGE.md`) — portfolio BAC/Actuals/EAC-variance rollup, clustered by root cause (Unbilled Milestone Delays, Scope Creep Overruns, Subcontractor Rate Variances, Labor Burn Accelerations) via a fixed-priority rule list over structured signals. |
| FR-GOV-5 | Schedule & Milestones triage (`docs/SCHEDULE_MILESTONES_TRIAGE.md`) — active-milestone count, upcoming go-lives, and a Red/Amber/on-track split, clustered by root cause (Third-Party Dependency Cascades, UAT Sign-off Lags, Resource Contention on Deployment Windows, Scope Expansion Slippage). |
| FR-GOV-6 | Resource & Capacity triage (`docs/RESOURCE_CAPACITY_TRIAGE.md`) — blended utilization, unassigned headcount, a severely-over-allocated (>110%) count, clustered by root cause (Senior/Architect Over-allocation, Cross-Project Contention for Lead PMs, Junior/Analyst Under-utilization, Bench/Unassigned Capacity). |
| FR-GOV-7 | Commercial Baseline triage (`docs/COMMERCIAL_BASELINE_TRIAGE.md`) — total contracted value, a locked-vs-draft baseline split, clustered by root cause (Change Order Exposure, Margin Squeeze on Fixed-Fee Deliverables, Blended Rate Erosion, Exceeded Baseline Scope Caps). |
| FR-GOV-8 | **Control Tower Bento Grid** (v1.26.0) — `/portfolio`'s default "Overview" tab lays every top-line signal (KPI strip, Decision Center summary, utilization, roster counts, program rollups) out as a responsive multi-column grid, scannable above the fold; the full Decision Center (Impact-Aware Decision Cards, pending decisions, high-severity RAID) moved into a dedicated "Decisions" tab reached in one click, eliminating the page's prior single-column scroll-fatigue layout. |
