# Tenant-model inventory & tenant-crossing audit

_Status: current as of **v1.13.0** (WP1). Companion to `docs/RLS_ROADMAP.md`
and `docs/DATA_ACCESS_LAYER.md`. Audience: engineering + the security auditor._

Every Prisma model, its tenant binding, and how a tenant boundary is
enforced for it at the **database** layer (on top of the three application
-tier layers in `docs/RLS_ROADMAP.md` §1). The goal of this page: **zero
tenant-crossing gaps** — no path by which one tenant's request can read or
write another tenant's row.

`prisma/schema.prisma` has **38 models**: **9 identity / routing** + **28
tenant-owned** + **1 post-RLS platform** (`OperatorMfa` — see Group 1b).
`tests/security/tenant-model-inventory.test.ts` parses the schema and fails
if a new model with an `organizationId` field is not classified here, or if
the 9 / 28 / 38 counts drift.

---

## Group 1 — Identity / routing (9)

A user spans organizations; `Membership` / `Organization` are how "which
tenant" is decided in the first place; `StaffGrant` / `StaffElevation` /
`ImpersonationGrant` are platform-operator state, not tenant data. These are
never auto-scoped (`UNSCOPED_MODELS` in `src/lib/db/org-scope.ts`) and — as
of migration 20 — carry the **`rls_deny_app`** policy: the restricted
`a2r_app` role has **no** access. Every legitimate reader/writer (NextAuth,
the `/ops` console via `setAdminScope`, tenant provisioning + SSO JIT via
`runUnscoped`, session bootstrap, `signOutEverywhereAction` /
`changePasswordAction` via `runUnscoped`) runs as `postgres`.

| Model | Table | Bound to | Org FK `onDelete` | DB policy for `a2r_app` |
| --- | --- | --- | --- | --- |
| `User` | `users` | — (spans orgs) | n/a | `rls_deny_app` |
| `Account` | `accounts` | `User` (Cascade) | n/a | `rls_deny_app` |
| `Session` | `sessions` | `User` (Cascade) | n/a | `rls_deny_app` |
| `VerificationToken` | `verification_tokens` | — | n/a | `rls_deny_app` |
| `Membership` | `memberships` | `User` + `Organization` | **Cascade** | `rls_deny_app` |
| `Organization` | `organizations` | — (is the tenant) | n/a | `rls_deny_app` |
| `StaffGrant` | `staff_grants` | `User` (**Restrict** — v1.11.0) | n/a | `rls_deny_app` |
| `StaffElevation` | `staff_elevations` | `User` (**Restrict** — v1.11.0) | n/a | `rls_deny_app` |
| `ImpersonationGrant` | `impersonation_grants` | `Organization` (**Restrict** — v1.11.0) | Restrict | `rls_deny_app` |

(The `_rls_control` break-glass table from migration 20 was **dropped** in
migration 21 — the global break-glass was removed in v1.13.0; emergency
rollback is `RLS_ENFORCE` unset + redeploy.)

---

## Group 1b — Post-RLS platform (1)

Added after the RLS baseline (migrations 16/17), so not part of the
migration-17 plumbing group. Not tenant data — no `organizationId`, in
`UNSCOPED_MODELS`, and the `a2r_app` runtime role never reaches it (every
operator path runs under `setAdminScope` / `postgres`).

| Model | Table | Bound to | Purpose |
| --- | --- | --- | --- |
| `OperatorMfa` | `operator_mfa` | `User` (Cascade) | Batch 2 — the operator's TOTP second factor for JIT elevation (`secretCiphertext` AES-256-GCM sealed; `recoveryCodeHashes` SHA-256). Migration 24. |

---

## Group 2 — Tenant-owned (28)

Each has its **own `organizationId` scalar column** + `@@index([organizationId])`
and the migration-17 **`tenant_isolation`** policy
(`organizationId = current_setting('app.current_org', true)`, fail-closed on
NULL) for `a2r_app`. All are in `DIRECT_ORG_MODELS` and in
`scripts/rls-smoke.ts` `TENANT_TABLES`. These three lists are identical (28).

