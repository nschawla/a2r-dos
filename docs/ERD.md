# Entity Relationship Diagram — A2R Delivery OS

Source of truth is always `prisma/schema.prisma`; this is a reader's map onto
it, current as of **v1.12.0**. See `docs/TENANT_MODEL_INVENTORY.md` for the
full model → tenant-binding → RLS-policy map.
**v1.12.0 (production RLS cutover prep, Phase 2)** — no Prisma-model change.
Migration `00000000000020` (applied to staging **and production**, inert on
production until `RLS_ENFORCE=1`): (a) a new control-plane table
**`_rls_control`** (one row, not a Prisma model) — the break-glass window
read by `src/lib/db/rls-break-glass.ts`; (b) the 9 identity/routing tables
(`users`, `accounts`, `sessions`, `verification_tokens`, `memberships`,
`organizations`, `staff_grants`, `staff_elevations`, `impersonation_grants`)
move from the permissive `rls_app_plumbing` policy to a hard `rls_deny_app`
(`USING (false) WITH CHECK (false)`) for `a2r_app`; (c) `a2r_app` → `NOLOGIN`.
Migrations 16 + 17 (from v1.9.0, staging) are now also **applied to
production** (inert).
**v1.11.0 (data-model integrity, Phase 1)** — (a) **financial precision:**
13 monetary / rate / margin / EAC / BAC columns move `Float` →
`Decimal` (Postgres `NUMERIC`; migration `00000000000018`) —
`DeliveryRole.billRate`/`costRate` `(12,4)`, `Project.bac` / `actualsCost` /
`unscheduledBacklog` / `vac` / `directIntakeTargetRevenue` and
`FinancialActual.cost` `(14,2)`, `Project.contingencyPct` /
`directIntakeBlendedMarginPct` and `OrgPolicy.marginCritPct` `(7,4)`,
`CustomKpi.targetValue` / `warningValue` `(18,6)`. Hours / FTE / utilisation
/ `pctComplete` stay `Float`. (b) **audit-history retention:** three FK
`onDelete` actions become `Restrict` (migration `00000000000019`) —
`StaffGrant.user` → `users`, `StaffElevation.user` → `users`,
`ImpersonationGrant.organization` → `organizations` — so a raw `DELETE` of
the principal is refused while any history row exists (mirrors the CMP-1
`Restrict` on `audit_logs` / `activity_log_entries` /
`immutable_audit_ledger`).
v1.10.0 was payload-validation, session-lifecycle and production-polish
hardening (no schema change). Role-Based Scoped Filtering, the Custom KPI
Definition Engine, the complete 4-pillar Batch Import Engine, forced
first-sign-in password change, and the v1.7.0 security-architecture batch:
`User.sessionVersion` (migration `00000000000011`), **composite tenant
keys** on the 9 child tables — `organizationId` + FK on `audit_entries`,
`effort_cells`, `financial_actuals`, `project_contributors`, `raid_entries`,
`schedule_phases`, `scope_items`, `steerco_decisions`, `data_import_rows`
(migration `00000000000012`), and `staff_elevations` for JIT operator
elevation (migration `00000000000013`)).
**v1.8.0 (Phase B)** adds: **composite foreign keys** —
`projects` / `data_import_batches` gain `@@unique([organizationId, id])` and
all 11 project- / batch-scoped child tables' parent FK becomes composite
`("organizationId", <parentId>)` → `parent("organizationId", "id")`, so the
database rejects a child row whose tenant ≠ its parent's (migration
`00000000000014`); and **hashed bearer tokens** — `StaffElevation.token` and
`ImpersonationGrant.token` become `tokenHash` (SHA-256 only; migration
`00000000000015`).
**v1.9.0 (Phase C)** applies migrations `00000000000016` (the restricted
`a2r_app` role, `NOBYPASSRLS`) and `00000000000017` (`tenant_isolation`
policies on the 28 org-owned tables + `rls_app_plumbing` `USING (true)` on
the 9 identity / tenant-routing tables) **to a dedicated staging database**,
where the app runs with `RLS_ENFORCE=1` — every tenant transaction does
`SET LOCAL ROLE a2r_app` + `SET LOCAL app.current_org`. Production keeps the
app-tier isolation until its own cutover (`docs/RLS_ENFORCEMENT_RUNBOOK.md`).
Regenerate/extend this doc
whenever a schema change adds, removes, or re-relates a model — it should
never drift further than one release behind `schema.prisma`.

