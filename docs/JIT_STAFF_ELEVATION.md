# Just-In-Time (JIT) staff elevation

_Status: shipped in v1.7.0 (P1). Builds on P0 #2 (explicit staff grants) and the
Impersonation Gateway. **v1.14.0 (WP2)** adds password step-up +
`sessionVersion` binding. **Batch 2** adds a mandatory TOTP second factor —
see §3.1 and §7._
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
| Standing `staff_grants`, **no** activated `operator_mfa` | **yes** | **no** — `MFA_SETUP_REQUIRED` (must enroll at `/ops/security` first) |
| Standing `staff_grants` + activated MFA, **no** live elevation | **yes** | **no** — `ELEVATION_REQUIRED` (403) |
| Standing `staff_grants` + activated MFA **+** live `staff_elevations` | yes | **yes**, until the elevation expires |

Obtaining the elevation itself requires, in one request: the reason, a fresh
**password** re-check, **and** a valid **TOTP code** (or a single-use
recovery code).

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
| `sessionVersion` (v1.14.0) | the `users.sessionVersion` epoch the elevation was minted under. The guard rejects a row whose epoch ≠ the live session — so a password change / `signOutEverywhereAction` (both bump the epoch) invalidates every elevation for that operator **immediately**, on every instance, independently of the session-state machine. |
| `reauthAt` (v1.14.0) | when the operator last proved the password factor for this elevation (= `createdAt`). |
| `secondFactorAt` (Batch 2) | when the operator proved the **second** factor (TOTP / recovery code) for this elevation (= `createdAt`). Non-null on every elevation minted since Batch 2. |

**One live elevation per operator** — a new request ends the previous one
(`endedReason: 'superseded'`).

## 3.1 Step-up + second factor

`requestElevation` will not mint a row until **all** of these pass, in order:

1. **Reason** ≥ 10 chars.
2. **Standing entitlement** — a live `staff_grants` row.
3. **Password step-up (v1.14.0)** — a fresh `bcrypt.compare` against
   `users.passwordHash`. "Fresh authentication" for a credentials session,
   every time, even mid-session. SSO-only operators (`passwordHash === null`)
   get `NO_PASSWORD` — they must set a console password first.
4. **Second factor (Batch 2)** — `verifySecondFactor` against the operator's
   `operator_mfa` row: a 6-digit RFC 6238 TOTP code, or a single-use
   recovery code. No activated enrollment ⇒ `MFA_SETUP_REQUIRED`.

`requestOpsElevationAction` rate-limits the attempt per account
(`RATE_LIMITS.PASSWORD_CHANGE` tier, 5 / 10 min) so neither factor is an
oracle.

**TOTP model (`operator_mfa`, migration 24)** — one row per operator, a
platform table (`UNSCOPED_MODELS`):

| Column | Meaning |
| --- | --- |
| `secretCiphertext` | the active TOTP secret, AES-256-GCM sealed with a **dedicated, versioned key** — `MFA_ENCRYPTION_KEY` (not `NEXTAUTH_SECRET`), `src/lib/crypto/secret-box.ts`. Format `v2.<keyVersion>.<iv>.<tag>.<ct>`; legacy `v1` (NEXTAUTH_SECRET-derived) still decrypts and is re-sealed on next use. Rotation: `MFA_ENCRYPTION_KEY_V<n>` holds an old key decrypt-only. |
| `pendingSecretCiphertext` | a not-yet-confirmed secret from `beginEnrollment` / rotation; promoted on `activateEnrollment`. An abandoned enrollment never weakens the active factor. |
| `activatedAt` | null ⇒ the row does **not** satisfy the requirement. |
| `lastStepCounter` | anti-replay high-water mark — a TOTP code whose time-step ≤ this is rejected even if in-window. Advanced by a **single conditional `UPDATE … WHERE lastStepCounter IS NULL OR < candidate`**, so two concurrent requests with the same code produce exactly one success. (`OPS_MFA_ALLOW_REPLAY` disables *only* this check, for the Playwright suite; ignored when `NODE_ENV=production`.) |
| `recoveryCodeHashes` | 10 single-use `XXXXX-XXXXX` codes, SHA-256-hashed. Consumed inside a transaction under `SELECT … FOR UPDATE`, so a concurrent use blocks then finds the code gone. |

**Enrollment** is deliberately reachable with just a standing grant + a fresh
password re-check (`/ops/security` → `beginOperatorMfaEnrollmentAction` →
`activateOperatorMfaAction`) — you cannot MFA-gate the MFA setup. **Rotating
an already-active** factor (new phone) additionally needs a live elevation.
**Disabling** a factor is never a runtime path (a phished password must not
strip MFA): `npm run ops:mfa:reset -- <email>` (direct DB, like the
`staff:grant` bootstrap).

**WebAuthn / passkeys** — phishing-resistant, origin-bound — is the tracked
AAL2 upgrade. TOTP is a genuine second factor but not resistant to a
real-time MITM proxy; the step-up seam (`verifySecondFactor`) is where a
WebAuthn assertion would slot in.

## 4. Enforcement

