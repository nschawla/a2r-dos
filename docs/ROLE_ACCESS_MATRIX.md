# Security & Role Access Matrix — A2R Delivery OS

_Current as of **v1.16.0**. Source of truth: `src/lib/ops/operator-roles.ts`
(operator axis), `src/lib/auth/rbac.ts` + `src/lib/governance/rbacMatrix.ts`
(tenant axis). This document is a reader's map onto that code._

A2R Delivery OS has **two independent authorization axes**. An account may sit
on one, the other, or (for A2R staff who also administer a tenant) both.

| Axis | Question it answers | Backed by |
| --- | --- | --- |
| **Operator** | What can this A2R staff member do in the internal `/ops` console? | `staff_grants` row + `staff_grants.role` (`OperatorRole`) + a live `staff_elevations` for mutations |
| **Tenant** | What can this member do inside a client workspace? | `Membership.role` (`MembershipRole`) → `Membership.deliveryRole` (`DeliveryAccessRole`) permission matrix |

---

## 1. Operator roles (`OperatorRole`) — the `/ops` console

Six roles, one per live `staff_grants` row (`staff_grants.role`, migration
`00000000000025`, default `SUPER_ADMIN`). Enforced in **three layers**:

1. **Edge middleware** (`src/middleware.ts`) — `roleReachesOpsRoute(role, path)`
   on the JWT `operatorRole` claim; a disallowed `/ops/*` sub-path → 307 to
   `/ops/telemetry`.
2. **Page guard** (`requireOpsCapability(cap)` in `src/lib/ops-auth.ts`) —
   redirects on a missing capability; authoritative, zero-staleness.
3. **Action guard** (`requireElevatedOps(cap)`) — returns `ROLE_FORBIDDEN`
   before it even checks for a live elevation.

A mutating action **always** needs a live JIT elevation *in addition to* the
role (password re-verify + TOTP + `sessionVersion` binding — see
`docs/JIT_STAFF_ELEVATION.md`).

### 1.1 Roles

| Role | Remit |
| --- | --- |
| **Super Admin / Owner** (`SUPER_ADMIN`) | Full access to every operator surface and action. The pre-v1.16 default; all migrated grants. |
| **Provisioning Staff** (`PROVISIONING`) | Tenant onboarding and creation; lifecycle (suspend / grace); SSO / identity setup; ingestion templates. |
| **Support / Troubleshooting** (`SUPPORT`) | Diagnostic inspection — telemetry, platform pulse, tenant detail, read-only tenant impersonation, the operator audit trail. No provisioning, no purge, no staff/role management. |
| **Auditor / Compliance** (`AUDITOR`) | Read-only: the immutable audit ledger, JIT-elevation history, operator roster, contract/billing records, cryptographic tenant export. No mutations. |
| **Billing / Finance** (`BILLING`) | Subscription tier, seat counts, and contract state per tenant. Telemetry + tenant list (read). Nothing else. |
| **Viewer / Guest** (`VIEWER`) | Restricted read-only observation — platform pulse and telemetry only. No tenant detail, no impersonation, no elevation. |

### 1.2 Capability matrix

`●` = the role holds the capability. Every mutating capability additionally
requires a live JIT elevation.

| Capability | SUPER_ADMIN | PROVISIONING | SUPPORT | AUDITOR | BILLING | VIEWER |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| `ops:view` (reach `/ops` at all) | ● | ● | ● | ● | ● | ● |
| `telemetry:view` | ● | ● | ● | ● | ● | ● |
| `pulse:view` | ● | ● | ● | ● | ● | ● |
| `devdocs:view` | ● | ● | ● | ● | ● | – |
| `tenants:view` (list + detail) | ● | ● | ● | ● | ● | – |
| `tenants:provision` | ● | ● | – | – | – | – |
| `tenants:suspend` | ● | ● | – | – | – | – |
| `tenants:impersonate` | ● | – | ● | – | – | – |
| `tenants:export` (crypto export) | ● | – | – | ● | – | – |
| `tenants:purge` | ● | – | – | – | – | – |
| `apikeys:manage` | ● | – | – | – | – | – |
| `identity:manage` (per-tenant SSO) | ● | ● | – | – | – | – |
| `ingestion:manage` | ● | ● | – | – | – | – |
| `staff:manage` (grant / revoke) | ● | – | – | – | – | – |
| `roles:manage` (change a role) | ● | – | – | – | – | – |
| `audit:view` | ● | – | ● | ● | – | – |
| `billing:view` | ● | – | – | ● | ● | – |

### 1.3 `/ops` route → capability

| Route | Capability |
| --- | --- |
| `/ops`, `/ops/security` (your own 2FA) | `ops:view` |
| `/ops/telemetry` | `telemetry:view` |
| `/ops/pulse` | `pulse:view` |
| `/ops/dev-docs` | `devdocs:view` |
| `/ops/tenants` | `tenants:view` |
| `/ops/billing` | `billing:view` |
| `/ops/audit` | `audit:view` |
| `/ops/identity` | `identity:manage` |
| `/ops/ingestion` | `ingestion:manage` |
| `/ops/staff` | `staff:manage` |
| `/ops/access` | `roles:manage` |

### 1.4 Changing a role

`/ops/access` → `setOperatorRoleAction` → `setOperatorRole()`. Requires
`roles:manage` (SUPER_ADMIN) **and** a live elevation. It is a **re-grant**:
the current live grant is soft-revoked and a fresh one created with the new
role, so `staff_grants` keeps the full history. You cannot change your own
role. CLI equivalents: `npm run staff:grant -- <email> "<reason>" --role <ROLE>`
(new), `npm run staff:revoke -- <email>`.