### 2a — Own org FK, no composite parent (17)

| Model | Table | Org FK `onDelete` | Notes |
| --- | --- | --- | --- |
| `OrgPolicy` | `org_policies` | Cascade | `@@unique` org (1:1) |
| `GovernanceConfig` | `governance_configs` | Cascade | 1:1 |
| `IdentityProvider` | `identity_providers` | Cascade | 1:1 |
| `SsoGroupMapping` | `sso_group_mappings` | — (no own org FK) | composite FK to `IdentityProvider` **and** `Practice` (WP1); deleted via `identity_providers` cascade |
| `ControlLabel` | `control_labels` | Cascade | `@@unique([organizationId, controlKey])` |
| `Practice` | `practices` | Cascade | |
| `DeliveryRole` | `delivery_roles` | Cascade | `@@index([organizationId])`; `billRate`/`costRate` NUMERIC (v1.11.0) |
| `Resource` | `resources` | Cascade | `@@unique([organizationId, userId])` |
| `ApiKey` | `api_keys` | Cascade | bearer-token hash (v1.8.0) |
| `OrganizationHoliday` | `organization_holidays` | Cascade | `@@unique([organizationId, date])` |
| `RoleUtilizationPolicy` | `role_utilization_policies` | Cascade | `@@unique([organizationId, roleName])` |
| `Project` | `projects` | Cascade | **`@@unique([organizationId, id])`** — the composite-FK anchor |
| `CustomKpi` | `custom_kpis` | Cascade | `targetValue`/`warningValue` NUMERIC (v1.11.0) |
| `DataImportBatch` | `data_import_batches` | Cascade | **`@@unique([organizationId, id])`** — anchor for `DataImportRow` |
| `ActivityLogEntry` | `activity_log_entries` | **Restrict** | governance history (CMP-1); user FK `SetNull` |
| `AuditLog` | `audit_logs` | **Restrict** | user FK `SetNull` |
| `ImmutableAuditLedger` | `immutable_audit_ledger` | **Restrict** | hash-chained; `actorId` is a plain string, no FK; **engine-immutable** — `a2r_app` has no `UPDATE`/`DELETE` grant + a `BEFORE UPDATE/DELETE/TRUNCATE` trigger rejects every role (migration 21) except a deliberate `SET LOCAL "a2r.ledger_admin" = 'on'` opt-in |

### 2b — Own org FK **and** composite FK to a tenant parent (WP1: 22)

Each carries **both** an own `organizationId` scalar **and** a composite
`@relation(fields: [organizationId, <col>], references: [organizationId, id])`.
The DB rejects a child row whose `(organizationId, <col>)` does not match an
existing parent — so a child cannot be homed to tenant A while pointing at
tenant B's parent, **even with RLS disabled**. Migration 14 (Phase B) did the
11 project/batch children; **migration 22 (WP1) closed the remaining ~11.**

**Parent-delete semantics.** NOT NULL children are `ON DELETE CASCADE`.
Nullable children use the **PG 15+ column-list form `ON DELETE SET NULL
("<col>")`** — only the reference column is nulled, never the row's own
required `organizationId`, so `db.practice/deliveryRole/resource.deleteMany`
and `db.identityProvider.delete` keep working unchanged. Prisma models these
as `onDelete: NoAction` (the DB owns the action; Prisma Client does not
emulate referential actions on Postgres) — a documented divergence.

