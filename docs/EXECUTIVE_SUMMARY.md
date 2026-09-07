# Executive Security & Architecture Summary — A2R Delivery OS™

_Production state as of **v1.16.0** (commit `e1a0c09`, tag `v1.16.0`).
Audience: executive, security review, external audit. Detail:
`docs/FRD.md` · `docs/RTM.md` · `docs/SECURITY.md` ·
`docs/ROLE_ACCESS_MATRIX.md` · `docs/TEST_COVERAGE.md`._

---

## 1. What it is

A2R Delivery OS is a multi-tenant SaaS "Delivery Operating System" for
Professional-Services firms — portfolio governance, engagement delivery,
financial realization (EAC / margin), capacity planning — plus an internal
operator control plane for the vendor. **Next.js 15** (App Router) ·
**Prisma 5.22** · **PostgreSQL 17** (Supabase) · **NextAuth v4** (JWT) ·
deployed on **Vercel** at `www.a2rventures.com`.

Production is healthy and continuously verified: `/api/health/ready` → ready,
database ok; the full test suite is green (below).

---

## 2. Security architecture

### 2.1 Isolation — four independent layers

| Layer | Guarantee |
| --- | --- |
| **Application (ORM)** | A Prisma `$extends` extension auto-scopes every tenant query by `organizationId` and injects it on create. `runUnscoped` is the audited exception for the cross-tenant operator path. |
| **Referential (composite FKs)** | Every intra-tenant relationship is `(organizationId, col) → parent(organizationId, id)` — the database itself rejects a row that references another tenant's parent. |
| **Database (Row-Level Security)** | Per-transaction `SET LOCAL ROLE a2r_app` + `SET LOCAL app.current_org`; `tenant_isolation` policies on 28 tenant tables, hard `rls_deny_app` on the 9 identity tables. Enforced on staging; applied and structurally verified on production (`RLS_ENFORCE=1`). |
| **Environment** | Build + boot + Prisma-client hard-fail if a non-production deployment's database URL points at the production project. |

### 2.2 Cryptographic hardening

- **Bearer tokens** (JIT elevation, impersonation, API keys) — stored as
  `sha256` only; plaintext lives solely in the httpOnly cookie / one-time
  response. Constant-time comparison.
- **Operator MFA secret** — AES-256-GCM at rest under a **dedicated,
  versioned key** (`MFA_ENCRYPTION_KEY`, distinct from the session-signing
  secret; required in production, rejected if identical to it). Ciphertext
  is self-describing (`v2.<keyVersion>.…`); key rotation is zero-downtime
  (old key kept decrypt-only as `MFA_ENCRYPTION_KEY_V<n>`, secrets re-sealed
  on next use). Legacy ciphertexts still decrypt.
- **SSO client secrets** — AES-256-GCM encrypted at rest.
- **Session JWTs** — signed with an operator-supplied secret, distinct per
  environment; app cookies `sameSite: 'strict'`.

### 2.3 Atomic replay protection

Operator second-factor consumption is **strictly atomic at the database**:

- **TOTP** — a single conditional `UPDATE` advances the anti-replay
  high-water mark only when the presented code's time-step is strictly
  newer. Two concurrent requests with the same valid code → exactly one
  succeeds; the other is rejected as replayed.
- **Recovery codes** — consumed inside a transaction under
  `SELECT … FOR UPDATE`; a concurrent use blocks, then finds the code gone.

### 2.4 Session integrity

Every authenticated request re-derives session state from the database
(`sessionVersion` epoch / `passwordChangedAt` / forced-rotation flag). Any
uncertainty — DB error, timeout, missing user, epoch mismatch — fails
**closed** to a user-less session. A password change is an atomic
all-device logout. There is no fail-open path.

### 2.5 Engine-level audit immutability

The hash-chained compliance ledger is immutable at the Postgres engine: the
runtime role has no `UPDATE`/`DELETE` privilege, and a `BEFORE
UPDATE/DELETE/TRUNCATE` trigger rejects every role except through a
deliberate, transaction-local GUC opt-in that the runtime role can never
set (reserved for lawful data-subject erasure).

### 2.6 Surface hardening

- **Rate limiting** fails **closed** in production when a shared backend is
  configured and unreachable (deny + alert, never silent degradation).
- **Health endpoints** leak nothing to the internet — the public readiness
  probe returns only up/down; database dependency, latency, and error type
  require an internal token.
- **Error sanitization** — no raw backend error (Prisma exception, stack,
  driver message) ever reaches a client; a generic response is returned and
  the real error is captured server-side. Statically enforced across every
  route.