### 1.5 Current production operators

| Account | Role |
| --- | --- |
| `navinder@a2rventures.com` | SUPER_ADMIN (+ OWNER/ADMIN in every tenant) |
| `ops@a2rventures.com` | SUPER_ADMIN |
| `master.e2e@a2rventures.com` | SUPER_ADMIN (E2E only) |
| `rajan@a2rventures.com` | SUPER_ADMIN |

---

## 2. Tenant roles

### 2.1 `MembershipRole` (tenant-console tier)

`OWNER` · `ADMIN` · `MEMBER` · `VIEWER`. Governs org/billing management and is
the fallback source for `deliveryRole` when unset (`resolveDeliveryRole`):
`OWNER`/`ADMIN` → `ADMIN`, `MEMBER` → `PROJECT_MANAGER`, **`VIEWER` → `VIEWER`**.

### 2.2 `DeliveryAccessRole` (delivery-portfolio tier)

The server-enforced RBAC tier — portfolio scoping (`src/lib/scoping.ts`) +
edit authority (`src/lib/auth/rbac.ts` `PERMISSIONS`, `canEditProject`).

| Delivery role | Portfolio scope | Edit authority | Financial visibility |
| --- | --- | --- | --- |
| `ADMIN` | whole org | everything (roster, rate card, governance, all project edits) | full |
| `VP_EXECUTIVE` | whole org | none | summary |
| `PRACTICE_DIRECTOR` | their practice | all project edits | summary |
| `DELIVERY_MANAGER` | their direct reports' projects | approve only | restricted |
| `PROJECT_MANAGER` | their own projects | actuals / RAID / audit / schedule | restricted |
| **`VIEWER`** (v1.16.0) | whole org (read) | **none** | **restricted** (cost rates, margins, variance all scrubbed) |

### 2.3 RBAC persona (navigation allow-list)

`src/lib/governance/rbacMatrix.ts` — `personaForDeliveryRole` maps each
delivery role to a persona whose `allowedModules` list gates the sidebar,
tab pills, and (via middleware) the route:

| Persona | Delivery role | Modules reachable |
| --- | --- | --- |
| `GLOBAL_ADMIN` | ADMIN | every governable module |
| `EXECUTIVE_BOARD` | VP_EXECUTIVE | command, control-tower, capacity, steerco, reports |
| `ENGAGEMENT_MANAGER` | PRACTICE_DIRECTOR | + commercial-baseline, financials, schedule, raid, audit |
| `CLIENT_SPONSOR` | DELIVERY_MANAGER | control-tower, schedule, raid, steerco, reports |
| `DELIVERY_LEAD` | PROJECT_MANAGER | command, control-tower, commercial-baseline, financials, schedule, raid, audit, steerco, reports |
| **`OBSERVER`** (v1.16.0) | VIEWER | **control-tower, steerco, reports** only |

---

## 3. Family guest accounts

The roster lives in `scripts/lib/family-guests.ts` (11 members) and shares
one password, `a2r-DOS-233444` (satisfies the strength policy; `mustChangePassword`
is `false`):

| # | Name | Email |
| --- | --- | --- |
| 1 | Abha | `abha@a2rventures.local` |
| 2 | Janvi | `janvi@a2rventures.local` |
| 3 | Honey | `honey@a2rventures.local` |
| 4 | Griffin | `griffin@a2rventures.local` |
| 5 | Chan | `chan@a2rventures.local` |
| 6 | Lucky | `lucky@a2rventures.local` |
| 7 | Angad | `angad@a2rventures.local` |
| 8 | Mani | `mani@a2rventures.local` |
| 9 | Urvashi | `urvashi@a2rventures.local` |
| 10 | Ananya | `ananya@a2rventures.local` |
| 11 | Sudhindra | `sudhindra@a2rventures.local` |

### Designed (launch) tier — `VIEWER`

`npm run guests:seed` provisions them as `MembershipRole.VIEWER` +
`deliveryRole = VIEWER` of the demo organization. On sign-in they land on
the SteerCo Briefing as an "Executive Viewer"; portfolio, control tower, and
reports are visible read-only with every financial figure scrubbed. No
operator grant — `/ops/*` and `/admin` redirect away. This is the tier
Playwright **Suite Q** verifies (against staging, using the first five).

### Current (pre-launch) tier — full access

While the product is still being built, the roster is promoted so the
family can give meaningful feedback:

```
npm run guests:access -- --tier full --yes-prod
```

sets every roster account to **`MembershipRole.OWNER` / `deliveryRole = ADMIN`
in every organization** plus an active **`SUPER_ADMIN` `staff_grants`**
entitlement (read access to the whole `/ops` operator console,
cross-tenant). Mutating operator actions still require the operator to
enroll a second factor and take a JIT elevation — the promotion does not
bypass that.

**Before go-live**, revert the whole roster:

```
npm run guests:access -- --tier viewer --yes-prod
```

restores `VIEWER` / `VIEWER` in the demo org, removes every other-org
membership, and revokes every guest `staff_grants` row.

---

## 4. What no role can bypass

- **Tenant isolation** — the Prisma org-scope extension + composite FKs +
  (staging) DB-level RLS scope every tenant query by `organizationId`
  regardless of role. An operator's cross-tenant reach is a deliberate
  `setAdminScope` on the `/ops` path only.
- **JIT elevation** — no role grants a standing privileged session; every
  mutating `/ops` action needs a fresh password + TOTP elevation.
- **The identity tables** (`staff_grants`, `staff_elevations`, `sessions`,
  `memberships`, …) are `rls_deny_app` — unreachable by the `a2r_app`
  runtime role at the database, for any tenant request.
