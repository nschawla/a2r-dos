# A2R Delivery OS — Security & Trust Overview

_Last reviewed: 2026-09-07 · Applies to v1.14.0 · Owner: A2R Ventures Engineering_

This document describes the security architecture, data-handling posture, and
compliance controls of A2R Delivery OS™. It is written for the security and
procurement teams of prospective enterprise customers.

Sections marked **Roadmap** are planned but not yet implemented; they are
called out explicitly so this document can be trusted as an accurate
statement of the platform's current state.

---

## 1. Multi-tenant architecture & logical isolation

A2R Delivery OS is a single application serving many customer organizations
("tenants"). Isolation is **logical**, enforced consistently at the data-access
layer:

- **Every tenant-owned row carries `organizationId` directly** — not only via a
  parent record. As of v1.7.0 this is true of **all 29 tenant-owned models**:
  the nine remaining "child" tables (audit entries, RAID, financials, schedule,
  scope items, effort cells, SteerCo decisions, project contributors, import
  rows) gained their own `organizationId` column + foreign key + index
  (migration `00000000000012`), so the database itself binds every row to a
  tenant rather than relying on a join.
- **Composite foreign keys tie every child row to its parent's tenant (v1.8.0).**
  Migration `00000000000014` gives `projects` / `data_import_batches` a
  composite `UNIQUE ("organizationId", "id")` and replaces the single-column
  parent FK on all 11 project- / batch-scoped child tables with a **composite**
  FK `("organizationId", <parentId>)` → `parent("organizationId", "id")`.
  Postgres now *physically rejects* a child row whose `organizationId`
  disagrees with its project's / batch's — a cross-tenant child cannot be
  created even if both application layers below were bypassed.
- **Database-enforced isolation (RLS) — enforced on staging (v1.9.0);
  staged on production (v1.12.0).** Every tenant-scoped transaction runs
  `SET LOCAL ROLE a2r_app` (a least-privilege, `NOBYPASSRLS`, `NOLOGIN`
  role) + `SET LOCAL app.current_org = <org>`, so the per-table
  `tenant_isolation` policies (`organizationId =
  current_setting('app.current_org')`, fail-closed on NULL) apply for the
  application's own queries. The 9 identity / routing tables carry a hard
  **`rls_deny_app`** policy (v1.12.0) — the restricted role has *no* access
  to `sessions`, `staff_grants`, `staff_elevations`, `impersonation_grants`,
  `users`, … at all; they are reached only through the privileged
  administrative path. `npm run db:rls:smoke` (10-check matrix:
  SELECT/INSERT/UPDATE/DELETE/UPSERT, cross-tenant FK, ingestion path,
  ledger-immutability) proves all 28 tenant tables reject cross-tenant
  access. **Production has migrations 16 + 17 + 20 + 21 + 22 applied and
  verified but still connects as `postgres`**, so RLS is inert there until
  `RLS_ENFORCE=1` is set — a single environment-variable change completes
  the cutover (`docs/RLS_ENFORCEMENT_RUNBOOK.md`).
- **Complete composite tenant foreign keys (v1.13.0).** Every relationship
  between two tenant-owned records — assignments, timesheets, contributors,
  effort/financial roles, RAID/SteerCo owners, project leads, practice
  links, SSO group mappings, project audit links — carries a composite FK
  `(organizationId, <col>)` → `<parent>(organizationId, id)` (migrations 14
  + 22). The database rejects a row that references a parent in a different
  organization, independent of RLS.
