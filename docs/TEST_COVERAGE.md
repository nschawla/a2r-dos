# Test Suite Documentation & Coverage — PS-DOS™

_Current-state, **v1.19.0**. How the automated suites are organised, what
each layer guarantees, and how to run them. Requirement-level traceability:
`docs/RTM.md`._

---

## 1. Layers

| Layer | Runner | Count (v1.19.0) | Target DB | Gate |
| --- | --- | --- | --- | --- |
| Unit + DB-integration | Vitest | **775 tests / 64 files** | staging (`.env.test`) or local Postgres — **never production** | `npm test` |
| End-to-end | Playwright (chromium) | **64 tests / 8 spec files** — Suites A–Q | staging (pinned by `playwright.config.ts` + `e2e/global-setup.ts`) | `npm run test:e2e` |
| Direct-SQL RLS smoke | `tsx` script | 10-check matrix | staging / local (guard refuses prod) | `npm run db:rls:smoke` |
| Production acceptance | `tsx` script | `pg_catalog` / `information_schema` SELECTs, **zero DML** | production (read-only) | `npm run db:rls:verify` |
| Production health | HTTP probe | liveness + readiness | live deployment | `npm run health:prod` |
| Static gates | tsc · eslint · `prisma validate` · `next build` | — | — | pre-commit |

The test-rig guard (`tests/helpers/db-target.ts`) hard-aborts any Vitest or
Playwright run whose resolved DB URL is the production project ref
(`xoaabhqsbfetffyawayw`), unless the documented single-machine break-glass
`A2R_ALLOW_PROD_TESTS=1` is set.

---

## 2. Vitest — by area

### Auth & session
- `session-state.test.ts` (29) — the pure state machine (ACTIVE / PENDING / REVOKED transitions, fail-closed on every uncertainty).
- `security/password-rotation-flow.test.ts` — live-DB: atomic `changePasswordAction`, all-device revoke, fresh-session mint decode, **fresh-login `sessionVersion` pin**, fail-closed on DB error / timeout / deleted account.
- `password-rotation.test.ts`, `password-policy.test.ts`, `with-timeout.test.ts`, `security/sign-out-everywhere.test.ts`.

### RBAC
- `rbac.test.ts` — the `DeliveryAccessRole` permission matrix + `resolveDeliveryRole` + `canEditProject` (VIEWER → read-only, no edit).
- `rbac-matrix.test.ts` (23) — **6 personas** (incl. `OBSERVER`, `DELIVERY_EXECUTIVE`), round-trip `DeliveryRole ↔ persona`, `allowedModules` integrity, OBSERVER hides the most, every persona's `landing` route is one it's actually allowed into, PRACTICE_DIRECTOR/PROJECT_MANAGER keep every module they hold real per-project edit authority on.
- `scoping.test.ts` — row-level portfolio/resource scope predicates (VIEWER grouped with ADMIN/VP_EXECUTIVE: whole-org read).
- `masking.test.ts` — financial visibility tiers (VIEWER → `restricted`).

### Operator control plane
- `operator-roles.test.ts` (13) — **NEW v1.16.0**: capability matrix integrity, SUPER_ADMIN holds all / VIEWER holds fewest, only SUPER_ADMIN purges / manages staff / roles / API keys, per-role boundaries, `roleReachesOpsRoute` / `capabilityForOpsPath`, non-ops paths ignored.
- `operator-role-grants.test.ts` (7) — **NEW v1.16.0**: `grantStaffAccess` records/defaults the role, `activeOperatorRole` reads it back, `OpsContext.can()`, `requireOpsCapability` redirects on a missing capability, `requireElevatedOps(cap)` → `ROLE_FORBIDDEN`, `setOperatorRole` re-grants (revoke old + create new) and refuses self.
- `staff-elevation.test.ts` (15 service + 5 gate) — grant required, thin reason, wrong password, SSO-only → NO_PASSWORD, **no 2FA → MFA_SETUP_REQUIRED**, **bad / replayed code → BAD_MFA**, superseded `sessionVersion` → null, `secondFactorAt` set, gate NOT_AUTHORIZED / ELEVATION_REQUIRED / epoch-bump / wrong-user.
- `operator-mfa.test.ts` (12) — enrollment ceremony, TOTP verify, anti-replay, **`atomic anti-replay — two CONCURRENT requests`**, **`atomic consumption — recovery code race`**, recovery codes once-each, `NO_MFA`, `disableMfa`.
- `secret-box.test.ts` (8) — AES-256-GCM round-trip, tamper (ciphertext + short tag), malformed, **dedicated `MFA_ENCRYPTION_KEY`**, **rotation** (old-key ciphertext still decrypts + flags for re-seal), **legacy `v1` decrypt**.
- `cli-io.test.ts` (10) — **NEW v1.15.1**: production-URL detection, `generatePassword` always policy-compliant, `hasFlag`, `assertProdWriteAllowed` (no-op for staging / refuses prod non-TTY / allows with `--yes-prod` / `A2R_ALLOW_PROD_WRITE`), `resolvePassword` (`--generate` / no-TTY refusal).