**Every** tenant-owned model now carries its own `organizationId` foreign
key (row-level multi-tenancy — enforced at the app tier by
`src/lib/db/org-scope.ts` + `src/lib/dal/`, verified by
`tests/security/tenant-isolation.test.ts`; the DB-level RLS follow-up is
`docs/RLS_ROADMAP.md`); those edges are omitted below where a more specific
relationship already implies the tenant (e.g. a
`Project` belongs to an `Organization`, so everything hanging off `Project`
is transitively tenant-scoped without its own drawn edge).

Postgres **Row Level Security is enabled on every table** with all grants
revoked from the managed provider's web-exposed roles (migration
`00000000000007`). On **production** there are still no policies and the app
connects as the table-owning `BYPASSRLS` role, so this is transparent to
Prisma. On **staging** (v1.9.0) migrations 16 + 17 add the `a2r_app` role +
per-table policies and the app runs with `RLS_ENFORCE=1`. See
`docs/SECURITY.md` § "Database-level access control" and
`docs/RLS_ROADMAP.md`.

## Core schema

```mermaid
erDiagram
    ORGANIZATION ||--o{ MEMBERSHIP : "has"
    ORGANIZATION ||--o{ RESOURCE : "rosters"
    ORGANIZATION ||--o{ PROJECT : "owns"
    ORGANIZATION ||--o{ DELIVERY_ROLE : "rate cards"
    ORGANIZATION ||--o{ PRACTICE : "groups into"
    ORGANIZATION ||--o| GOVERNANCE_CONFIG : "configures"
    ORGANIZATION ||--o| IDENTITY_PROVIDER : "federates via"
    ORGANIZATION ||--o{ API_KEY : "issues"
    ORGANIZATION ||--o{ DATA_IMPORT_BATCH : "stages"
    ORGANIZATION ||--o{ IMMUTABLE_AUDIT_LEDGER : "chains"
    ORGANIZATION ||--o{ AUDIT_LOG : "logs"
    ORGANIZATION ||--o{ ACTIVITY_LOG_ENTRY : "streams"
    ORGANIZATION ||--o{ CUSTOM_KPI : "defines"

    USER ||--o{ MEMBERSHIP : "belongs via"
    USER ||--o| RESOURCE : "logs in as"
    USER ||--o{ DATA_IMPORT_BATCH : "uploads"
    USER ||--o{ CUSTOM_KPI : "authors"

    MEMBERSHIP }o--|| ORGANIZATION : "in"
    MEMBERSHIP {
        string deliveryRole "DeliveryAccessRole — the real RBAC tier"
        string role "MembershipRole (OWNER/ADMIN/MEMBER/VIEWER)"
    }

    RESOURCE ||--o{ EFFORT_CELL : "staffed on (via role)"
    RESOURCE ||--o{ WEEKLY_ASSIGNMENT_SLOT : "logs hours"
    RESOURCE ||--o{ RAID_ENTRY : "owns"
    RESOURCE }o--o| PRACTICE : "sits in"
    RESOURCE }o--o| DELIVERY_ROLE : "rate-carded as"

    PRACTICE ||--o{ RESOURCE : "contains"
    PRACTICE ||--o{ DELIVERY_ROLE : "scopes"

    DELIVERY_ROLE ||--o{ EFFORT_CELL : "priced into"
    DELIVERY_ROLE ||--o{ FINANCIAL_ACTUAL : "actualized against"

    PROJECT ||--o{ EFFORT_CELL : "phase/role matrix"
    PROJECT ||--o{ FINANCIAL_ACTUAL : "actuals"
    PROJECT ||--o{ SCHEDULE_PHASE : "milestones"
    PROJECT ||--o{ RAID_ENTRY : "risks/issues"
    PROJECT ||--o{ AUDIT_ENTRY : "10 controls"
    PROJECT ||--o{ WEEKLY_ASSIGNMENT_SLOT : "weekly capacity"
    PROJECT ||--o{ STEERCO_DECISION : "decisions"
    PROJECT }o--o| PROJECT : "parent program (waves)"

    GOVERNANCE_CONFIG }o--|| ORGANIZATION : "one per tenant"

    IDENTITY_PROVIDER ||--o{ SSO_GROUP_MAPPING : "maps groups to roles"
    IDENTITY_PROVIDER }o--|| ORGANIZATION : "one per tenant"

    DATA_IMPORT_BATCH ||--o{ DATA_IMPORT_ROW : "quarantines"
    DATA_IMPORT_BATCH }o--|| ORGANIZATION : "scoped to"
    DATA_IMPORT_BATCH }o--o| USER : "uploaded by"

    IMMUTABLE_AUDIT_LEDGER }o--|| ORGANIZATION : "hash-chained per tenant"
    AUDIT_LOG }o--o| PROJECT : "may reference"
    ACTIVITY_LOG_ENTRY }o--o| PROJECT : "may reference"

    CUSTOM_KPI }o--|| ORGANIZATION : "scoped to"
    CUSTOM_KPI }o--o| USER : "created by"
    CUSTOM_KPI {
        string dataSource "KpiDataSource — FINANCIALS/SCHEDULE/RAID/CAPACITY"
        string metricKey "free-text key into the KPI_METRICS catalog"
        string formulaType "DIRECT (higher-better) or INVERSE (lower-better)"
        string[] targetPersonas "RbacPersona values this card renders for"
    }
```

