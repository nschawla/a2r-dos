# Restricted-session state machine

_Status: shipped in v1.7.0 (P1). Builds on P0 #3 (forced-password-rotation enforcement)._
_Audience: engineering + security audit._

## 1. Purpose

A NextAuth JWT session is not trusted on its `exp` claim alone. On **every
authenticated request** the session's state is re-derived from the
**database** and any uncertainty resolves to `REVOKED` (**fail-closed**). A
password change performs an **atomic, all-device logout**.

## 2. States

| State | Meaning | May access protected resources? |
| --- | --- | --- |
| `ACTIVE` | Normal, fully-authenticated session. | **yes** |
| `PENDING_PASSWORD_CHANGE` | The account was provisioned with a temporary password and must set its own (`users.mustChangePassword`). | **no** — only `/change-password` and sign-out (see `docs` note on P0 #3 / `src/lib/auth/password-rotation.ts`) |
| `REVOKED` | Terminal. The token is dead; the user must re-authenticate for a new one. | **no** |

The state is **derived, never stored as a mutable field** —
`deriveSessionState()` in `src/lib/auth/session-state.ts`.

## 3. Transitions

```
        operator sets a temp password
   ACTIVE ───────────────────────────────▶ PENDING_PASSWORD_CHANGE
        ◀───────────────────────────────
        mustChangePassword cleared w/o a version bump

   ACTIVE / PENDING ──────────────────────▶ REVOKED   (terminal)
        · users.sessionVersion bumped (password change, forced logout)
        · token.iat predates users.passwordChangedAt
        · the account row is gone (deleted)
        · the DB lookup errored or timed out        ← FAIL-CLOSED
        · the token is structurally invalid / already flagged
        · an illegal transition was attempted (tampered `state` claim)

   REVOKED ──▶ (nothing)   a revoked token never becomes valid again
```

Encoded as the immutable `SESSION_TRANSITIONS` table; `assertTransition()`
throws `InvalidSessionTransitionError` for anything not in it, and the jwt
callback turns that throw into `REVOKED` (fail-closed).

## 4. The token-version mechanism

`users.sessionVersion` (`Int`, default `0`, migration `00000000000011`).

- Every session token is **minted carrying the `sessionVersion` it observed**
  — pinned once at login (jwt callback, `user` present) or at
  `establishFreshSession()`, and **never re-written**.
- `changePasswordAction` runs, in **one transaction**:
  1. `passwordHash` + `mustChangePassword: false`
  2. `passwordChangedAt` (audit + belt-and-suspenders revocation signal)
  3. `sessionVersion: { increment: 1 }`
  4. `session.deleteMany` (NextAuth adapter Session rows)
- On the next request from **any** other device, the jwt callback reads
  `users.sessionVersion` and finds `token.sessionVersion (< N) !== N` →
  `deriveSessionState → REVOKED`. That is the atomic all-device logout —
  no iteration over sessions, no background job.
- The acting device gets **one** fresh token from `establishFreshSession()`,
  pinned to the new `N`, so it alone survives.

Legacy tokens minted before this feature have no `sessionVersion` claim —
compared as `0`, so nobody is logged out on deploy; their first password
change afterward revokes them as designed.

## 5. Request-time DB check (not `exp`)

`src/lib/auth.ts`'s `jwt` callback, every request with a `userId`:

1. `Promise.all([ user row (mustChangePassword, passwordChangedAt, sessionVersion), memberships, staff-grant ])`,
   wrapped in `withTimeout(..., SESSION_LOOKUP_TIMEOUT_MS)` (default **2500 ms**,
   `SESSION_LOOKUP_TIMEOUT_MS` env override).
2. Any error / timeout / missing row → `lookupFailed = true`.
3. `deriveSessionState({ token, account, lookupFailed })`.
4. `assertTransition(priorState, nextState)` — an impossible move → `REVOKED`.
5. `REVOKED` → `return { revoked: true, state: 'REVOKED' }`. The `session`
   callback then returns a **user-less session**.

### Enforcement layers

The jwt/session callbacks run wherever `getServerSession()` is called —
**every RSC render, every route handler, `/api/auth/session`**. So:

- **Page renders** (`requireOrgContext` / `requireOpsContext`) — signed-out
  → redirect to `/login`. Immediate on the next navigation.
- **Route handlers** (`getOrgContextOrNull`, `passwordRotationGate`) —
  signed-out → `401`. Immediate on the next call.
- **`src/middleware.ts`** (Edge, no DB) is a fast-path only: it reads the
  raw JWT cookie and turns away `token.state === 'REVOKED'` /
  `token.revoked` with `401 SESSION_REVOKED` (`/api/*`) or a `/login`
  redirect. It sees `REVOKED` once the cookie has been re-encoded by a
  request that went through `getServerSession` — the page-render and
  route-handler layers above are what make revocation *instant*.

There is **no code path** that resolves an uncertain session to `ACTIVE`.

## 6. Fail-closed guarantees

| Failure | Result |
| --- | --- |
| `db.user.findUnique` throws | `lookupFailed` → `REVOKED` |
| DB hangs > `SESSION_LOOKUP_TIMEOUT_MS` | `withTimeout` rejects → `lookupFailed` → `REVOKED` |
| User row not found (deleted) | `account.exists: false` → `REVOKED` |
| `token.sessionVersion` (or `?? 0`) ≠ `users.sessionVersion` | `REVOKED` |
| `token.iat` < `users.passwordChangedAt` | `REVOKED` |
| Tampered `state` claim producing an illegal transition | `assertTransition` throws → `REVOKED` |
| Token with no `userId` | `REVOKED` |

No stale token or cached session state persists past a `sessionVersion`
bump: the check is on **every** request, reading the **live** row.

## 7. Verification

- `tests/session-state.test.ts` — exhaustive: every `deriveSessionState`
  branch, the full transition matrix, `assertTransition`, and race
  scenarios (mid-flight change, concurrent double change, one-request-late
  refresh).
- `tests/with-timeout.test.ts` — the timeout primitive.
- `tests/security/password-rotation-flow.test.ts` — live DB: the atomic
  transaction (hash + version bump + session delete), the fresh mint, the
  jwt callback revoking an old token / keeping the new one, and the
  fail-closed path (DB error → `REVOKED`).
- `e2e/session-state-machine.spec.ts` (Suite N) — a live browser session is
  logged out and blocked from a protected route and a protected API call
  the moment the account's `sessionVersion` is bumped.
