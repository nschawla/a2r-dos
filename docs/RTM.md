# Requirements Traceability Matrix — A2R Delivery OS™

_Current-state, **v1.16.0**. Maps each `docs/FRD.md` requirement to its
implementing code and its automated coverage. Per-phase RTMs (with the
requirement IDs used at the time) are in `README.md`; this is the flattened
view. Coverage detail: `docs/TEST_COVERAGE.md`._

Legend — **A** automated (Vitest), **E** end-to-end (Playwright), **S** direct-SQL
smoke, **M** manual UAT (`docs/UAT_TEST_RUNBOOK.md`).

---

## Authentication & session

| Req | Primary code | Coverage |
| --- | --- | --- |
| FR-AUTH-1 | `src/lib/auth.ts`, `src/lib/auth/password-policy.ts`, `src/server/actions/auth.ts` | A `tests/password-policy.test.ts`, `tests/security/password-rotation-flow.test.ts` · E Suite A |
| FR-AUTH-2 | `src/app/(auth)/login/page.tsx` | E Suite A / Q (login flows exercise the field) · M UAT-3.1 |
| FR-AUTH-3 | `src/lib/auth/session-state.ts`, `src/lib/auth.ts` jwt callback | A `tests/session-state.test.ts` (29), `tests/security/password-rotation-flow.test.ts` (fail-closed) · E Suite N |
| FR-AUTH-4 | `src/server/actions/auth.ts` `changePasswordAction`, `src/lib/auth/session-mint.ts` | A `tests/security/password-rotation-flow.test.ts` · E Suite N2 · M UAT-3.9 |
| FR-AUTH-5 | `src/lib/auth.ts` jwt callback (fresh-login pin) | A `tests/security/password-rotation-flow.test.ts` ("fresh login pins the new token to the account epoch") |
| FR-AUTH-6 | `src/lib/auth.ts` `sessionLookupTimeoutMs`, `src/lib/util/with-timeout.ts` | A `tests/with-timeout.test.ts`, `tests/security/password-rotation-flow.test.ts` (timeout → REVOKED) |
| FR-AUTH-7 | `src/lib/identity/*`, `src/lib/auth.ts` `signIn` callback | A `tests/identity-*.test.ts` · E Suite J5 |

## Tenant workspace & RBAC

| Req | Primary code | Coverage |
| --- | --- | --- |
| FR-TEN-1 | `src/lib/workspace/lenses.ts`, `src/app/launch/page.tsx` | A `tests/workspace-lens.test.ts` · E Suite J1 · M UAT-3.1 |
| FR-TEN-2 | `src/lib/auth/rbac.ts`, `src/lib/governance/rbacMatrix.ts`, `src/middleware.ts`, `src/server/authz.ts` | A `tests/rbac.test.ts`, `tests/rbac-matrix.test.ts` (21 — 6 personas) · E Suites B, J · M UAT-3.2 |
| FR-TEN-3 | `src/lib/scoping.ts`, `src/lib/db/scoped-portfolio.ts` | A `tests/scoping.test.ts` · E Suite K1–K2 |
| FR-TEN-4 | `DeliveryAccessRole.VIEWER` — `rbac.ts` `PERMISSIONS`/`resolveDeliveryRole`, `rbacMatrix.ts` `OBSERVER` | A `tests/rbac.test.ts`, `tests/rbac-matrix.test.ts` · **E Suite Q** (guest read-only, financials scrubbed, `/ops` + `/admin` walled off) |
| FR-TEN-5 | `src/lib/security/masking.ts` | A `tests/masking.test.ts` · E Suites H, J4, **Q3** |
| FR-TEN-6 | `src/lib/calculations/**`, `src/app/(dashboard)/**` | A `tests/calculations*.test.ts`, `tests/enterprise-flows.test.ts` · E Suites C, E, F, G |
| FR-TEN-7 | `src/lib/governance/*`, `GovernanceConfig` | A `tests/governance-config.test.ts` · E Suite J3 |
| FR-TEN-8 | `src/lib/calculations/money.ts` + engine | A `tests/calculations-precision.test.ts` (400-cell matrix, 150-project portfolio, 60-row EAC) |
| FR-TEN-9 | `src/lib/ops/tenant-management.ts`, `src/app/(dashboard)/layout.tsx` | A `tests/enterprise-flows.test.ts` · E Suite I |

