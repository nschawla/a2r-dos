# A2R Delivery OS — Security & Trust Overview

_Last reviewed: 2026-09-03 · Owner: A2R Ventures Engineering_

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
  parent record. The Prisma schema models `Organization` as the root of every
  tenant aggregate (projects, scope, effort, audit entries, RAID registers,
  financial actuals, schedule, resources, rate card, governance policy,
  activity, audit trail, and the compliance ledger).
- **Queries are `organizationId`-scoped at the source.** Portfolio and detail
  reads resolve the caller's organization from their authenticated session
  (`requireOrgContext`) and filter every query by it. Role-based scoping
  (`getScopedProjectsForUser`) further narrows a project manager to their own
  engagements, a practice director to their practice, and so on — the returned
  row set *is* the authorization boundary.
- **Cross-tenant writes are structurally prevented.** The Data Ingestion API
  (below) re-validates that every `projectId` and `resourceId` in a payload
  belongs to the key's tenant before any write; a foreign reference rejects the
  whole batch.
- **No shared mutable global state** between tenant requests. Rate-limiter and
  in-memory caches are keyed by tenant / principal.

### Platform-operator access (A2R staff)

A separate, non-tenant authorization axis governs the internal Operator Control
Plane (`/ops`). An account is A2R staff only if its `User.isA2rStaff` flag is
set **or** its email is on an `@a2rventures.com` domain. This is checked in
middleware (defence in depth) and authoritatively in every operator route and
server action (`requireOpsContext`). Staff status is unrelated to any tenant
membership role.

---

## 2. Cryptography & credential handling

| Secret | At rest | Notes |
| --- | --- | --- |
| User passwords | **bcrypt**, cost factor 10 | Plaintext never stored or logged. Verification is constant-time (bcrypt). |
| API keys | **SHA-256** of the plaintext; `hashedKey` is unique-indexed | Plaintext is `a2r_live_` + 32 bytes of CSPRNG entropy (`node:crypto randomBytes`), shown **exactly once** at creation. Only a short non-secret prefix (`keyPrefix`) is displayed thereafter. |
| Impersonation grant tokens | random `base64url`, 24 bytes CSPRNG | Single-use, time-boxed (§5). |
| Compliance-ledger row hashes | **SHA-256** chain | See §4. |
| Export / destruction certificates | **SHA-256** payload + self-seal digests | See §6. |

- Constant-time comparison (`node:crypto timingSafeEqual`) is used for hash and
  internal-token checks.
- Session tokens are JWTs signed with `NEXTAUTH_SECRET` (operator-supplied,
  generated via `openssl rand -base64 32`).
- Enterprise SSO IdP secrets (the OIDC client secret) are AES-256-GCM
  encrypted at rest with a key derived from `NEXTAUTH_SECRET` (see §8);
  the plaintext is never returned to a client — only a fingerprint.

**Roadmap:** HMAC (keyed with a server-side pepper) for API-key hashes;
application-level (column) encryption for the most sensitive fields (contractor
cost rates, resource PII) via a managed KMS; the live SSO (SAML/OIDC) IdP
handshake (configuration, verification and JIT ship in v1.2.0 — §8) and SCIM
provisioning; server-side session revocation ("sign out everywhere"); MFA.

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

- **Authentication:** the credentials sign-in endpoint is rate-limited to 10
  attempts per minute per client IP; over-limit requests get `429` with
  `Retry-After`.
- **Data Ingestion API:** 60 requests per minute per API key; request bodies are
  capped (a `Content-Length` is required and must be ≤ 256 KB) before the body
  is read.
- The rate limiter is an in-process sliding window (no external dependency);
  behind multiple instances each enforces a proportional share.

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
- **Cookie hygiene.** The grant token is a 24-byte CSPRNG value carried in an
  `httpOnly`, `sameSite=lax`, path-scoped cookie that expires with the grant.
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
retention window and never edits a row**, and it **never touches the Immutable
Compliance Ledger or timesheet records**.

| Record class | Default window | Env override |
| --- | --- | --- |
| `ActivityLogEntry` (activity feed) | 730 days (24 months) | `RETENTION_ACTIVITY_LOG_DAYS` |
| `AuditLog` (governance trail) | 2555 days (~7 years) | `RETENTION_AUDIT_LOG_DAYS` |
| `ImpersonationGrant` (ended / long-expired) | 545 days (18 months) | `RETENTION_IMPERSONATION_GRANT_DAYS` |
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

---

## 8. Role-based access control & data masking

- **RBAC matrix.** Project edit authority (`canEditProject`) and tenant-wide
  admin capabilities (`hasPermission`) are evaluated from the caller's effective
  `DeliveryAccessRole`. A single global write guard also enforces
  impersonation-readonly and grace-period-readonly.
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
  expected failures.
- **CSRF / CORS.** Server Actions carry Next.js's built-in Origin/Host check;
  NextAuth issues its own CSRF token for auth routes; requests are same-origin
  by default. The Data Ingestion API is **server-to-server only** — it emits no
  `Access-Control-Allow-Origin`, so a browser cross-origin call cannot read its
  responses, and `OPTIONS` returns `405`.
- **Output encoding.** React escapes all rendered values by default.
- **Error handling.** Unhandled errors are caught by application error
  boundaries (branded recovery screens, not stack traces) and routed to a
  central reporting utility (`src/lib/observability.ts`), which emits structured
  JSON today and has a documented integration point for Sentry.
- **Health checks.** `GET /api/health` (liveness) and `GET /api/health/ready`
  (readiness — a 2-second-bounded database probe) support external monitoring
  and deploy gating.

---

## 10. Testing & verification

- **231** unit tests (Vitest) covering the calculation engine, data masking
  (incl. the org governance override), API-key crypto, rate limiter, tenant
  lifecycle, retention policy logic, the command-center resolver, the ⌘K
  palette, the platform-pulse and SteerCo briefing composers, the workspace-lens
  resolver, the governance Hybrid Configuration Model, identity-federation
  secret crypto / IdP-metadata parsing / security-group mapping / JIT
  provisioning, and version/changelog governance.
- **2** live-database security suites (`tests/security/*`) that assert
  cross-tenant `organizationId` scoping and that the compliance ledger keeps a
  valid tamper-evident hash chain under parallel-append pressure (REL-3).
- **30** end-to-end tests (Playwright, Suites A–I) covering authentication,
  multi-tenant scoping, governance workflows, the capacity cockpit, the
  compliance ledger, data masking, and the tenant/data-sovereignty engine, with
  a self-cleaning teardown.
- TypeScript strict compilation (`tsc --noEmit`) is part of the verification
  gate for every change.

---

## 11. Compliance posture

| Item | Status |
| --- | --- |
| Tamper-evident audit logging | **Implemented** (§4) |
| Logical multi-tenant isolation | **Implemented** (§1) |
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