### Read-Only External Integration Adapters
- `integrations.test.ts` (24) — **NEW v1.18.0**: the Normalization Layer's runtime shape-guard (accepts well-formed records of all 3 kinds, rejects a missing field / unrecognized `kind` / extra field / out-of-range value), error classification (401→AUTH_EXPIRED, 429→RATE_LIMITED with the Retry-After minutes, 5xx→NETWORK_TIMEOUT, 404→SCHEMA_MISMATCH, a thrown network error incl. **Node/undici's wrapped `fetch failed` with the real cause in `.cause`**), every adapter exposes exactly `testConnection`+`pull` and no write/push/update method, every adapter refuses cleanly with no credential configured, `provider-meta.ts` (client-safe) drift-guarded against the real adapters.
- `integrations-sync-runner.test.ts` (3) — **NEW v1.18.0**, live DB: a connection with no credential fails cleanly (FAILED status, one AUTH_EXPIRED error row, connection marked ERROR); an unreachable host produces a real NETWORK_TIMEOUT error (not a thrown exception) from an actual failed fetch; an unknown connectionId returns FAILED without writing any rows.
- `identity-saml-handshake.test.ts` (8) — **NEW v1.19.0**, live DB + real cryptography (not mocked): generates an actual RSA keypair and self-signed X.509 certificate, hand-signs a SAML assertion, and feeds it through the exact `validatePostResponseAsync` call the live ACS route makes. Covers: a well-formed signed assertion provisions the user via JIT and mints a session; a replayed response is rejected on the second attempt; a post-signature-tampered assertion is rejected (INVALID_SIGNATURE); an assertion past its Conditions window is rejected (EXPIRED_ASSERTION); an assertion issued by a different IdP than the one configured for the tenant is rejected (ISSUER_MISMATCH — this is the test that caught node-saml's `idpIssuer` option being inert for the login path); a response with no matching outstanding request is rejected (REPLAY_DETECTED); every failure writes a human-readable `SsoLoginError` row, never a stack trace.
- `identity-saml-errors.test.ts` (32) — **NEW v1.19.0**: every distinct message `@node-saml/node-saml` actually throws (verified against its source), correctly classified; every deliberate refusal reason PS-DOS's own ACS handler produces; an unrecognized message classifies as UNKNOWN rather than throwing; a non-`Error` thrown value is handled.
- `identity-saml-cache-provider.test.ts` (4) — **NEW v1.19.0**, live DB: save → get → remove round-trip; **tenant isolation** — one org's cache provider can neither read nor remove another org's outstanding request (this test caught a real cross-tenant delete bug — see `docs/SAML_SSO_LIVE_HANDSHAKE.md` §3.2); a request past its TTL reads back as absent; `saveAsync` opportunistically prunes the calling tenant's own expired rows.

### Data isolation & integrity
- `org-scope.test.ts`, `dal.test.ts`, `dal-boundary.test.ts` — the Prisma org-scope extension + DAL fail-closed gate + the ESLint/`@/lib/db` boundary.
- `security/tenant-isolation.test.ts` — composite-key child models: a row created under A is invisible / immutable / un-creatable from B.
- `security/rls-policies.test.ts` — `a2r_app` restricted role: empty-GUC connection fail-closed (0 rows).
- `security/ledger-immutability.test.ts`, `security/ledger-concurrency.test.ts` — `a2r_app` cannot mutate the ledger; the trigger rejects; the GUC opt-in.
- `security/tenant-model-inventory.test.ts` — schema-drift guard: **41 models** (9 identity + 31 tenant + 1 post-RLS platform `OperatorMfa`); the three tenant-table lists (rls-smoke, migration 17 **or 26**, schema) agree.
- `security/env-isolation.test.ts` — the preview/prod isolation verdict function.

### Cryptography, calc, observability
- `calculations*.test.ts` — the engine + `calculations-precision.test.ts` (exact-decimal drift proofs).
- `rate-limiter.test.ts`, `rate-limiter-redis.test.ts` (6 — **prod fail-closed policy**), `security/rate-limit-endpoints.test.ts`.
- `observability.test.ts`, `security/error-sanitization.test.ts` (static: every `src/app/api/**/route.ts` wrapped or allowlisted; no caught-error `.message`/`.stack` in any response body).
- `security/health-endpoint.test.ts` (7 — **NEW v1.15.2**: public `/api/health/ready` body is `{ status }` only; `HEALTH_CHECK_TOKEN` unlocks `{ database, latencyMs }`; a wrong/absent token or unset env cannot unlock detail; no error-string leak).
- `security/security-headers.test.ts`, `security/cookie-flags.test.ts`.
- `changelog.test.ts` — the release-notes invariant: top entry `version` === `package.json`, valid semver, newest-first, typed changes.

---

## 3. Playwright — Suites A–Q

| Suite | Coverage |
| --- | --- |
| **A** | Authentication & master access |
| **B** | PS Control Tower & multi-tenant scoping |
| **C** | Engagement governance deep dive (Commercial Baseline, Control Audit, RAID, Financials, Schedule, Executive Hub) |
| **D** | A2R Ops Console — telemetry, tenants, provisioning |
| **E** | Resource & Capacity cockpit |
| **F** | SOC 2 Compliance Ledger (hash-chained, live integrity check) |
| **G** | Methodology Playbook |
| **H** | Role-based data masking (`full` / `summary` / `restricted`) |
| **I** | Super-Admin tenant & data sovereignty — impersonation, cryptographic export, Purge Protocol + Certificate of Destruction |
| **J** | Enterprise identity & governance — role-based landing, **Persona Preview banner navigation across all six roles** (J2, v1.17.0 — replaced the retired header "Perspective" lens pill), governance templates, financial masking, SSO config (elevation-gated, password + TOTP) |
| **K** | Role-based scoped filtering + Custom KPI engine |
| **M** | Site routing model (`A2R_SITE_MODE` fail-closed) |
| **N** | Restricted-session state machine — ACTIVE reaches protected; `sessionVersion` bump = instant logout; REVOKED never self-heals |
| **O** | Tenant isolation — ORM auto-scope + composite keys + DAL boundary |
| **P** | JIT staff elevation — read unelevated → blocked → elevate (password + TOTP, atomic verify) → provision succeeds → drop → blocked |
| **Q** | **NEW v1.16.0** — Viewer / Guest: a family guest signs in as an Executive Viewer, read-only surfaces render, financials scrubbed, `/ops/*` and `/admin` walled off |

`e2e/global-setup.ts` seeds the operators' `operator_mfa` rows (fixed TOTP
secret for `elevateOps`) and the first five family guest **VIEWER** accounts
(`abha@` … `chan@`) before the `webServer` spawns — Suite Q asserts the
strict read-only tier, so the e2e seed pins them at `VIEWER` regardless of
the production roster's pre-launch access tier (see
`docs/ROLE_ACCESS_MATRIX.md` § 3).