| Layer | File | What it does |
| --- | --- | --- |
| Guard | `src/lib/ops-auth.ts` | `requireElevatedOps()` → `{ ok, ops } \| { ok:false, reason: 'NOT_AUTHORIZED' \| 'ELEVATION_REQUIRED' }`. Resolves the cookie via `resolveActiveElevation(token, session.sessionVersion)`, and requires `row.userId === session.user.id`. `getOpsContextOrNull` / `requireOpsContext` are unchanged. |
| Service | `src/lib/ops/staff-elevation.ts` | `requestElevation` (needs `hasActiveStaffGrant` + **a fresh `bcrypt` password check** + **`verifySecondFactor`** + the caller's `sessionVersion`, clamps TTL, supersedes), `resolveActiveElevation` (+ optional `expectedSessionVersion`), `endElevation`, `hasActiveElevation`, `listElevationHistory`. |
| Second factor | `src/lib/ops/operator-mfa.ts` | `getMfaStatus`, `hasActivatedMfa`, `beginEnrollment`, `activateEnrollment`, `verifySecondFactor` (TOTP + recovery, atomic consumption + opportunistic key re-seal), `disableMfa`. TOTP via `otplib`; QR via `qrcode`; secret sealed via `src/lib/crypto/secret-box.ts` under `MFA_ENCRYPTION_KEY`. |
| Actions | `src/server/actions/ops-elevation.ts` · `ops-mfa.ts` | `requestOpsElevationAction` (standing grant only), `endOpsElevationAction` (de-escalation). `beginOperatorMfaEnrollmentAction` / `activateOperatorMfaAction` (standing grant + password; rotation needs elevation). |
| Enrollment UI | `src/app/(admin)/ops/security/page.tsx` · `src/components/ops/OperatorMfaPanel.tsx` | password → QR + manual key → confirm code → save 10 recovery codes. |
| CLI | `scripts/ops-mfa.ts` · `scripts/lib/cli-io.ts` | `npm run ops:mfa:status` · `npm run ops:mfa:reset -- <email>` (break-glass; direct DB). Mutating CLIs never take a password as an argument (masked prompt / `--password-stdin` / `--generate`) and require `--yes-prod` or a typed confirmation to write to production. |
| Mutating ops actions | `ops.ts`, `identity.ts`, `staff-access.ts` | each opens with `requireElevatedOps()` and returns `'ELEVATION_REQUIRED'` verbatim. Covered: provision / suspend / impersonate-start / export / purge / issue+revoke API key, **all 7 identity-federation writes** (via the shared `authorizeSsoAction`), grant+revoke staff. **Not** gated: `endImpersonationAction`, `listTenantApiKeys` (read). |
| UI | `src/components/ops/OpsElevationBar.tsx` | strip under the Ops Console header — amber "read-only" + **Elevate** modal (reason + 15/30/60 min), or green "Elevated · expires in mm:ss" + **Drop elevation**. Also opens its modal on the `a2r:ops-elevate` window event that `useSafeAction` dispatches when any action returns `ELEVATION_REQUIRED`. Hydration-safe: the countdown renders `··:··` until mounted. |

`src/middleware.ts` is unchanged — it still does the JWT-flag first pass for
`/ops` access; elevation is resolved server-side per request (cookie), the
same pattern as the Impersonation Gateway.

## 5. Fail-closed

- No cookie / expired row / ended row / `userId` mismatch → `ELEVATION_REQUIRED`.
- No activated `operator_mfa`, or a wrong/replayed TOTP code → the elevation
  is **not** minted (`MFA_SETUP_REQUIRED` / `BAD_MFA`). Hard cut-over: an
  operator with no second factor cannot elevate until they enroll.
- The session-state machine (P1) already makes a stale / revoked session
  `user`-less, so `requireElevatedOps` returns `NOT_AUTHORIZED` before it
  ever looks at the elevation — a password change / forced logout kills the
  operator's ability to elevate along with everything else.
- `OPS_ELEVATION_MAX_MINUTES` can only *lower* risk — it is clamped, and a
  request always re-clamps.

## 6. Verification

- `tests/operator-mfa.test.ts` — enrollment ceremony (pending ⇒ not
  satisfied; bad code rejected; activate issues 10 recovery codes), TOTP
  verify, **anti-replay (same code twice → REPLAYED)**, recovery codes
  (once each, then consumed), `NO_MFA` / `disableMfa`.
- `tests/secret-box.test.ts` — AES-256-GCM round-trip, tamper detection,
  dedicated versioned key, rotation (old ciphertext still decrypts + flags
  for re-seal), legacy `v1` decrypt.
- `tests/operator-mfa.test.ts` — includes **concurrent** TOTP + recovery-code
  races (exactly one of N parallel verifications wins).
- `tests/cli-io.test.ts` — production-URL detection, `--yes-prod` / prompt
  gate, no-TTY refusal, generated-password strength.
- `tests/staff-elevation.test.ts` — the service (grant required, thin reason
  rejected, **wrong password rejected**, **SSO-only → NO_PASSWORD**,
  **no 2FA → MFA_SETUP_REQUIRED**, **wrong/replayed code → BAD_MFA**, TTL
  clamp, supersede, expiry, **superseded `sessionVersion` → null**) and the
  `requireElevatedOps` gate (signed-out / no-cookie / live-cookie /
  wrong-user / **session-epoch bump → `ELEVATION_REQUIRED`**).
- `e2e/staff-elevation.spec.ts` (Suite P) — read views unelevated; a
  privileged action blocked + no side effect; elevate (password + TOTP) →
  the action succeeds + shows on the audit trail; drop → blocked again.
  `e2e/global-setup.ts` seeds an activated `operator_mfa` row for the
  suite's operators (`e2e/helpers/ops-mfa.ts`).
- Suites D / I / J5 elevate (`elevateOps` helper — now also fills the TOTP
  field) before their mutating steps.

## 7. Rollout

Batch 2 is a **hard cut-over**: the moment it deploys, every elevation
requires an activated second factor. An operator with none gets
`MFA_SETUP_REQUIRED` on their next Elevate attempt and a link to
`/ops/security`; enrollment is self-service (~2 min) and needs only a
standing grant + their password. Break-glass for a fully locked-out
operator (lost device *and* out of recovery codes):
`npm run ops:mfa:reset -- <email>`.

See also `docs/SESSION_STATE_MACHINE.md`, `docs/DATA_ACCESS_LAYER.md`.
