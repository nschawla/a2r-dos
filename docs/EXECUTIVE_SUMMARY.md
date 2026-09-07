# Executive Security &amp; Architecture Summary — A2R Delivery OS™

_Authoritative current-state, **v1.16.0** (commit `e1a0c09`, tag `v1.16.0`)._
_Audience: executive sponsors, security review, prospective enterprise clients,
external audit. Requirement- and code-level detail: `docs/FRD.md` ·
`docs/RTM.md` · `docs/SECURITY.md` · `docs/ROLE_ACCESS_MATRIX.md` ·
`docs/TEST_COVERAGE.md`. Forward plan: `docs/ROADMAP.md`._

---

## 1. The problem A2R-DOS solves

Professional-services delivery leaders are forced into a false choice:

- **Spreadsheets and slideware** — fast to start, but fragile, un-auditable,
  and impossible to trust at portfolio scale. Numbers drift, versions fork,
  and there is no record of who changed what.
- **General-purpose PM / ERP platforms** — either they bolt "security" onto a
  UI layer that a determined user can walk around, or they hand operators raw
  database and infrastructure access and call it power-user mode.

Neither gives a sponsor **operational certainty** — a single, current,
tamper-evident view of engagement health, financial realization, and
governance — without also widening the attack surface.

**A2R-DOS removes the choice.** It is an enterprise-grade, multi-tenant
**delivery operating system**: the portfolio, financial, and governance model
of a purpose-built PS platform, on an architecture where tenant isolation,
auditability, and least-privilege operator access are enforced at the
database and the framework edge — not in the UI, and not by trusting the
operator.

---

## 2. What A2R-DOS is

A multi-tenant SaaS platform for professional-services organizations:

| Capability | What it delivers |
| --- | --- |
| **Portfolio governance** | PS Control Tower, RBAC-scoped portfolios, SteerCo briefings, decision ledger. |
| **Engagement delivery** | Commercial Baseline (sizing + rate card), Control Audit (weighted scoring), RAID, Schedule &amp; Milestones. |
| **Financial realization** | EAC / BAC / margin-drift with **exact-decimal arithmetic** — no floating-point error at portfolio scale. |
| **Capacity planning** | Utilization, concurrency radar, 52-week forecast, holiday / policy controls. |
| **Stakeholder visibility** | Executive Briefing Hub, print-ready board packs, a strict read-only **Viewer** tier for guests and clients. |
| **Operator control plane** | An internal `/ops` console for the vendor — tenant lifecycle, telemetry, platform health — under a six-tier least-privilege role model. |

**Stack.** Next.js 15 (App Router) · NextAuth v4 (JWT) · Prisma 5.22 ·
PostgreSQL 17 (Supabase) · deployed on Vercel at `www.a2rventures.com`.
Production is healthy and continuously verified: `/api/health/ready` → ready,
database ok.

---

## 3. Security hardening pedigree

A2R-DOS reached v1.16.0 through **seven successive audit-and-hardening
rounds**, v1.10.0 → v1.16.0. Each round followed the same discipline:

1. **Independent review** — an AI audit agent (ChatGPT) reviewed the codebase
   and produced prioritized findings.
2. **Implementation** — a second AI agent (Claude) implemented the fixes,
   wrote regression tests, and rehearsed every database migration with
   `BEGIN … ROLLBACK` before applying it.
3. **Verification gate** — the round closed only on a full green suite: type
   check, lint, unit + database-integration tests, end-to-end tests, a
   production build, and a read-only production RLS acceptance check.
4. **Provenance** — a release tag was cut at the **exact immutable commit**
   deployed to production.

| Round | Release | Focus |
| --- | --- | --- |
| 1 | v1.10.0 | Mass-assignment lockdown (`strictObject`); all-device sign-out; strict cookies. |
| 2 | v1.11.0 | Exact-decimal money columns; foreign-key `onDelete: Restrict` on the operator-grant chain. |
| 3 | v1.12.0 | Production RLS cutover; identity-table hard denial (`rls_deny_app`); `a2r_app` set `NOLOGIN`. |
| 4 | v1.13.0 | Engine-level audit-ledger immutability; composite foreign-key closure; global break-glass removed. |
| 5 | v1.14.0 | Exact-decimal arithmetic through the calculation engine; JIT elevation password step-up + session binding; test-rig production isolation. |
| 6 | v1.15.0–v1.15.2 | Rate-limiter fail-closed posture; mandatory operator TOTP MFA; MFA key separation; atomic replay protection; readiness-probe hardening; CLI hardening. |
| 7 | v1.16.0 | Six-tier operator RBAC with a three-layer capability matrix; Role &amp; Access console; strict read-only tenant Viewer tier. |

**Compliance alignment.** The platform is **designed and operated in
alignment with SOC 1 and SOC 2 control objectives** — logical access
controls, change management, segregation of duties, and a tamper-evident
audit trail for financially-relevant activity. This is control-design
alignment demonstrated by the artifacts in this repository (`docs/RTM.md`,
`docs/TEST_COVERAGE.md`, the hash-chained ledger); **no third-party SOC
attestation has been performed**, and this summary makes no claim of one.

---

## 4. Key technical safeguards

### 4.1 Tenant isolation — four independent layers

| Layer | Guarantee |
| --- | --- |
| **Application (ORM)** | A Prisma `$extends` extension auto-scopes every tenant query by `organizationId` and injects it on create. `runUnscoped` is the single audited exception for the cross-tenant operator path. |
| **Referential (composite FKs)** | Every intra-tenant relationship is `(organizationId, col) → parent(organizationId, id)`; the database itself rejects a row that references another tenant's parent. |
| **Database (Row-Level Security)** | Per-transaction `SET LOCAL ROLE a2r_app` + `SET LOCAL app.current_org`; `tenant_isolation` policies on 28 tenant tables, hard `rls_deny_app` on the 9 identity tables. The runtime role `a2r_app` is `NOLOGIN`, non-superuser, and cannot bypass RLS. Enforced on staging; applied and structurally verified on production. |
| **Environment** | Build, server boot, and Prisma-client instantiation all hard-fail if a non-production deployment's database URL resolves to the production project. |