- **Emergency rollback, not a fast break-glass (v1.13.0).** The v1.12.0
  `_rls_control` flag — which dropped every tenant transaction on every
  instance to the `postgres` owner role and was toggleable from a console
  action — was **removed** after review. Normal tenant traffic is now
  unconditionally the least-privilege `a2r_app` role whenever
  `RLS_ENFORCE=1`. If DB-level RLS misbehaves, the only lever is unsetting
  `RLS_ENFORCE` on Vercel + a redeploy (~2 min; the Vercel dashboard is
  behind its own auth and is not the app's web surface). The app then
  reverts to the v1.8.0 app-tier-only posture with no policy change.
- **Queries are `organizationId`-scoped at three application-tier layers**
  (defence in depth, and the sole enforcement on production today):
  1. *Verified context.* Every page, route, and action resolves the caller's
     organization from their authenticated session
     (`requireOrgContext` / `getOrgContextOrNull` / `withApiAuth`) and filters
     every query by it. Role-based scoping (`getScopedProjectsForUser`) further
     narrows a project manager to their own engagements, a practice director to
     their practice — the returned row set *is* the authorization boundary.
  2. *ORM auto-scoping (new in v1.7.0).* A Prisma client extension
     (`src/lib/db/org-scope.ts`) rewrites **every** query on a tenant-owned
     model to include the request's `organizationId`, and **throws** if a
     tenant query runs with no resolved scope — a structural backstop under
     the hand-written filters.
  3. *Named Data Access Layer.* `src/app/**` and UI components may not import
     the database client directly (enforced by an ESLint rule **and**
     `tests/dal-boundary.test.ts`); reads go through `src/server/queries/**`,
     writes through `src/server/actions/**`. See `docs/DATA_ACCESS_LAYER.md`.
- **Cross-tenant writes are structurally prevented.** A `create` / `update`
  that names another tenant's `organizationId` is rejected by the ORM
  extension; the Data Ingestion API additionally re-validates that every
  `projectId` / `resourceId` in a payload belongs to the key's tenant before
  any write.
- **No shared mutable global state** between tenant requests. Rate-limiter and
  in-memory caches are keyed by tenant / principal; the scope cell is an
  `AsyncLocalStorage` per-request value, never attached to a pooled
  connection.

The DB-level Row Level Security work (making Postgres itself reject a
cross-tenant row *for every query*, not only inserts/updates against a
composite FK) is **enforced on staging** as of v1.9.0 and **staged on
production** as of v1.12.0. `docs/RLS_ROADMAP.md` /
`docs/TENANT_MODEL_INVENTORY.md`:

- `src/lib/db/with-tenant-tx.ts` — `withTenantTx` / `withTenantTxFor` replace
  `db.$transaction` at every call site that touches tenant data (~20). Under
  `RLS_ENFORCE=1` they run the two `SET LOCAL` statements first; unset, they
  are a plain transaction. There is no break-glass short-circuit (removed
  v1.13.0) — tenant traffic is unconditionally `a2r_app` when enforced.
- `src/lib/db/rls-transaction.ts` — wraps a bare `db.model.op()` in a tenant
  request in its own per-op transaction with the same `SET LOCAL`s.
- Migrations `16` (the `a2r_app` role + `GRANT a2r_app TO postgres` so the
  owner can `SET ROLE` in-band), `17` (`tenant_isolation` on the 28
  org-owned tables), `20` (the 9 identity/routing tables → `rls_deny_app`;
  `a2r_app` → `NOLOGIN`), `21` (`immutable_audit_ledger` engine-immutable —
  see §4; drops the removed `_rls_control` table), `22` (composite-FK
  closure). **Applied to staging and production** (inert on production).
- `signOutEverywhereAction` / `changePasswordAction` run under `runUnscoped`
  (they key by explicit `userId`) so the tenant runtime never touches an
  identity table as `a2r_app`.
- `npm run db:rls:smoke` / `tests/security/rls-policies.test.ts` /
  `tests/security/tenant-model-inventory.test.ts` — direct-SQL enforcement
  checks + a schema-drift guard.

Remaining production cutover — set `RLS_ENFORCE=1` on Vercel, soak 48 h,
then `FORCE ROW LEVEL SECURITY` — is `docs/RLS_ENFORCEMENT_RUNBOOK.md`. The
rollback lever is unsetting `RLS_ENFORCE` + a redeploy (there is no fast
break-glass).

### Database-level access control (Row Level Security)

The application reaches Postgres **only** through Prisma, as a single
role that owns every table and carries `BYPASSRLS` — there is no
Supabase-client / PostgREST usage anywhere in the codebase. To make sure
the managed database can't be reached *around* the application:

- **Row Level Security is `ENABLE`d on every table in `public`, with no
  policies** — i.e. deny-all for any role that is not the owning role.
  The application's role is unaffected (owner + `BYPASSRLS`); every other
  role, including the provider's web-exposed `anon` / `authenticated`
  roles, gets zero rows and zero writes. RLS is **not** `FORCE`d, so the
  owning role keeps its bypass.
- **All table / sequence / function privileges are revoked** from those
  web-exposed roles, and the schema default privileges are altered so a
  future schema push does not re-grant them.
- Applied by `prisma/migrations/00000000000007_rls_lockdown/migration.sql`
  (idempotent), and each later migration that adds a table repeats the
  posture (`ENABLE ROW LEVEL SECURITY` + `REVOKE ALL FROM anon, authenticated`
  — e.g. `staff_grants`, `staff_elevations`). Verified post-apply: every
  `public` table RLS-on, 0 residual grants, full Prisma read + write still
  functioning.
- **This is distinct from the *application-tier* isolation above** — RLS here
  closes the *out-of-band* path (the provider's web-exposed roles), not the
  app's own `BYPASSRLS` connection. Making Postgres reject a cross-tenant row
  for the application's own queries is **enforced on staging** as of v1.9.0
  and **staged on production** as of v1.12.0 (the `tenant_isolation`
  policies in migration `17`, the `rls_deny_app` policies in migration `20`,
  the `NOBYPASSRLS` `a2r_app` role in migration `16`, and the
  `RLS_ENFORCE=1` `SET LOCAL ROLE` bridge). Remaining cutover per
  `docs/RLS_ENFORCEMENT_RUNBOOK.md`.

### Platform-operator access (A2R staff)

A separate, non-tenant authorization axis governs the internal Operator Control
Plane (`/ops`). It has two levels as of v1.7.0:

- **Eligibility** — an account can reach the `/ops` *read* views only if it
  holds an explicit, attributed, revocable `staff_grants` row (migration
  `00000000000009`). The former "`isA2rStaff` flag **or** `@a2rventures.com`
  email" rule is **removed** — a compromised corporate inbox grants nothing.
  Grant / revoke from `/ops/staff` or `npm run staff:grant|revoke|list`;
  every change is attributed and you cannot revoke your own access. Checked in
  middleware (defence in depth) and authoritatively, live, in every operator
  route and server action (`requireOpsContext`).
- **Just-In-Time elevation** — every *state-changing* `/ops` operation
  (provisioning, suspension, impersonation, data export, purge, API keys,
  identity federation, granting/revoking staff) additionally requires a live
  `staff_elevations` grant (migration `00000000000013`): requested with a
  reason, and auto-expiring after a strict TTL (30 min default, 60 max). There
  are **no standing privileged operator sessions**. Every elevation — who,
  why, how long — is on the in-console audit trail at `/ops/staff`.
  **Step-up authentication + session binding (v1.14.0).** Obtaining an
  elevation now requires re-entering the account password (`bcrypt.compare`,
  rate-limited per account) — "fresh authentication" even mid-session. The
  row records the `users.sessionVersion` epoch it was minted under; the guard
  (`src/lib/ops-auth.ts`) rejects an elevation whose epoch ≠ the live session,
  so a password change or a global sign-out invalidates every elevation for
  that operator instantly, on every serverless instance. SSO-only operators
  (no `passwordHash`) must set a console password before they can elevate.
  **Mandatory second factor (Batch 2).** On top of the password, every
  elevation requires a valid **TOTP code** (RFC 6238 authenticator app) or a
  single-use recovery code, checked against the operator's `operator_mfa`
  row (migration 24). The secret is AES-256-GCM sealed at rest
  (`src/lib/crypto/secret-box.ts`); a `lastStepCounter` high-water mark
  rejects a replayed code inside its validity window; 10 SHA-256-hashed
  recovery codes are issued once at enrollment. Hard cut-over — an operator
  with no activated factor cannot elevate until they enroll at
  `/ops/security` (self-service: standing grant + password). Disabling a
  factor is CLI-only (`npm run ops:mfa:reset`) — a phished password cannot
  strip MFA. Phishing-resistant WebAuthn / passkeys is the tracked AAL2
  upgrade at the same `verifySecondFactor` seam.
  **As of v1.8.0 the cookie token is stored hashed** — the `staff_elevations`
  / `impersonation_grants` rows keep only `sha256(secret)` (`tokenHash`), the
  256-bit plaintext lives solely in the httpOnly cookie, and lookup is by
  hash with a constant-time compare (mirrors `ApiKey.hashedKey`). A database
  read or a leaked backup no longer yields a usable elevation or impersonation
  token. See
  `docs/JIT_STAFF_ELEVATION.md`.
- **Database-level (v1.12.0).** Under RLS the `staff_grants`,
  `staff_elevations` and `impersonation_grants` tables — along with the rest
  of the identity/routing set — carry a hard `rls_deny_app` policy. The
  restricted tenant runtime role cannot read or modify an operator
  entitlement, an elevation, or an impersonation grant at all; these are
  reached only through the privileged administrative path, which is itself
  gated by the two levels above.

Staff status is unrelated to any tenant membership role.

---

## 2. Cryptography & credential handling

| Secret | At rest | Notes |
| --- | --- | --- |
| User passwords | **bcrypt**, cost factor 10 | Plaintext never stored or logged. Verification is constant-time (bcrypt). New passwords must clear the shared policy (`src/lib/auth/password-policy.ts`): ≥12 chars, upper + lower + digit. An account whose password was set by an operator (`User.mustChangePassword`) is forced to `/change-password` on first sign-in before it can reach any other route (`src/middleware.ts`). |
| API keys | **SHA-256** of the plaintext; `hashedKey` is unique-indexed | Plaintext is `a2r_live_` + 32 bytes of CSPRNG entropy (`node:crypto randomBytes`), shown **exactly once** at creation. Only a short non-secret prefix (`keyPrefix`) is displayed thereafter. |
| Impersonation grant tokens | random `base64url`, 24 bytes CSPRNG | Single-use, time-boxed (§5). |
| Compliance-ledger row hashes | **SHA-256** chain | See §4. |
| Export / destruction certificates | **SHA-256** payload + self-seal digests | See §6. |

- Constant-time comparison (`node:crypto timingSafeEqual`) is used for hash and
  internal-token checks.
- Session tokens are JWTs signed with `NEXTAUTH_SECRET` (operator-supplied,
  generated via `openssl rand -base64 32`).
- **Server-side session validation (new in v1.7.0).** A session is not
  trusted on its `exp` claim alone. On every authenticated request the
  NextAuth `jwt` callback re-derives the session's state from the database
  through an explicit state machine (`ACTIVE | PENDING_PASSWORD_CHANGE |
  REVOKED`, `src/lib/auth/session-state.ts`) and checks the token's pinned
  `sessionVersion` against the live `users.sessionVersion`. **Any lookup
  failure or timeout resolves to `REVOKED` — fail-closed.** A password
  change increments `sessionVersion` in the same transaction as the hash
  write, so **every other device is logged out** on its next request — an
  atomic "sign out everywhere". No stale token survives a password event.
  See `docs/SESSION_STATE_MACHINE.md`.
- **Explicit global sign-out (new in v1.10.0).** "Sign out of all sessions"
  in the user menu (`signOutEverywhereAction`) bumps `sessionVersion` the
  same way, without a password change — one click revokes every session on
  every device and every serverless instance (the check is DB-backed, not
  an in-memory cache). The ordinary "Sign out" stays local to the device.
- **Cookie flags (hardened in v1.10.0).** The app's own cookies
  (`a2r_active_org`, `a2r_lens`, `a2r_ops_elevation`, `a2r_impersonation`)
  are `httpOnly` + `secure` (production) + `sameSite: 'strict'`. The
  NextAuth session and CSRF cookies are pinned in `authOptions.cookies`
  (`httpOnly`, `secure`-aware); the session cookie is deliberately
  `sameSite: 'lax'` — `Strict` would drop it on a top-level navigation into
  the app from an external link, and `Lax` still blocks the cross-site
  POST that CSRF exploits.
- **Forced-rotation enforcement is server-deep (new in v1.7.0).** A session
  flagged `mustChangePassword` is rejected with `403 PASSWORD_CHANGE_REQUIRED`
  in **every** server-action and route-handler auth path — not only the
  middleware redirect — so a script holding a temp-password session cannot
  bypass the UI to invoke actions or APIs directly.
- Enterprise SSO IdP secrets (the OIDC client secret) are AES-256-GCM
  encrypted at rest with a key derived from `NEXTAUTH_SECRET` (see §8);
  the plaintext is never returned to a client — only a fingerprint.

**Roadmap:** HMAC (keyed with a server-side pepper) for API-key hashes;
application-level (column) encryption for the most sensitive fields (contractor
cost rates, resource PII) via a managed KMS; the live SSO (SAML/OIDC) IdP
handshake (configuration, verification and JIT ship in v1.2.0 — §8) and SCIM
provisioning; MFA.
_(Server-side session revocation / "sign out everywhere" shipped in v1.7.0 —
see the `sessionVersion` bullet above.)_

---

## 3. Data-at-rest and data-in-transit

### In transit

- All application traffic is HTTPS (TLS terminated at the platform/CDN edge).
- **Database connections require TLS.** The production `DATABASE_URL` must carry
  `sslmode=require` (or stricter — `verify-full` with a CA bundle). Prisma takes
  its TLS configuration from the connection string; `src/lib/db.ts` emits a
  loud, structured warning at startup in production if `sslmode` is absent and
  the host is not loopback, so a misconfiguration is visible immediately rather
  than silently running an unencrypted channel. See `.env.example`.

### At rest

- The database is managed PostgreSQL (Supabase). The provider encrypts data
  volumes at rest by default.
- Backups are the responsibility of the managed-database provider and follow
  its encryption and retention guarantees.
- The application stores **no customer files on local disk**. Data exports and
  workspace snapshots exist only as the HTTP response payload and whatever the
  downloading user does with the file.

### HTTP response hardening

Applied to every route (`next.config.mjs`):

| Header | Value |
| --- | --- |
| `X-Frame-Options` | `DENY` |
| `Content-Security-Policy` | `frame-ancestors 'none'` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |

HSTS is applied at the platform/CDN layer. **Roadmap:** a full script/style/
connect Content-Security-Policy allow-list.

### Abuse protection

A true sliding-window rate limiter guards the high-risk and
resource-intensive boundaries. **As of v1.8.0 it can be backed by a shared
store:** with `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` set,
every limit is enforced as **one atomic global window** (a single
server-side Lua script) consistent across all serverless instances; unset,
it uses the in-process limiter (behind multiple instances each enforces a
proportional share) — a deliberate, accepted posture for a deployment that
does not run Upstash. **Where Upstash *is* configured, production fails
closed on failure:** a Redis call that throws **denies** the request (`429`)
and alerts observability at `error` level, rather than silently degrading to
per-instance limiting. (A completely absent backend still falls back
cleanly, noted once at `info`; non-production always falls back.) The escape
hatch `RL_ALLOW_INPROCESS_FALLBACK=1` restores the fall-back after a
configured-Redis failure for a sustained outage (per-instance limiting only,
reported once at `warning`). Every limit is overridable per environment
(`RL_<NAME>_LIMIT`); `X-RateLimit-Limit / -Remaining / -Reset` headers are
returned on the **allowed** response, not only the `429` (which also carries
`Retry-After`). Defaults:

| Boundary | Default | Key |
| --- | --- | --- |
| Credentials sign-in | 10 / min | client IP |
| Public tenant registration | 5 / 15 min | client IP |
| Password change | 5 / 10 min | user |
| AI document parser (paid LLM calls) | 10 / min | user |
| Bulk exports — portfolio CSV, project JSON | 30 / 5 min | user |
| Print-document generation — SteerCo deck, audit certificate | 30 / min | user |
| Intake CSV template downloads | 60 / min | user |
| Self-service batch import (stage / commit / correct) | 20 / min | user |
| Workspace snapshot export / restore | 5 / 10 min | user |
| Data Ingestion API (`/api/v1`) | 60 / min | API key |

Request bodies on the ingestion and document-parser endpoints are size-capped
(a `Content-Length` is required and enforced) before the body is read. See
`docs/OBSERVABILITY.md` for the full table and the wiring.

---

## 4. Immutable Compliance Ledger (tamper-evident audit logging)

The highest-consequence governance actions are recorded in a
**hash-chained, append-only ledger** (`ImmutableAuditLedger`), designed to
support a SOC 2 audit trail.

- **Chain construction.** Each row's `currentHash` is
  `SHA-256(canonical_json(row_fields) ++ previous_row.currentHash)`. Any
  after-the-fact edit, deletion, or reordering of a row breaks every hash
  downstream of it.
- **Verification.** `verifyLedgerIntegrity(organizationId)` walks a tenant's
  chain oldest-to-newest, re-derives every hash, and reports the position of
  the first break. The `/admin/audit-log` view shows a live
  **"Ledger Integrity: Verified"** badge and the chain-head fingerprint.
- **Single writer, no mutation path.** `recordLedgerEvent` is the only code that
  writes the ledger; no update or delete path for these rows exists anywhere in
  the application.
- **Immutable at the database engine (v1.13.0, migration 21).** Beyond
  convention: the restricted runtime role `a2r_app` holds `SELECT` + `INSERT`
  only — `UPDATE` and `DELETE` are `REVOKE`d — and a `BEFORE UPDATE OR
  DELETE` row trigger plus a `BEFORE TRUNCATE` statement trigger reject the
  operation for **every** role. The sole bypass is a deliberate,
  transaction-local `SET LOCAL "a2r.ledger_admin" = 'on'`, reserved for
  lawful GDPR/CCPA data-subject erasure performed by an operator over
  `DIRECT_URL`; `a2r_app` can never use it (a `current_user` guard plus the
  revoked grant). `scripts/rls-smoke.ts` checks 9–10 and
  `tests/security/ledger-immutability.test.ts` prove the rejection directly
  in SQL.
- **Fork-safe under concurrency (REL-3).** Appends take a per-tenant Postgres
  advisory lock and a `@@unique` constraint pins each chain link, so parallel
  writers cannot branch the chain. A live-database test asserts the chain stays
  valid under parallel-append pressure.
- **Survives tenant deletion.** The ledger's foreign key to `Organization` is
  `ON DELETE RESTRICT` — a tenant record cannot be hard-deleted while its
  compliance history exists. The retention sweep (§7) never touches the ledger.

Recorded action types include: baseline / stage-gate overrides, security- and
role-policy changes, holiday-calendar changes, tenant lifecycle changes,
workspace restores, **admin impersonation access**, **tenant data export**,
**tenant purge execution**, and **API key issuance / revocation**.

A second, non-chained governance trail (`AuditLog`) captures structured
before/after snapshots of critical project state changes (baseline lock/unlock,
EAC updates, RAID escalation, control-status changes, bulk imports).

---

## 5. Enterprise impersonation controls ("View As")

A2R support staff can enter a customer workspace for troubleshooting under
strict, auditable constraints:

- **Read-only.** Impersonation grants set `readOnly: true`. A global write guard
  (`writeBlockReason`) blocks every mutation in the tenant for the duration of
  the session, regardless of role.
- **Time-boxed.** Grants expire 20 minutes after creation
  (`IMPERSONATION_TTL_MINUTES`). Expiry is enforced on every request that
  resolves the session.
- **Explicit and reasoned.** The operator must type a free-text reason, which is
  stored on the grant and in the ledger entry.
- **Audited before it starts.** Starting a session writes an
  `ADMIN_IMPERSONATION_ACCESS` event to *the customer's* Immutable Compliance
  Ledger — including operator identity and reason — before the session cookie
  is set.
- **Cookie hygiene.** The grant token is a 32-byte CSPRNG value (SHA-256
  hashed at rest, v1.8.0) carried in an `httpOnly`, `secure` (production),
  `sameSite: 'strict'`, path-scoped cookie that expires with the grant.
- **Cannot target a purged tenant.** Resolution fails closed if the grant is
  ended, expired, or the organization is soft-deleted.
- Customers see a persistent banner in their workspace for the entire session.

---

## 6. Data sovereignty & offboarding

### Cryptographic data export

An operator (with type-the-tenant-name confirmation) can generate a portable
JSON bundle of everything a tenant owns — projects and baselines, roster,
governance configuration, the activity feed, the audit trail, and the full
compliance ledger. The bundle's manifest carries a **SHA-256 digest of its own
canonical contents**, so a recipient can re-hash the payload and confirm nothing
was altered in transit. Password hashes and any cross-tenant data are excluded.
The export writes a `TENANT_DATA_EXPORT` ledger event.

### Purge Protocol (soft delete)

Offboarding is a **reversible-by-DBA soft delete**, not an immediate wipe:

1. `Organization.purgedAt` is stamped and the tenant is forced to `SUSPENDED`.
2. Any live impersonation grants are ended.
3. A final pre-purge export snapshot is taken for tamper-evidence.
4. A `TENANT_PURGE_EXECUTED` ledger event is written.
5. A self-sealed **Certificate of Destruction** is returned — a JSON document
   whose `certificateHash` is a SHA-256 over its own contents, including the
   final snapshot digest and record counts.

The tenant disappears from every operator and customer surface immediately;
underlying rows are retained for a defined recovery window. A **Grace Period**
lifecycle state (`GRACE_PERIOD`) provides a read-only wind-down before
suspension where required.

**Roadmap:** an automated post-retention hard-delete (crypto-shred) that runs
after the recovery window; per-data-subject erasure for GDPR/CCPA Article 17
requests.

---

## 7. Data retention

High-volume, non-authoritative records are swept on a configurable schedule by
`src/server/services/data-retention.ts`. It **deletes whole rows past a
retention window and never edits a row**, and it **never touches**:

- the Immutable Compliance Ledger or timesheet records;
- **the operator-access history — `StaffGrant`, `StaffElevation`,
  `ImpersonationGrant` (v1.11.0 removed `ImpersonationGrant` from the
  sweep).** These are retained indefinitely for compliance; the ledger's
  `ADMIN_IMPERSONATION_ACCESS` / `STAFF_*` entries are the permanent,
  tamper-evident record.

| Record class | Default window | Env override |
| --- | --- | --- |
| `ActivityLogEntry` (activity feed) | 730 days (24 months) | `RETENTION_ACTIVITY_LOG_DAYS` |
| `AuditLog` (governance trail) | 2555 days (~7 years) | `RETENTION_AUDIT_LOG_DAYS` |
| `ApiKey` (revoked / long-expired) | 365 days (12 months) | `RETENTION_API_KEY_DAYS` |

- Any window shorter than 30 days, or a non-numeric value, is ignored — a
  configuration typo cannot shorten retention dangerously.
- The sweep **defaults to a dry run** (counts only); deletion is opt-in.
- Deletions run in bounded batches to cap database lock duration; one target
  failing does not abort the others.
- Triggered by `npm run retention:sweep [-- --apply]` or by
  `POST /api/internal/retention`, which authenticates with a shared secret
  (`RETENTION_API_TOKEN`, for a cron scheduler) or an A2R staff session, and is
  rate-limited.
- **Cascade protection (v1.11.0).** `staff_grants.userId`,
  `staff_elevations.userId` and `impersonation_grants.organizationId` are
  `ON DELETE RESTRICT` — a raw `DELETE` of the user or organization is
  refused while any history row exists, so a cascade can never destroy the
  operator-access trail (the same posture the audit tables have carried
  since CMP-1). Normal lifecycle is unaffected (revoke / end / the soft
  Purge Protocol). Per-subject GDPR erasure for an operator is an in-place
  anonymise of the `users` row, not a hard delete.

---

## 8. Role-based access control & data masking

- **RBAC matrix.** Project edit authority (`canEditProject`) and tenant-wide
  admin capabilities (`hasPermission`) are evaluated from the caller's effective
  `DeliveryAccessRole`. A single global write guard also enforces
  impersonation-readonly and grace-period-readonly.
- **RBAC Master Matrix — navigation & route enforcement.** A single source
  of truth (`src/lib/governance/rbacMatrix.ts`) maps each of five personas
  (mapped 1:1 onto the real `DeliveryAccessRole`) to the sidebar groups,
  per-engagement module pills, and route prefixes it may reach. Unauthorized
  items are **omitted from rendering**, not merely disabled, in the
  Sidebar and every `ModuleTabs`/`ModuleNav` surface; `src/middleware.ts`
  independently blocks/redirects a direct navigation to a route the same
  matrix disallows for the signed-in session's real role, as defence in
  depth alongside (never instead of) the server-side authorization above.
  An Ops-Console-only "Persona Preview" lets an A2R operator preview a
  tenant's navigation as a given persona ahead of a demo — display-only,
  backed by client-side state the server never reads, and incapable of
  granting access a real session doesn't already have.
- **Role-Based Scoped Filtering — data-row enforcement.** A third, distinct
  axis from the two above: not what a role may *edit* (RBAC matrix) and not
  what a role may *navigate to* (RBAC Master Matrix), but which *rows* a
  scoped role's queries return at all. `src/lib/scoping.ts` classifies every
  role as **global** (ADMIN, VP_EXECUTIVE — the org's VPs, PMO Heads, and PS
  Ops leads) or **practice-scoped**: PRACTICE_DIRECTOR is confined to their
  `practiceId`'s projects and resource roster, DELIVERY_MANAGER to their
  direct reports, and PROJECT_MANAGER to their own assignments.
  `getScopedProjectWhere`/`getScopedResourceWhere` build the identical
  predicate as Prisma `where` clauses (kept in the same file as the
  DB-free `isProjectInScope`/`isResourceInScope` checks so the two can
  never drift apart), applied at the Control Tower, Resource & Capacity
  Cockpit, Financial Realization, RAID Cockpit, Commercial Baseline,
  Control Audit, and Schedule & Milestones project pickers. A
  practice-scoped role with no matching rows resolves to a fail-closed
  empty result set, never an unscoped fallback.
- **Custom KPI Definition Engine.** `/admin/kpis` lets an Admin bind a
  curated metric (never an arbitrary formula) from Financial Realization,
  Schedule & Milestones, RAID Cockpit, or Resource & Capacity to a target
  persona set; the resulting card renders on the Control Tower and
  Executive Hub. Authoring is gated on `admin:governance`
  (`listCustomKpis`/create/update/delete). The read path that decides
  whether a *viewer* sees a given card, `getVisibleCustomKpis`, is
  deliberately **ungated** — gating it would incorrectly hide a KPI card
  from the very non-admin personas an Admin assigned it to; the security
  boundary sits on who can define or change a KPI, not on who can see one
  already published to their persona.
- **Financial data masking.** Sensitive financial values are tiered by role:
  - `full` (ADMIN) — everything, including raw contractor cost rates;
  - `summary` (VP_EXECUTIVE, PRACTICE_DIRECTOR) — blended margins and EAC;
  - `restricted` (DELIVERY_MANAGER, PROJECT_MANAGER) — no cost or margin data.
  Masked values render with an explicit "restricted" indicator rather than
  silently disappearing. Server actions strip the sensitive numbers out of
  the payload for a `restricted` viewer, not just decline to render them.
- **Enterprise Governance override (Hybrid Configuration Model).** Each
  tenant selects a compliance template (Standard / Strict Financial
  Governance / Agile Delivery / Board-Only) and Layer-2 overrides. Two
  controls are security-relevant: **route visibility** removes modules
  from navigation, and **`maskFinancialsForDelivery`** pushes the
  `summary` tier (Practice Director) down to `restricted` on top of the
  role tiers above. The resolved config rides on the request context, and
  every change is written to the Compliance Ledger
  (`GOVERNANCE_CONFIG_CHANGE`).
- **Enterprise SSO / identity federation.** One SAML 2.0 or OIDC IdP per
  tenant (Entra ID / Okta / Google Workspace presets). OIDC client secrets
  are **AES-256-GCM encrypted at rest** (key derived from
  `NEXTAUTH_SECRET`); the UI only ever shows a fingerprint. IdP metadata is
  parsed and pinned on an explicit **verify** step; federation cannot be
  enabled without it. When SSO is **enforced** for an email domain,
  password sign-in for that domain is refused at the NextAuth `signIn`
  callback. Just-in-time provisioning maps IdP security-group claims to a
  delivery + console role (case-insensitive, lowest-priority-wins);
  **admin-assigned roles are never overwritten by JIT**, and every
  provisioning event is ledgered (`SSO_CONFIG_CHANGE`, `SSO_JIT_PROVISION`).
  The live IdP handshake (redirect, assertion signature validation) is a
  follow-on; `applyFederatedLogin()` is the integration seam.

---

## 9. Application security practices

- **Input validation.** Every server action and API route validates its input
  with Zod (`safeParse`) and returns typed, non-throwing result objects for
  expected failures. **As of v1.10.0 every request-input schema is
  `z.strictObject` (`.strict()`)** — an unexpected property is a validation
  failure, not a silently-dropped field. This closes the mass-assignment
  surface, most importantly the Workspace Restore snapshot, which writes
  attacker-influenceable JSON into ~10 models. (The CSV row schemas in
  `src/lib/ingestion/**` are deliberately non-strict — a spreadsheet may
  carry extra columns — but already whitelist the fields they read.)
- **Serverless connection pooling (v1.10.0).** `src/lib/db.ts`'s
  `assertServerlessPooling()` emits a loud production warning (Vercel only)
  when `DATABASE_URL` is not a pooler host carrying `connection_limit`, so a
  mistuned deploy that could exhaust Postgres connections shows up in logs
  immediately (same posture as the TLS check).
- **Error sanitization.** `withAction` / `withRouteHandler` / `withApiAuth`
  turn any unhandled throw into one structured, secret-redacted log line and
  a generic client message — never a stack or a driver/Prisma error.
  `tests/security/error-sanitization.test.ts` fails the build if any handler
  is unwrapped or would interpolate a caught error into a response body.
- **CSRF / CORS.** Server Actions carry Next.js's built-in Origin/Host check;
  NextAuth issues its own CSRF token for auth routes; requests are same-origin
  by default. The Data Ingestion API is **server-to-server only** — it emits no
  `Access-Control-Allow-Origin`, so a browser cross-origin call cannot read its
  responses, and `OPTIONS` returns `405`.
- **Output encoding.** React escapes all rendered values by default.
- **Error handling.** Unhandled errors are caught by application error
  boundaries (branded recovery screens, not stack traces) and routed to a
  central reporting utility (`src/lib/observability.ts`), which emits structured
  JSON today and has a documented integration point for Sentry. **As of v1.7.0
  a centralized server-side boundary** (`withAction` / `withRouteHandler`)
  wraps every mutation server action and the download / report API routes: an
  unhandled exception or database timeout is captured as **one structured,
  secret-redacted log line** (`redactContext` scrubs any `password` / `token` /
  `secret` / `hash` / `authorization` key, recursively) and returned to the
  caller as a **safe generic error**, never an opaque 500 with a leaked stack
  or digest. Next.js control-flow signals (`redirect` / `notFound` / the
  static-generation bailout) still propagate untouched. See
  `docs/OBSERVABILITY.md`.
- **Environment isolation guardrail (v1.7.0).** The build, the server boot,
  and the Prisma client each hard-fail if a Vercel Preview / Development
  deployment is wired to the production database — a mis-scoped preview
  deploy cannot ship or serve traffic. See
  `docs/PREVIEW_ENVIRONMENT_ISOLATION.md`.
- **Front-door routing is server-only (v1.7.0).** `A2R_SITE_MODE`
  (`marketing | internal | live`) is a strict, fail-closed enum read at
  request time in the Edge middleware — never a `NEXT_PUBLIC_*` value in the
  browser or the build artifact. An unknown / missing value in a production
  build fails the deployment; at runtime it falls back to the marketing
  page, never "show the internal app". See `docs/SITE_ROUTING_MODEL.md`.
- **Health checks.** `GET /api/health` (liveness) and `GET /api/health/ready`
  (readiness — a 2-second-bounded database probe) support external monitoring
  and deploy gating.
- **Public unauthenticated endpoints.** The only write path reachable
  without a session is the "Coming Soon" page's early-access form
  (`submitEarlyAccessLead`): Zod-validated, a hidden honeypot field drops
  naive bots, and it is rate-limited to 5 submissions per 10 minutes per
  client IP. It touches no tenant data and performs no database write —
  the lead is emitted as a single structured log line only. Every other
  server action calls `requireOrgContext()` / `requireOpsContext()`.
- **Self-Service Batch Import Engine.** Gated on the tenant-admin-only
  `admin:ingestion` permission — a single uploaded file can reference many
  projects at once, bypassing the usual per-project edit scope, so it sits
  on the same authority tier as Workspace Backup & Restore rather than
  being opened to every delivery role. Four intake pillars share one
  validation/commit pipeline: Weekly Actuals, Milestone & Progress
  Updates, Forecast & EAC Updates, and Status Reports & RAID Log. A
  staged row is never trusted from the client: every row is re-validated
  against this org's live projects and roster on stage, on every inline
  correction, and again — from scratch — immediately before commit.
  Commit is all-or-nothing inside one transaction: **no batch partially
  lands** while any row still errors. A successful commit is written to
  both the general Audit Trail and the hash-chained Compliance Ledger
  (`BATCH_IMPORT_COMMITTED`).

---

## 10. Testing & verification

> **Test databases (v1.14.0).** The DB-integration suites and the Playwright
> suite **mutate** data — they refuse to run against production.
> `tests/setup.ts` / `e2e/global-setup.ts` resolve the target from
> `TEST_DATABASE_URL` → `.env.test` → `.env` and stop if it is the production
> project (`A2R_ALLOW_PROD_TESTS=1` is a documented single-machine
> break-glass). Production acceptance is **`npm run db:rls:verify`**
> (`scripts/rls-prod-verify.ts`) — `pg_catalog` / `information_schema`
> SELECTs only, **zero DML**: it re-asserts the `a2r_app` role attributes,
> every `tenant_isolation` / `rls_deny_app` policy, the ledger triggers +
> grant revocation, and that every intra-tenant FK is composite.

- **625** unit tests (Vitest, 53 files) covering the calculation engine and
  its **exact-decimal precision proofs** (`calculations-precision.test.ts` —
  no float drift accumulating a 400-cell matrix / a 150-project portfolio / a
  60-row EAC), data
  masking (incl. the org governance override), API-key crypto, the bearer-token
  hash primitives, the in-process **and** distributed (Upstash) rate limiter
  and its named-rule table, direct-SQL RLS enforcement for the `a2r_app`
  role, engine-level ledger immutability, the tenant-model inventory
  schema-drift guard, JIT staff-elevation step-up + session binding, the
  centralized error boundary
  (`withAction` / `withRouteHandler` / `redactContext`), tenant lifecycle,
  retention policy logic, the session state machine (every transition +
  fail-closed path), JIT staff elevation, the command-center resolver, the
  ⌘K palette, the platform-pulse and SteerCo briefing composers, the
  workspace-lens resolver, the governance Hybrid Configuration Model,
  identity-federation secret crypto / IdP-metadata parsing / security-group
  mapping / JIT provisioning, version/changelog governance, the RBAC Master
  Matrix, Role-Based Scoped Filtering, the password-strength policy, the DAL
  fail-closed gates, the Custom KPI Definition Engine's calculation/validation
  logic, and the Self-Service Batch Import Engine's four-pillar schema
  validators and CSV/Excel reader.
- Live-database security suites (`tests/security/*`) that assert cross-tenant
  `organizationId` scoping (including the composite-key child models —
  read → null, update → `P2025`, cross-tenant create → refused), that the
  compliance ledger keeps a valid tamper-evident hash chain under
  parallel-append pressure (REL-3), the rate-limit endpoints (served to the
  limit then `429` with headers), the password-rotation / all-device
  logout flow, the DB-level RLS enforcement checks (`rls-policies.test.ts` +
  the 10-check `rls-smoke` matrix, staging/local only — v1.14.0), engine-level
  ledger immutability (`ledger-immutability.test.ts` — `UPDATE`/`DELETE`
  rejected for `a2r_app` and, without the maintenance opt-in, for the owner),
  and the JIT elevation flow (wrong password → refused, session-epoch bump →
  every elevation dead).
- **60** end-to-end tests (Playwright, Suites A–P) covering authentication,
  multi-tenant scoping, governance workflows, the capacity cockpit, the
  compliance ledger, data masking, role-based landing/perspective switching,
  the tenant/data-sovereignty engine, practice-level scoped filtering, the
  Custom KPI Builder, the server-only site-routing model (M), the
  restricted-session state machine — a live session is logged out and blocked
  the instant its `sessionVersion` is bumped (N), DAL tenant isolation at the
  HTTP boundary (O), and the JIT staff-elevation lifecycle (P). Self-cleaning
  teardown.
- TypeScript strict compilation (`tsc --noEmit`) and a clean `next build` are
  part of the verification gate for every change.

---

## 11. Compliance posture

| Item | Status |
| --- | --- |
| Tamper-evident audit logging | **Implemented** (§4) — hash chain + **engine-level immutability** (v1.13.0, migration 21) |
| Logical multi-tenant isolation | **Implemented** (§1) — three app-tier layers + **complete composite tenant FKs** (v1.8.0 migration 14, v1.13.0 migration 22) |
| DB-level Row Level Security for the application's own queries | **Enforced on staging** (§1) — v1.9.0; **staged on production** — migrations 16/17/20/21/22 applied + verified, awaiting the `RLS_ENFORCE=1` flip (`docs/RLS_ENFORCEMENT_RUNBOOK.md`) |
| Least-privilege runtime database role (no superuser / no RLS bypass) | **Enforced on staging** (§1) — v1.9.0, `a2r_app` (`NOLOGIN` since v1.12.0) |
| Identity/routing tables unreachable by the tenant runtime | **Implemented** (§1) — v1.12.0, migration 20 `rls_deny_app` |
| RLS rollback lever | **Deliberate, not instant** (§1) — v1.13.0: unset `RLS_ENFORCE` + redeploy. The fast global break-glass was removed after review. |
| Bearer tokens hashed at rest (elevation / impersonation / API keys) | **Implemented** (§1) — v1.8.0 |
| Distributed rate limiting (atomic across instances) | **Implemented** (§9) — v1.8.0, opt-in via Upstash |
| Mass-assignment protection (strict request schemas) | **Implemented** (§9) — v1.10.0 |
| Explicit global sign-out + hardened cookie flags | **Implemented** (§2) — v1.10.0 |
| Exact financial precision (money / rates as `NUMERIC`, not float) | **Implemented** — v1.11.0 (columns, migration 18); v1.14.0 (**exact-decimal arithmetic through the calc engine**, defined rounding at accounting boundaries) |
| Step-up authentication for privileged operator actions | **Implemented** (§1) — v1.14.0: password re-verification + `sessionVersion` binding on every JIT elevation |
| Test suites isolated from production | **Implemented** (§10) — v1.14.0: DB-integration + Playwright refuse a prod URL; prod acceptance is read-only |
| Security-history preserved on delete (FK `RESTRICT`) | **Implemented** (§7) — v1.11.0, migration 19 |
| Just-In-Time privileged access (no standing operator sessions) | **Implemented** (§1) — v1.7.0 |
| Server-side session revocation / all-device logout | **Implemented** (§2) — v1.7.0, explicit "all sessions" v1.10.0 |
| Structured error capture + advanced rate limiting | **Implemented** (§3, §9) — v1.7.0 |
| Encryption in transit (app + DB) | **Implemented** (§3) |
| Encryption at rest (DB volumes) | **Provided by managed-DB provider** (§3) |
| Data export & portability | **Implemented** (§6) |
| Data retention policy & automation | **Implemented** (§7) |
| Audited, read-only support access | **Implemented** (§5) |
| SOC 2 Type II attestation | **Roadmap** — the controls above are designed toward it |
| Formal DPA, sub-processor list, RoPA | **Roadmap** |
| Enterprise SSO configuration (SAML/OIDC) + JIT provisioning | **Implemented** (§8) — live IdP handshake follow-on |
| Per-tenant governance framework (compliance templates + masking) | **Implemented** (§8) |
| SCIM / MFA | **Roadmap** |
| Penetration test | **Roadmap** — this document reflects internal review only |

---

## 12. Reporting a vulnerability

Email **security@a2rventures.com** with a description of the issue and steps to
reproduce. Please do not open public issues for security reports, and allow
reasonable time for a fix before any disclosure.