---

## 4. Running

```bash
npm run typecheck          # tsc --noEmit
npm run lint               # next lint
npx prisma validate
npm test                   # vitest run  (staging DB via .env.test)
npm run test:e2e           # playwright test --workers=1 recommended off-CI
npm run build
npm run db:rls:smoke       # staging / local
npm run db:rls:verify      # production, read-only
npm run health:prod        # live deployment
```

### v1.19.0 verification result

| Gate | Result |
| --- | --- |
| `tsc --noEmit` | 0 errors |
| `eslint` | 0 / 0 |
| `prisma validate` | valid |
| Vitest | **775 / 775** (64 files) — staging |
| Playwright | Suite J5 (Ops Console SSO configuration, exercises the modified `IdentityFederationPanel`) + Suites J1–J2 (login-page-dependent) — staging, all green. Full A–Q sweep not re-run this release; nothing outside `docs/RTM.md`'s FR-AUTH-8 row touches this feature. |
| `next build` | clean |
| `db:rls:verify` | passed (production, zero DML) |
| `health:prod` | ready · database ok |
| Migrations | migration 27 (`saml_auth_requests`, `sso_login_errors` + RLS) rehearsed (`BEGIN … ROLLBACK`) then applied to **staging only**; production untouched |

Suite J3 (unrelated to this release — tenant governance template
application) and up to 10 Vitest DB-integration tests intermittently
exceed their timeout under elevated staging-pooler latency — reproducibly
100% green on an isolated re-run at a longer timeout (confirmed again this
release: `tests/staff-elevation.test.ts` and `tests/security/
ledger-concurrency.test.ts`, both 100% green at a 20s timeout). Known
environmental flake, confirmed unrelated to this release's changes.