## Operator control plane

| Req | Primary code | Coverage |
| --- | --- | --- |
| FR-OPS-1 | `src/lib/ops/staff-grants.ts`, `src/lib/ops-auth.ts` | A `tests/staff-elevation.test.ts` (gate), `tests/operator-role-grants.test.ts` · E Suite P1 |
| FR-OPS-2 | `src/lib/ops/operator-roles.ts`, `src/middleware.ts`, `src/lib/ops-auth.ts` `requireOpsCapability` | A `tests/operator-roles.test.ts` (13 — matrix, route map, VIEWER most-restricted), `tests/operator-role-grants.test.ts` (7 — grant/resolve, `requireOpsCapability` redirect, `ROLE_FORBIDDEN`, `setOperatorRole` re-grant) |
| FR-OPS-3 | `src/lib/ops/staff-elevation.ts`, `src/lib/ops-auth.ts` `requireElevatedOps` | A `tests/staff-elevation.test.ts` (15 service + 5 gate) · E Suite P · M UAT-3.10 |
| FR-OPS-4 | `src/lib/ops/staff-elevation.ts` `requestElevation`, `src/lib/ops/operator-mfa.ts` `verifySecondFactor` | A `tests/staff-elevation.test.ts` (wrong pw / SSO-only / no-2FA / bad-code / replay / epoch bump), `tests/operator-mfa.test.ts` · E Suite P3 |
| FR-OPS-5 | `src/lib/ops/operator-mfa.ts`, `src/server/actions/ops-mfa.ts`, `src/app/(admin)/ops/security` | A `tests/operator-mfa.test.ts` (12 — enroll, verify, anti-replay, **concurrent races**, recovery codes) |
| FR-OPS-6 | `src/app/(admin)/ops/access`, `src/components/ops/OperatorAccessManager.tsx`, `src/server/actions/ops-roles.ts`, `staff-grants.ts` `setOperatorRole` | A `tests/operator-role-grants.test.ts` · E (SUPER_ADMIN reaches `/ops/access` in prod verification) |
| FR-OPS-7 | `src/server/actions/ops.ts`, `src/lib/ops/data-sovereignty.ts`, `src/lib/ops/api-keys.ts` | A `tests/enterprise-flows.test.ts` · E Suite I (provision / export / purge) |
| FR-OPS-8 | `src/lib/ops/tenant-management.ts` (`startImpersonation`) | E Suite I2 |
| FR-OPS-9 | `src/app/(admin)/ops/{telemetry,pulse,billing,audit,ingestion,dev-docs}` | E Suite D · M UAT (ops walkthrough) |
| FR-OPS-10 | `src/lib/audit-ledger.ts` (`recordLedgerEvent` / `verifyLedgerIntegrity`) | A `tests/security/ledger-*.test.ts` · E Suite F2 |

## Data isolation & integrity

