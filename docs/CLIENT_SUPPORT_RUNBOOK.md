# Client Support & Error Resolution Runbook — PS-DOS™

_Current as of **v1.27.0**. Audience: Tier 1 (client-facing support), Tier
2 (A2R Ops Console operators), Tier 3 (engineering). Everything below is
grounded in real, currently-shipped code — where something described here
didn't already exist, it was built as part of this doc (see §2's trace-ID
mechanism), not written aspirationally. Companion reading: `docs/
SECURITY.md` (compliance framing), `docs/JIT_STAFF_ELEVATION.md` (the
elevation flow Tier 2/3 diagnostics below assume)._

---

## 1. Graceful error states — what the client actually sees

PS-DOS is built so a backend problem degrades a screen, never the whole
session, and never silently. Five distinct patterns, by cause:

### 1.1 A page failed to render (React error boundary)

`src/app/(dashboard)/error.tsx` catches any error thrown while rendering
a page under the signed-in app shell — the sidebar, header, and
navigation stay mounted around the failure, so the user isn't dropped
back to a blank screen. It shows **"Something went wrong,"** a plain-
language reassurance ("Your work is safe"), a **Try again** button
(`reset()` — retries the render in place), a **Contact support** button,
and — when Next.js supplies one — a monospace **`Reference: <digest>`**
line. `src/app/global-error.tsx` is the one level up: if an error escapes
even that boundary (e.g. the root layout itself throws), it replaces the
entire document with an inline-styled equivalent (it cannot depend on
the app's CSS/providers being mounted), including a **mailto: support**
link that pre-fills the reference in the subject line.

**Tier 1: ask the client to read you the `Reference:` value.** It's
Next.js's own `error.digest` — a stable id for that specific render
failure. If it's missing entirely, the error occurred before Next could
attach one (rare); fall back to timestamp + what the user was doing.

### 1.2 A save/action failed (Server Action)

Every mutating Server Action in the app returns a `{ ok: true, ... } |
{ ok: false, error }` tuple — never lets a save throw silently. Two
different kinds of `ok:false`:

- **Expected/domain failure** ("that name's already in use," "you don't
  have permission") — a specific, actionable message, shown inline near
  the control. Nothing was logged server-side; this isn't a bug.
- **Unexpected failure** (a thrown exception — a DB timeout, a null
  somewhere it shouldn't be) — caught centrally by `withAction`
  (`src/lib/observability/action-wrapper.ts`), which the client-side
  `useSafeAction()` hook (`src/lib/client/safe-action.ts`) surfaces as a
  toast: **"Something went wrong"** / a reassurance that nothing was
  changed. As of this doc's own pass, the returned message also carries
  a `(Ref: <traceId>)` suffix — see §2.

A **genuine network failure** (the request never reached the server, or
the response never came back at all) is a third, client-only case —
`useSafeAction`'s own `catch` shows the same reassuring toast without a
server-minted trace id (there's no server-side log line to point to,
since the server may never have run).

### 1.3 An API route failed (`/api/*`)

Same shape as §1.2, at the HTTP layer: `withRouteHandler`
(`src/lib/observability/route-wrapper.ts`) catches an unhandled throw and
returns `500 { error: "Internal server error.", traceId }` — never a raw
stack trace or exception message to the client (`tests/security/
error-sanitization.test.ts` statically enforces that every route under
`src/app/api/**` is either wrapped this way or explicitly allowlisted
with a documented reason).

### 1.4 Missing or partial data — never a crash, always a named empty state

A view with nothing to show says so, specifically, rather than rendering
blank or throwing: every triage module (`docs/EXECUTIVE_TRIAGE_STANDARD.md`)
has its own worded empty/zero state ("Nothing needs your attention right
now," "No scoped engagements yet," "Every billable head is in the
optimal band") rather than a generic "no data." A masked financial figure
for a role without view rights renders as `••••` (`MaskedValue`), never a
blank cell or a thrown authorization error. A restricted section shows an
explicit `RestrictedNotice`, not a silently-missing one.

### 1.5 A slow or timed-out backend dependency

- **Session lookup** — bounded by `SESSION_LOOKUP_TIMEOUT_MS` (prod:
  8000ms); a timeout fails **closed** (the session is treated as
  `REVOKED`, never silently trusted) — see §3.2.
- **Health/readiness** (`/api/health/ready`) — a 2-second ceiling on its
  own DB probe; times out to `503 { status: 'unavailable' }` publicly, so
  an orchestrator can route around a degraded instance without a client
  ever seeing a hung request.
- **Rate limiting** — a caller past a per-route limit gets a clear
  `RATE_LIMITED — too many requests. Try again in N seconds.` (`src/lib/
  rate-limit-action.ts`), with `Retry-After`-style timing, not a bare
  429 with no guidance.

None of the above ever surfaces a stack trace, an internal file path, a
raw database error message, or a secret value to the client — enforced
both by convention (`GENERIC_ACTION_ERROR`, `withRouteHandler`'s fixed
message) and by a static test sweep (`tests/security/
error-sanitization.test.ts`).

## 2. Standardized error codes, trace IDs, and logging

**Two independent, real correlation mechanisms exist today — know which
one a client is quoting.**

| Surface | Reference shown to the user | Where it's logged |
| --- | --- | --- |
| A page render error (§1.1) | `Reference: <digest>` — Next.js's own id for that render failure | The same structured `console.error` JSON line the boundary emits, which includes `digest` as a field |
| A Server Action / API route failure (§1.2–1.3) | `(Ref: <traceId>)` in the toast, or `traceId` in the JSON body | The structured `console.error` JSON line `captureException` emits, which includes `traceId` as a field |

**The trace ID convention** (`generateTraceId()`,
`src/lib/observability.ts`): every call to `captureException` mints a
fresh 8-character id (`crypto.randomUUID()`, truncated — a correlation
id for a "grep the last few minutes of logs" workflow, not a security
token) and returns it. `withAction`/`withRouteHandler` both surface it to
the caller, so **a client can quote the exact string from their screen
or a support email, and Tier 2/3 `grep` the deployment's log stream for
that literal 8-character string** to land on the one structured JSON
line with the full error name, message, stack, and context (actor's
`userId`/`activeOrgId` when resolvable, the action/route name, and
anything else the call site passed — secret-shaped keys are scrubbed
first via `redactContext`).

**Every structured log line is one JSON object**, `source:
"a2r-observability"`, always including `timestamp`, `level` (`error` |
`warning` | `info`), `kind` (`exception` | `message`), and `message`;
exceptions add `name`/`stack`/`digest`/`traceId`; anything passed as
`context` rides along (redacted). This is the **one** place every error
in the app routes through — when a Sentry/Rollbar DSN is eventually
provisioned, the hook is already marked in `src/lib/observability.ts` and
every call site upgrades automatically, no call-site changes needed.

**Named codes a client-visible failure can carry** (distinct from a
trace id — these are branches the UI itself reacts to, not opaque
references):

| Code | Meaning | What the user sees |
| --- | --- | --- |
| `PASSWORD_CHANGE_REQUIRED` | The account is flagged `mustChangePassword` | Redirected straight to `/change-password`, no raw code shown |
| `ELEVATION_REQUIRED` | An Ops Console action needs a live JIT elevation the operator doesn't currently hold | A toast pointing at the elevation bar, `OPS_ELEVATE_EVENT` fired to open it |
| `RATE_LIMITED` | Too many requests against a limited route within the window | The exact retry-after wording from §1.5 |
| `SESSION_REVOKED` | The restricted-session state machine (§3.2) resolved `REVOKED` | Bounced to `/login`; no protected page or API response leaks past this |

## 3. Tiered support playbook

### Tier 1 — client-facing support (no app access beyond what the client themselves can see)

1. **Ask for the reference, always, before anything else.** `Reference:
   <digest>` (a page crash) or `(Ref: <traceId>)` (a failed save/action)
   — see §2's table for which. Also ask: what were you doing, what org/
   tenant, roughly when.
2. **Try the built-in self-service first** — a page-crash boundary
   already offers **Try again**; ask the client to click it once before
   escalating. For a stuck save, a page refresh is safe (every mutation
   is atomic server-side; nothing is left half-applied).
3. **Known, self-resolving states — don't escalate these:**
   - "I'm suddenly logged out everywhere" → expected after a password
     change (`changePasswordAction` intentionally revokes every other
     device's session in the same transaction) — not a bug.
   - "I see `••••` instead of a number" → a financial-masking tier for
     that role (`docs/ROLE_ACCESS_MATRIX.md`), not missing data.
   - "The RAID/Financials/etc. cockpit says nothing needs attention" →
     read literally; check the per-project view if the client expected
     something specific.
   - `RATE_LIMITED` with a retry countdown → ask them to wait it out.
4. **Escalate to Tier 2 with:** the reference id(s), the tenant name,
   the user's email, what they were doing, and whether it's reproducible.

### Tier 2 — A2R Ops Console operators (`/ops`, `staff:manage`-granted + JIT-elevated for anything mutating)

1. **`/ops/pulse`** — platform-wide build/test/health signal; rules out
   "is something globally broken right now" in one look.
2. **`/ops/tenants`** → the specific org — confirm tenant status
   (`ACTIVE` / `SUSPENDED` / `GRACE_PERIOD`) isn't the actual cause (a
   `SUSPENDED` tenant locking out non-staff users is by design, not an
   incident).
3. **`/ops/telemetry`** and **`/ops/audit`** — cross-reference the
   reported timestamp against the tenant's recent `ActivityLogEntry` /
   `ImmutableAuditLedger` history for what actually happened server-side
   around that moment.
4. **Reproduce via Impersonation** (`tenants:impersonate`, time-boxed and
   fully audited — `docs/TENANT_MODEL_INVENTORY.md`'s `ImpersonationGrant`
   row) rather than asking the client to share credentials or screen-share
   sensitive data.
5. **`/api/health/ready` with the internal token** — real-time DB
   latency/status, if the symptom smells like backend degradation rather
   than a single tenant's data issue.
6. **Grep the deployment logs for the trace id** the client (via Tier 1)
   provided — the one structured JSON line names the action/route,
   actor, and full stack. If the fix is within an existing documented
   flow (a stuck integration sync retry, an SSO config correction, a
   staff/role grant), do it here — every mutating Ops action is itself
   ledger-logged. If the log line reveals a genuine bug (not a known
   pattern, not user error) — escalate to Tier 3 with the trace id and
   the log line itself.

### Tier 3 — engineering

1. **Start from the trace id's log line** (Tier 2 should have it in
   hand) — full stack, action/route name, actor context.
2. **Reproduce locally** against `.env.test` (never production —
   `tests/helpers/db-target.ts`'s guard exists for exactly this instinct)
   using `docs/IMPLEMENTATION_GUIDE.md`'s setup, then a targeted isolated
   test run for the suspect area before touching code.
3. **Known environmental flake vs. a real regression** — if the failure
   is a DB-integration test timeout rather than a client-reported
   incident, re-run the specific file in isolation before concluding
   anything's broken (`docs/TEST_COVERAGE.md`'s standing staging-pooler-
   latency note) — don't chase a ghost.
4. **Any schema/RLS-adjacent finding** — cross-check against `docs/
   TENANT_MODEL_INVENTORY.md`'s cross-check section and `tests/security/
   tenant-model-inventory.test.ts` before writing a migration; that test
   exists specifically to catch a new tenant table missing its isolation
   policy (it caught exactly that in v1.27.0 — see that doc's top note).
5. **Ship the fix + its regression test together**, same release — this
   codebase's own convention (documented precedent: `docs/
   SAML_SSO_LIVE_HANDSHAKE.md` §3.2, `docs/EXECUTIVE_SUMMARY.md` §4.1's
   two logged case studies), not a followup ticket.