### 4.2 MFA secret-box encryption separation

The operator MFA secret is sealed with **AES-256-GCM** under a **dedicated,
versioned key** — `MFA_ENCRYPTION_KEY`, **fully decoupled from
`NEXTAUTH_SECRET`**. The app refuses to boot in production if the two are
equal. Ciphertext is self-describing (`v2.<keyVersion>.<iv>.<tag>.<ct>`); key
rotation is zero-downtime (the prior key is retained decrypt-only as
`MFA_ENCRYPTION_KEY_V<n>`, and each secret is re-sealed under the current key
on its next use). Legacy `v1` ciphertexts still decrypt. Bearer tokens (JIT
elevation, impersonation, API keys) are stored as `sha256` only; SSO client
secrets are AES-256-GCM encrypted at rest.

### 4.3 Atomic replay protection

Operator second-factor consumption is **strictly atomic at the database**:

- **TOTP** — a single conditional `UPDATE` advances the anti-replay
  high-water mark only when the presented code's time-step is strictly
  newer. Two concurrent requests with the same valid code: exactly one
  succeeds.
- **Recovery codes** — consumed inside a transaction under
  `SELECT … FOR UPDATE`; a concurrent use blocks, then finds the code spent.

### 4.4 Three-layer operator RBAC across six tiers

Six A2R organizational roles, one per live `staff_grants` entitlement:
**Super Admin / Owner**, **Provisioning**, **Support**, **Auditor /
Compliance**, **Billing / Finance**, **Viewer / Guest**. Every `/ops` route
and every mutating operator action is resolved against one capability matrix
(`src/lib/ops/operator-roles.ts`) in **three independent layers**:

1. **Edge middleware** — redirects a role away from an `/ops` sub-route it
   cannot see.
2. **Server page guard** — `requireOpsCapability(cap)` on every `/ops/*` page.
3. **Server action guard** — `requireElevatedOps(cap)` on every mutating
   action → `ROLE_FORBIDDEN`.

Every mutating action **also** requires a live Just-In-Time elevation: a
stated reason, a fresh password re-verification, **and** a valid TOTP or
single-use recovery code, bound to the session epoch, auto-expiring, with no
standing privileged session. Changing a role is itself an audit-preserving
re-grant, gated on Super Admin + elevation; an operator can never change
their own role.

### 4.5 Session integrity &amp; audit immutability

Every authenticated request re-derives session state from the database
(`sessionVersion` epoch, `passwordChangedAt`, forced-rotation flag). Any
uncertainty — DB error, timeout, missing user, epoch mismatch — fails
**closed** to a user-less session; a password change is an atomic all-device
logout. The hash-chained compliance ledger is immutable at the Postgres
engine: the runtime role holds no `UPDATE` / `DELETE` privilege on it, and a
`BEFORE UPDATE/DELETE/TRUNCATE` trigger rejects every caller except a
deliberate, transaction-local opt-in the runtime role can never set —
reserved for lawful data-subject erasure.

---

## 5. Verification (v1.16.0)

| Gate | Result |
| --- | --- |
| `tsc --noEmit` | 0 errors |
| `eslint` | 0 warnings / 0 errors |
| `prisma validate` | valid |
| Vitest (unit + DB-integration) | **689 / 689** — 59 files, staging DB |
| Playwright (end-to-end) | **65 / 65** — Suites A–Q, staging DB |
| `next build` | clean |
| `db:rls:verify` | passed — production, read-only, zero DML |
| `health:prod` | ready · database ok |
| Migrations 0–25 | rehearsed (`BEGIN … ROLLBACK`) then applied to production and staging |

The automated suites **cannot** run against the production database — a hard
guard aborts any run whose resolved URL is the production project. Every
release tag from `v1.12.0` points at the exact immutable commit deployed to
production.

---

## 6. Product roadmap — next release for beta clients

Full detail and sequencing in `docs/ROADMAP.md`. Headline themes:

- **Deep PM Pulse** — a composite engagement health score (schedule, cost,
  scope, risk, sentiment) with milestone-velocity tracking and trend arrows,
  surfaced on the Control Tower and every project header.
- **Real-time telemetry alerts &amp; webhooks** — threshold and anomaly
  alerts on platform and engagement signals, delivered to tenant-configured
  webhook endpoints (signed payloads) and the in-app activity stream.
- **Expanded self-service Viewer widgets** — a widget library for the
  read-only Viewer / guest tier (portfolio heat, milestone timeline, RAG
  summary), every widget passing through the same `restricted` financial
  masking the tier already enforces.

---

## 7. Residual items

| Item | Status |
| --- | --- |
| WebAuthn / passkeys (phishing-resistant AAL2) | Tracked — slots in at the `verifySecondFactor` seam; TOTP is the interim second factor. |
| Legacy operator accounts unenrolled in MFA | Operator action — the hard cut-over means they must enroll before they can elevate. |
| `FORCE ROW LEVEL SECURITY` on production (post-soak) | Roadmap — RLS is applied and enforced; the `FORCE` hardening follows the soak window. |
| Dedicated `a2r_ops` database role for the cross-tenant admin path | Phase-3 residual — the path currently runs as `postgres` via audited `runUnscoped`. |
| Third-party SOC 1 / SOC 2 attestation | Not started — the platform is control-aligned; formal attestation is a business decision. |