- Baseline security headers (`X-Frame-Options: DENY`, CSP
  `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`,
  `Permissions-Policy`) on every response.

---

## 3. Strict RBAC — two axes

### 3.1 Operator axis (`/ops` console, v1.16.0)

Six A2R organizational roles, one per live `staff_grants` entitlement.
Enforced in **three layers** — Edge middleware, page guard
(`requireOpsCapability`), and action guard (`requireElevatedOps(capability)`
→ `ROLE_FORBIDDEN`) — against a capability matrix
(`src/lib/ops/operator-roles.ts`).

| Role | Remit |
| --- | --- |
| **Super Admin / Owner** | Full access. |
| **Provisioning Staff** | Tenant onboarding / lifecycle, SSO setup, ingestion. |
| **Support / Troubleshooting** | Diagnostics, platform health, read-only impersonation, audit view. |
| **Auditor / Compliance** | Read-only — audit ledger, elevation history, contract records, tenant export. |
| **Billing / Finance** | Contract tiers, seat counts, subscription state. |
| **Viewer / Guest** | Restricted read-only — platform pulse and telemetry only. |

Every mutating operator action **also** requires a live Just-In-Time
elevation: a reason, a fresh password re-verification, **and** a valid TOTP
or single-use recovery code — bound to the session epoch, auto-expiring,
with no standing privileged sessions. Changing a role is an audit-preserving
re-grant, gated on Super Admin + elevation.

### 3.2 Tenant axis

`MembershipRole` (org tier) → `DeliveryAccessRole` (portfolio scope + edit
authority) → RBAC persona (navigation allow-list), server-enforced on every
route and mutation. **v1.16.0** adds a strict read-only **Viewer** tier:
whole-org read of the portfolio and SteerCo board, zero edit authority,
every financial figure scrubbed.

### 3.3 Guest accounts

Five family guest accounts are provisioned as Viewers of the demo
organization — a shared, policy-compliant password; they observe the
product read-only and are structurally walled off from the operator console
and tenant administration (verified by an end-to-end suite).

---

## 4. Verification (v1.16.0)

| Gate | Result |
| --- | --- |
| `tsc --noEmit` | 0 errors |
| `eslint` | 0 warnings / 0 errors |
| `prisma validate` | valid |
| Vitest (unit + DB-integration) | **689 / 689** — 59 files, staging DB |
| Playwright (end-to-end) | **65 / 65** — Suites A–Q, staging |
| `next build` | clean |
| `db:rls:verify` | passed — production, read-only, zero DML |
| `health:prod` | ready · database ok |
| Migrations 16–25 | rehearsed (`BEGIN … ROLLBACK`) then applied to production and staging |

The automated suites cannot run against the production database — a hard
guard aborts any run whose resolved URL is the production project. Every
release tag from `v1.12.0` points at the exact immutable commit deployed to
production.

---

## 5. Release history

| Version | Theme |
| --- | --- |
| **v1.12.0** | Production RLS cutover prep; identity-table lockdown (`rls_deny_app`). |
| **v1.13.0** | Engine-level ledger immutability; composite-FK closure; global break-glass removed. |
| **v1.14.0** | Exact-decimal financial arithmetic; JIT elevation password step-up + session binding; test-rig production isolation. |
| **v1.15.0** | Rate-limiter fail-closed posture; mandatory operator TOTP MFA for elevation. |
| **v1.15.1** | MFA encryption key separated from the session secret (versioned, rotatable); atomic TOTP / recovery-code consumption; operational CLIs no longer accept a password as an argument, and refuse an unconfirmed production write. |
| **v1.15.2** | Public readiness probe no longer discloses database dependency, latency, or error type. |
| **v1.16.0** | Six A2R organizational (operator) roles with a three-layer capability matrix; Role & Access management console; a strict read-only tenant Viewer tier + family guest accounts. |

---

## 6. Residual items

| Item | Status |
| --- | --- |
| WebAuthn / passkeys (phishing-resistant AAL2) | Tracked — slots in at the `verifySecondFactor` seam. |
| `ops@` / `master.e2e@` operators unenrolled in MFA | Operator action — hard cut-over means they enroll before they can elevate. |
| `FORCE ROW LEVEL SECURITY` on production (post-soak) | Roadmap — RLS is applied and enforced; the `FORCE` hardening follows the soak window. |
| Dedicated `a2r_ops` database role for the cross-tenant admin path | Phase-3 residual. |
