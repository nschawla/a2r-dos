# Just-In-Time (JIT) staff elevation

_Status: shipped (P1). Builds on P0 #2 (explicit staff grants) and the
Impersonation Gateway._
_Audience: engineering + security audit._

## 1. Purpose

A live `staff_grants` row is **eligibility only** — it lets an operator reach
the `/ops` *read* surfaces (telemetry, tenant list, staff list, pulse,
identity view, ingestion, dev-docs). Every **state-changing** `/ops`
operation additionally requires a **Just-In-Time elevation**: a temporary,
reason-logged, auto-expiring grant bound to the operator's session. There
are no standing privileged sessions.

## 2. States

| | Reaches `/ops` read views | Can run a mutating ops action |
| --- | --- | --- |
| No `staff_grants` row | no (redirected to `/portfolio`) | no |
| Standing `staff_grants`, **no** live elevation | **yes** | **no** — `ELEVATION_REQUIRED` (403) |
| Standing `staff_grants` **+** live `staff_elevations` | yes | **yes**, until the elevation expires |

## 3. The elevation record (`staff_elevations`)

Migration `00000000000013`. One row per elevation request — the rows **are**
the audit trail (like `staff_grants`; there is no separate ledger because an
elevation is a platform event, not tenant-scoped).

| Column | Meaning |
| --- | --- |
| `userId` | the operator; the guard requires this to equal the live session's user id |
| `token` | opaque `randomBytes(24).base64url`, carried in the httpOnly `a2r_ops_elevation` cookie |
| `reason` | ≥ 10 chars, shown in the in-console audit view (`/ops/staff`) |
| `createdAt` / `expiresAt` | strict TTL — default 30 min, hard cap `OPS_ELEVATION_MAX_MINUTES` (clamped `[5, 240]`, default 60) |
| `endedAt` / `endedReason` | `'operator'` (explicit drop), `'superseded'` (a newer request), `'expired-sweep'` (reserved for a future cron) |
| `requestedFromIp` | `x-forwarded-for`, best-effort |

**One live elevation per operator** — a new request ends the previous one
(`endedReason: 'superseded'`).

## 4. Enforcement

| Layer | File | What it does |
| --- | --- | --- |
| Guard | `src/lib/ops-auth.ts` | `requireElevatedOps()` → `{ ok, ops } \| { ok:false, reason: 'NOT_AUTHORIZED' \| 'ELEVATION_REQUIRED' }`. Resolves the cookie via `resolveActiveElevation`, and requires `row.userId === session.user.id`. `getOpsContextOrNull` / `requireOpsContext` are unchanged — read views need only a standing grant, and `OpsContext.elevation` may be `null`. |
| Service | `src/lib/ops/staff-elevation.ts` | `requestElevation` (needs `hasActiveStaffGrant`, clamps TTL, supersedes), `resolveActiveElevation`, `endElevation`, `hasActiveElevation`, `listElevationHistory`. |
| Actions | `src/server/actions/ops-elevation.ts` | `requestOpsElevationAction` (standing grant only), `endOpsElevationAction` (de-escalation — signed-in is enough). |
| Mutating ops actions | `ops.ts`, `identity.ts`, `staff-access.ts` | each opens with `requireElevatedOps()` and returns `'ELEVATION_REQUIRED'` verbatim. Covered: provision / suspend / impersonate-start / export / purge / issue+revoke API key, **all 7 identity-federation writes** (via the shared `authorizeSsoAction`), grant+revoke staff. **Not** gated: `endImpersonationAction`, `listTenantApiKeys` (read). |
| UI | `src/components/ops/OpsElevationBar.tsx` | strip under the Ops Console header — amber "read-only" + **Elevate** modal (reason + 15/30/60 min), or green "Elevated · expires in mm:ss" + **Drop elevation**. Also opens its modal on the `a2r:ops-elevate` window event that `useSafeAction` dispatches when any action returns `ELEVATION_REQUIRED`. Hydration-safe: the countdown renders `··:··` until mounted. |

`src/middleware.ts` is unchanged — it still does the JWT-flag first pass for
`/ops` access; elevation is resolved server-side per request (cookie), the
same pattern as the Impersonation Gateway.

## 5. Fail-closed

- No cookie / expired row / ended row / `userId` mismatch → `ELEVATION_REQUIRED`.
- The session-state machine (P1) already makes a stale / revoked session
  `user`-less, so `requireElevatedOps` returns `NOT_AUTHORIZED` before it
  ever looks at the elevation — a password change / forced logout kills the
  operator's ability to elevate along with everything else.
- `OPS_ELEVATION_MAX_MINUTES` can only *lower* risk — it is clamped, and a
  request always re-clamps.

## 6. Verification

- `tests/staff-elevation.test.ts` — the service (grant required, thin reason
  rejected, TTL clamp, supersede, expiry, idempotent end) and the
  `requireElevatedOps` gate (signed-out / no-cookie / live-cookie /
  wrong-user).
- `e2e/staff-elevation.spec.ts` (Suite P) — read views unelevated; a
  privileged action blocked + no side effect; elevate → the action
  succeeds + shows on the audit trail; drop → blocked again.
- Suites D / I / J5 elevate (`elevateOps` helper) before their mutating
  steps.

See also `docs/SESSION_STATE_MACHINE.md`, `docs/DATA_ACCESS_LAYER.md`.
