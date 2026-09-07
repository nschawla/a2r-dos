# Tenant-model inventory & tenant-crossing audit

_Status: current as of **v1.12.0** (Phase 2). Companion to `docs/RLS_ROADMAP.md`
and `docs/DATA_ACCESS_LAYER.md`. Audience: engineering + the security auditor._

Every Prisma model, its tenant binding, and how a tenant boundary is
enforced for it at the **database** layer (on top of the three application
-tier layers in `docs/RLS_ROADMAP.md` §1). The goal of this page: **zero
tenant-crossing gaps** — no path by which one tenant's request can read or
write another tenant's row.

`prisma/schema.prisma` has **37 models**: **9 identity / routing** + **28
tenant-owned**. `tests/security/tenant-model-inventory.test.ts` parses the
schema and fails if a new model with an `organizationId` field is not
classified here, or if the 9 / 28 / 37 counts drift.

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

Non-org control-plane table: **`_rls_control`** (migration 20, not a Prisma
model) — one row, break-glass window. RLS enabled, no `a2r_app` policy ⇒
deny-all; read only on the `postgres` connection by
`src/lib/db/rls-break-glass.ts`.

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
| `SsoGroupMapping` | `sso_group_mappings` | — **(no own org FK)** | see §3 — org column is denormalized; deleted via `identity_providers` cascade |
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
| `ImmutableAuditLedger` | `immutable_audit_ledger` | **Restrict** | hash-chained; `actorId` is a plain string, no FK |

### 2b — Own org FK **and** composite FK to a tenant parent (10 project + 1 batch)

These carry **both** an own `organizationId` scalar **and**
`@relation(fields: [organizationId, projectId], references: [organizationId, id])`
(migration 14). The DB rejects a child row whose `(organizationId, projectId)`
does not match an existing parent — so a child cannot be homed to tenant A
while pointing at tenant B's project even with RLS disabled.

| Model | Table | Composite parent | Parent FK `onDelete` | Org FK `onDelete` |
| --- | --- | --- | --- | --- |
| `ProjectContributor` | `project_contributors` | `Project` | Cascade | Cascade |
| `ScopeItem` | `scope_items` | `Project` | Cascade | Cascade |
| `EffortCell` | `effort_cells` | `Project` | Cascade | Cascade |
| `AuditEntry` | `audit_entries` | `Project` | Cascade | Cascade |
| `RaidEntry` | `raid_entries` | `Project` | Cascade | Cascade |
| `FinancialActual` | `financial_actuals` | `Project` | Cascade | Cascade |
| `SchedulePhase` | `schedule_phases` | `Project` | Cascade | Cascade |
| `SteerCoDecision` | `steerco_decisions` | `Project` | Cascade | Cascade |
| `WeeklyAssignmentSlot` | `weekly_assignment_slots` | `Project` | Cascade | Cascade |
| `TimesheetEntry` | `timesheet_entries` | `Project` | Cascade | Cascade |
| `DataImportRow` | `data_import_rows` | `DataImportBatch` | Cascade | Cascade |

`scripts/rls-smoke.ts` check 7 exercises this at the DB: a `scope_items`
insert scoped to A but pointing at a B project is rejected.

---

## Group 3 — Known residual, tracked for Phase 3

| # | Finding | Risk | Fix |
| --- | --- | --- | --- |
| 1 | **`SsoGroupMapping` has no composite FK** to `IdentityProvider`. Its `organizationId` is a denormalized column; nothing at the DB guarantees `organizationId == identityProvider.organizationId`. | Low. App-tier `applyOrgToCreateData` + the `tenant_isolation` `WITH CHECK` both key on `organizationId`, and JIT provisioning always derives it from the resolved IdP. A hand-crafted Prisma call could still desync the two. | Add `@@unique([organizationId, id])` to `IdentityProvider` + `@relation(fields: [organizationId, identityProviderId], references: [organizationId, id])` on `SsoGroupMapping`, mirroring the project children. |
| 2 | **`FORCE ROW LEVEL SECURITY`** is not yet applied, so `postgres` (the app's own connection + the ops path) still bypasses RLS. | Accepted for the cutover — the app-tier layers cover `postgres`; FORCE needs a break-glass BYPASSRLS role + owner-side policies first. | `docs/RLS_ENFORCEMENT_RUNBOOK.md` step "FORCE". |

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