## Domain notes

**Identity & access** — `User` is the login; `Membership` is the join row
that puts a `User` into an `Organization` with two *independent* role axes
(`MembershipRole` for tenant-console tier, `DeliveryAccessRole` for the real
delivery-portfolio RBAC enforced by `src/lib/auth/rbac.ts` and
`src/middleware.ts`). A `User` may also link to at most one `Resource` per
org (`Resource.userId`) — the roster/rate-card entry that person shows up as
in staffing, effort, and RAID ownership. `User.mustChangePassword` (added
v1.6.0) forces an operator-provisioned admin to set their own password on
first sign-in. `User.sessionVersion` (v1.7.0, migration
`00000000000011`) is the session-token epoch: `changePasswordAction`
increments it in one transaction, so every token minted earlier fails the
DB-backed check in the NextAuth `jwt` callback and is `REVOKED` — an atomic
all-device logout (`docs/SESSION_STATE_MACHINE.md`).

**Operator control plane** — `StaffGrant` (v1.6.0) is the explicit,
attributed, revocable entitlement that replaced the `@a2rventures.com`
email wildcard; it is now *eligibility* only. `StaffElevation` (v1.7.0,
migration `00000000000013`) is the Just-In-Time grant every mutating
`/ops` action requires — reason-logged, session-bound
(`a2r_ops_elevation` cookie + `userId`), auto-expiring
(`docs/JIT_STAFF_ELEVATION.md`). As of v1.8.0 both `StaffElevation` and
`ImpersonationGrant` persist only `tokenHash` (SHA-256 of the cookie
secret), never the plaintext.

**Delivery spine** — `Project` is the hub every delivery module hangs off:
`EffortCell` (the Phase × Role baseline matrix), `FinancialActual` (realized
hours/cost per role or the `_direct` sentinel), `SchedulePhase` (one row per
delivery phase — status, % complete, actual dates), `RaidEntry`, `AuditEntry`
(the 10 Minimum Controls), `WeeklyAssignmentSlot` (the weekly capacity/actual
grain shared by the Capacity Cockpit and the Batch Import Engine below), and
`SteerCoDecision`.

**Governance & Identity Federation** — `GovernanceConfig` (one per tenant)
holds the Hybrid Configuration Model: a compliance `GovernanceTemplate` plus
Layer-2 overrides (`hiddenModules`, `maskFinancialsForDelivery`).
`IdentityProvider` (one per tenant) holds SAML/OIDC SSO config, with
`SsoGroupMapping` rows resolving a federated login's security group to a
`DeliveryAccessRole` on JIT provisioning.