| Req | Primary code | Coverage |
| --- | --- | --- |
| FR-ISO-1 | `src/lib/db/org-scope.ts`, `src/lib/dal/*` | A `tests/org-scope.test.ts`, `tests/dal*.test.ts`, `tests/dal-boundary.test.ts` · E Suite O |
| FR-ISO-2 | migrations 14 / 22, `prisma/schema.prisma` composite `@@unique` + FKs | A `tests/security/tenant-isolation.test.ts` (composite-key child models) · S `db:rls:smoke` (cross-tenant FK) |
| FR-ISO-3 | migrations 16 / 17 / 20, `src/lib/db/with-tenant-tx.ts` | A `tests/security/rls-policies.test.ts` · S `npm run db:rls:smoke` (10-check) / `db:rls:verify` (prod, read-only) |
| FR-ISO-4 | migration 21, `src/lib/db/with-tenant-tx.ts`, `tests/helpers/ledger.ts` | A `tests/security/ledger-immutability.test.ts` · S `rls-smoke` checks 9–10 · M UAT-3.14 |
| FR-ISO-5 | `src/lib/config/env-isolation-core.mjs`, `next.config.mjs`, `src/instrumentation.ts`, `src/lib/db.ts` | A `tests/security/env-isolation.test.ts` · `docs/PREVIEW_ENVIRONMENT_ISOLATION.md` |

## Cryptography & secrets

| Req | Primary code | Coverage |
| --- | --- | --- |
| FR-CRY-1 | `src/lib/crypto/bearer-token.ts`, `src/lib/ops/api-key-crypto.ts` | A `tests/staff-elevation.test.ts` (tokenHash ≠ cookie; tampered → null), `tests/api-key*.test.ts` |
| FR-CRY-2 | `src/lib/crypto/secret-box.ts` | A `tests/secret-box.test.ts` (round-trip, tamper, **versioned key, rotation, legacy v1 decrypt**) |
| FR-CRY-3 | `src/lib/ops/operator-mfa.ts` `verifySecondFactor` | A `tests/operator-mfa.test.ts` ("atomic anti-replay — two CONCURRENT requests…", "atomic consumption — recovery code race") |
| FR-CRY-4 | `src/lib/identity/crypto.ts` | A `tests/identity-crypto.test.ts` |
| FR-CRY-5 | `src/lib/auth.ts`, `next.config.mjs` cookie flags | A `tests/security/cookie-flags.test.ts` |

## Abuse protection & observability

| Req | Primary code | Coverage |
| --- | --- | --- |
| FR-OBS-1 | `src/lib/rate-limiter.ts`, `src/lib/rate-limits.ts`, `src/lib/rate-limit-action.ts` | A `tests/rate-limiter.test.ts`, `tests/security/rate-limit-endpoints.test.ts` |
| FR-OBS-2 | `src/lib/rate-limiter-redis.ts` `hitDistributed` | A `tests/rate-limiter-redis.test.ts` (6 — incl. production failure policy) |
| FR-OBS-3 | `src/lib/observability/action-wrapper.ts`, `route-wrapper.ts` | A `tests/observability.test.ts`, `tests/security/error-sanitization.test.ts` (every route wrapped or allowlisted; no raw error in any body) |
| FR-OBS-4 | `src/app/api/health/route.ts`, `src/app/api/health/ready/route.ts` | A `tests/security/health-endpoint.test.ts` (7 — public body = `{ status }` only; token unlocks detail; no error-string leak) · `npm run health:prod` |
| FR-OBS-5 | `next.config.mjs` `securityHeaders` | A `tests/security/security-headers.test.ts` |

## Operational tooling

| Req | Primary code | Coverage |
| --- | --- | --- |
| FR-CLI-1 | `scripts/*.ts`, `package.json` scripts | manual — exercised in this session's production operations |
| FR-CLI-2 · FR-CLI-3 · FR-CLI-4 | `scripts/lib/cli-io.ts`, `scripts/reset-password.ts`, `scripts/create-operator.ts`, `scripts/grant-staff.ts`, `scripts/ops-mfa.ts`, `scripts/seed-guests.ts` | A `tests/cli-io.test.ts` (10 — prod-URL detection, `--yes-prod` gate, no-TTY refusal, generated-password strength) |
| FR-CLI-5 | `tests/helpers/db-target.ts`, `tests/setup.ts`, `e2e/global-setup.ts`, `playwright.config.ts` | A guard verified (prod URL → run aborts) · `db:rls:verify` (prod acceptance, zero DML) |
