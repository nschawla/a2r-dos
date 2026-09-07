# Functional Requirements Document — A2R Delivery OS™

_Consolidated current-state, **v1.16.0**. Per-phase functional narratives
live in `README.md` (Phases 1–13); this document is the flattened,
deduplicated view of what the production system does today. Traceability to
code and tests: `docs/RTM.md`. Security posture: `docs/SECURITY.md` +
`docs/ROLE_ACCESS_MATRIX.md`. Forward plan (not yet shipped):
`docs/ROADMAP.md`._

---

## 1. Product scope

A2R Delivery OS is a multi-tenant SaaS "Delivery Operating System" for
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

---

## 3. Tenant workspace (client-facing)

| # | Requirement |
| --- | --- |
| FR-TEN-1 | Role-based landing: each `DeliveryAccessRole` resolves to a tailored default route via `/launch`. |
| FR-TEN-2 | **RBAC** — two axes: `MembershipRole` (org/billing tier) and `DeliveryAccessRole` (portfolio scope + edit authority). Six personas gate sidebar / tab-pill / route visibility (`rbacMatrix.ts`), server-enforced in `middleware.ts` and every mutation via `authorizeProjectEdit` / `authorizeAdminAction`. |
| FR-TEN-3 | **Row-level scoping** — `getScopedProjectWhere` / `isProjectInScope` restrict portfolio reads by role (global for ADMIN / VP / VIEWER; practice- or report- or assignment-scoped otherwise). |
| FR-TEN-4 | **Viewer tier** (`DeliveryAccessRole.VIEWER`, v1.16.0) — whole-org read of portfolio + SteerCo, **zero** edit authority, financial figures `restricted` (cost rates, margins, variance scrubbed). `MembershipRole.VIEWER` resolves here. |
| FR-TEN-5 | Financial data masking — `full` / `summary` / `restricted` visibility tiers per role, plus a tenant-level `maskFinancialsForDelivery` governance toggle. Enforced centrally in `src/lib/security/masking.ts`. |
| FR-TEN-6 | Delivery modules: Commercial Baseline (sizing + rate card), Control Audit (CTRL_01–10 weighted scoring), RAID, Financial Realization (EAC / BAC / margin drift), Schedule & Milestones, Executive Briefing Hub, SteerCo Briefing, Capacity & Concurrency cockpit, Custom KPI engine, 4-pillar Batch Import. |
| FR-TEN-7 | Governance config — compliance templates (Strict Financial / Agile / Board-Only / Standard) toggling route visibility + financial masking per tenant. |
| FR-TEN-8 | Exact-decimal financial arithmetic — the calc engine accumulates every `$`/rate in `decimal.js`, rounds once at the accounting boundary (money HALF_UP 2 dp). No IEEE-754 drift on large portfolios. |
| FR-TEN-9 | Tenant lifecycle states: `ACTIVE` / `SUSPENDED` (locks non-staff out) / `GRACE_PERIOD` (read-only). |

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
| FR-OPS-9 | Read surfaces — Platform Telemetry, Platform Pulse (build / test / DB health), Billing (contract tiers / seats), Audit & Compliance (operator roster + elevation history), Ingestion & Templates, Developer Docs. |
| FR-OPS-10 | Every operator action that touches a tenant records an `ImmutableAuditLedger` entry (hash-chained) on that tenant's chain; operator-axis events (grants, elevations) are their own audit trail. |

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

---

## 8. Operational tooling (direct-DB CLIs)

| # | Requirement |
| --- | --- |
| FR-CLI-1 | `staff:list` / `staff:grant --role` / `staff:revoke`, `operator:create --role`, `ops:mfa:status` / `ops:mfa:reset`, `user:password:status` / `user:password:set`, `guests:seed`, `health:prod`, `db:rls:verify` / `db:rls:smoke`. |
| FR-CLI-2 | A password is **never** a command-line argument — masked interactive prompt, `--password-stdin`, or `--generate`. A positional password is rejected. |
| FR-CLI-3 | `user:password:set` / `operator:create` default to `mustChangePassword = true` (`--no-force-change` to opt out) and always bump `sessionVersion`. |
| FR-CLI-4 | Any mutating CLI run against the **production** database requires `--yes-prod` / `A2R_ALLOW_PROD_WRITE=1` or a typed project-ref confirmation; a non-interactive prod run is refused. |
| FR-CLI-5 | The automated test suites (Vitest DB-integration, Playwright) refuse to run against the production database (`tests/helpers/db-target.ts`); production is verified only by read-only `db:rls:verify`. |