**Governance integrity** — `AuditLog` is the general "what changed" trail
(baseline locks, EAC edits, CSV/batch imports, workspace restore);
`ImmutableAuditLedger` is the narrower, hash-chained SOC 2 ledger for the
highest-consequence actions only (tenant lifecycle, SSO config, batch import
**commits** — see `src/lib/audit-ledger.ts`'s `LedgerActionType` union).
`ActivityLogEntry` is the PS Control Tower's lightweight "recent activity"
feed — a third, deliberately separate trail from the two above.

**Self-Service Batch Import Engine (WP7)** — a `DataImportBatch` is one
staged upload (CSV or Excel; `BatchImportDataType` is one of four pillars —
`WEEKLY_ACTUALS`, `MILESTONE_PROGRESS`, `FORECAST_EAC`, or `STATUS_RAID`);
each `DataImportRow` holds that row's raw cell values plus its own
`BatchImportRowStatus` (`VALID`/`ERROR`/`CORRECTED`) and plain-English
`errors`. Nothing here writes to `WeeklyAssignmentSlot` / `SchedulePhase` /
`FinancialActual` / `ActivityLogEntry` / `RaidEntry` until
`commitImportBatch` re-validates every row one more time and, only if none
error, upserts them in a single transaction — see
`src/server/actions/data-import.ts` and `src/lib/ingestion/batch-schemas.ts`.
`FORECAST_EAC` targets matrix-mode projects only (`FinancialActual`, keyed
by `(projectId, roleKey)`); `STATUS_RAID` fans out to `ActivityLogEntry`
(narrative) and/or `RaidEntry` (a RAID item) per row.

**Custom KPI Definition Engine** — `CustomKpi` is a *binding*, not a stored
formula: an org-scoped row naming a data source, one metric from that
source's fixed catalog (`src/types/kpi.ts`'s `KPI_METRICS`), a target/warning
threshold pair, and the `targetPersonas` it renders for. There is no
expression language and no separate "KPI value" table — every value is
computed live off the same models above (`FinancialActual`, `SchedulePhase`,
`RaidEntry`, and the Capacity Cockpit's resource/assignment data) by
`src/server/queries/kpi-data.ts` at render time.

**Role-Based Scoped Filtering** — adds no new table. It is a query-time
predicate (`src/lib/scoping.ts`) applied to the existing `Project` and
`Resource` reads above: a global role (`ADMIN`, `VP_EXECUTIVE`) gets an
unfiltered `organizationId` where-clause; a practice-scoped role
(`PRACTICE_DIRECTOR` via `Resource.practiceId`, `DELIVERY_MANAGER` via
direct reports, `PROJECT_MANAGER` via own assignments) gets the same
where-clause narrowed by that identity, built once and shared between the
DB-free authorization check and the Prisma query so the two can't drift.

## Supporting entities (omitted from the diagram for legibility)

| Model | Purpose |
|---|---|
| `Account`, `Session`, `VerificationToken` | Auth.js/NextAuth adapter tables (OAuth plumbing; credentials login uses JWT sessions, not these). |
| `StaffGrant` | Explicit, attributed, revocable A2R-operator entitlement (replaced the email-domain wildcard + `isA2rStaff` boolean in v1.6.0). A live row = *eligibility* to reach `/ops`. `user` FK is `onDelete: Restrict` (v1.11.0) — the entitlement history outlives a raw user delete. Never swept by data-retention. |
| `StaffElevation` | v1.7.0 — the Just-In-Time, reason-logged, auto-expiring grant every *mutating* `/ops` action requires on top of a `StaffGrant`. Session-bound via the `a2r_ops_elevation` cookie; row stores `tokenHash` only (v1.8.0). `user` FK `onDelete: Restrict` (v1.11.0); never swept. |
| `ImpersonationGrant` | The Impersonation Gateway's time-boxed, audited operator → tenant sessions. Row stores `tokenHash` only (v1.8.0). `organization` FK `onDelete: Restrict` (v1.11.0); removed from the data-retention sweep (v1.11.0) — the ledger's `ADMIN_IMPERSONATION_ACCESS` entry is the permanent record. |
| `OrgPolicy` | Legacy per-tenant tolerances (slip/margin thresholds) predating `GovernanceConfig`. |
| `ControlLabel` | Per-tenant display-label override for a `CTRL_01..10` key (the labels are editable; the keys are frozen — see `docs/` control-audit nomenclature notes). |
| `ProjectContributor`, `ScopeItem` | Project-level contributor tagging and scope-item breakdown. |
| `OrganizationHoliday`, `RoleUtilizationPolicy` | Capacity & Concurrency inputs — holiday calendars and per-role utilization targets. |
| `TimesheetEntry` | Raw rows ingested via the Bearer-token `/api/v1` Data Ingestion API Bridge (machine-to-machine), rolled into `WeeklyAssignmentSlot`. Distinct from `DataImportBatch`, which is the human, browser-driven self-service path. |

## Diagram conventions

- `||--o{` = one-to-many (mandatory one side, optional many side); `}o--o|`
  = many-to-optional-one; `}o--||` = many-to-mandatory-one.
- Enum-typed fields are called out inline (e.g. `MembershipRole`,
  `BatchImportRowStatus`) rather than drawn as separate entities.
- Renders natively wherever GitHub or this repo's tooling renders Mermaid;
  paste the fenced block into any Mermaid live editor otherwise.