| Model | Table | Composite parent(s) | Parent FK `onDelete` |
| --- | --- | --- | --- |
| `ProjectContributor` | `project_contributors` | `Project`, **`Resource`** | Cascade, Cascade |
| `ScopeItem` | `scope_items` | `Project` | Cascade |
| `EffortCell` | `effort_cells` | `Project`, **`DeliveryRole`** | Cascade, Cascade |
| `AuditEntry` | `audit_entries` | `Project` | Cascade |
| `RaidEntry` | `raid_entries` | `Project`, **`Resource`** (owner) | Cascade, `SET NULL (ownerId)` |
| `FinancialActual` | `financial_actuals` | `Project`, **`DeliveryRole`** | Cascade, `SET NULL (roleId)` |
| `SchedulePhase` | `schedule_phases` | `Project` | Cascade |
| `SteerCoDecision` | `steerco_decisions` | `Project`, **`Resource`** (owner) | Cascade, `SET NULL (decisionOwnerId)` |
| `WeeklyAssignmentSlot` | `weekly_assignment_slots` | `Project`, **`Resource`** | Cascade, Cascade |
| `TimesheetEntry` | `timesheet_entries` | `Project`, **`Resource`** | Cascade, Cascade |
| `DataImportRow` | `data_import_rows` | `DataImportBatch` | Cascade |
| `DeliveryRole` | `delivery_roles` | **`Practice`** | `SET NULL (practiceId)` |
| `Resource` | `resources` | **`DeliveryRole`, `Practice`, `Resource`** (manager), **`RoleUtilizationPolicy`** | all `SET NULL (<col>)` |
| `Project` | `projects` | **`Resource`** ×3 (PD/DM/PM), **`Practice`**, **`Project`** (parent) | all `SET NULL (<col>)` |
| `SsoGroupMapping` | `sso_group_mappings` | **`IdentityProvider`**, **`Practice`** | Cascade, `SET NULL (practiceId)` |
| `ActivityLogEntry` | `activity_log_entries` | **`Project`** | `SET NULL (projectId)` |
| `AuditLog` | `audit_logs` | **`Project`** | `SET NULL (projectId)` |

Composite-FK targets (`@@unique([organizationId, id])`): `Project`,
`DataImportBatch` (migration 14) + `Practice`, `DeliveryRole`, `Resource`,
`RoleUtilizationPolicy`, `IdentityProvider` (migration 22).

`scripts/rls-smoke.ts` check 7 exercises this at the DB. Migration 22 also
runs a pre-flight that `RAISE`s (rather than silently `SET NULL`-ing) if any
existing row already crosses a tenant — count on apply: **0**.

---

## Group 3 — Known residual, tracked for a later phase

| # | Finding | Risk | Fix |
| --- | --- | --- | --- |
| 1 | **`FORCE ROW LEVEL SECURITY`** is not yet applied, so `postgres` (the app's own connection + the ops path) still bypasses RLS. | Accepted for the cutover — the app-tier layers cover `postgres`; FORCE needs an owner-side BYPASSRLS break-glass role + owner-side policies first. | `docs/RLS_ENFORCEMENT_RUNBOOK.md` step "FORCE". |
| 2 | Prisma `onDelete: NoAction` on the nullable composite FKs diverges from the DB's `SET NULL ("<col>")`. | None at runtime — Prisma Client does not emulate referential actions on Postgres. `prisma migrate diff` would report it. | Cosmetic; revisit if Prisma adds column-list `SetNull` support. |

No other model reads or writes a tenant row without an `organizationId`
predicate: `src/lib/db/org-scope.ts` throws `OrgScopeError` on any tenant
query with no scope, `tests/dal-boundary.test.ts` keeps `@/lib/db` out of
`src/app` / `src/components`, and — under `RLS_ENFORCE=1` — the database
itself returns zero rows for an unscoped tenant query.

---

## Cross-check (must all agree at 28)

- `scripts/rls-smoke.ts` → `TENANT_TABLES` — 28 entries.
- `prisma/migrations/00000000000017_rls_tenant_policies/migration.sql` →
  `tenant_isolation` table array — 28 entries.
- `src/lib/db/org-scope.ts` → `DIRECT_ORG_MODELS` minus `ImpersonationGrant`
  — 28 entries.
- `prisma/schema.prisma` → models with an `organizationId` field, minus the
  9 identity/routing models — 28.
