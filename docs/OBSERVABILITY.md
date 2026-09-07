# Observability & rate limiting

_Status: shipped in v1.7.0 (P2). Builds on the GA-readiness `observability.ts` /
`rate-limiter.ts` primitives._
_Audience: engineering + on-call._

## 1. Structured error capture

`src/lib/observability.ts` emits **one JSON line** per event
(`{ source:'a2r-observability', level, kind, message, name, stack, digest,
context }`) — `console.error` for exceptions, `console.warn` for messages.
`safeStringify` tolerates circular refs / BigInt. A marked **Sentry seam**
is in `emit()`: drop the `@sentry/nextjs` calls there when a DSN exists —
every call site already routes through this module.

### The two centralized wrappers (P2)

| Wrapper | File | Wraps | On an unhandled throw |
| --- | --- | --- | --- |
| `withAction(name, fn)` | `src/lib/observability/action-wrapper.ts` | every `{ ok }`-returning **Server Action** (~48) | re-throws Next control-flow (`redirect` / `notFound` / `DYNAMIC_SERVER_USAGE`); maps `PASSWORD_CHANGE_REQUIRED` / `ELEVATION_REQUIRED` codes through; else `captureException({ scope:'server-action', action, userId, activeOrgId })` (redacted) + returns `{ ok:false, error:'An unexpected error occurred. Please try again.' }` |
| `withRouteHandler(name, handler)` | `src/lib/observability/route-wrapper.ts` | the session-backed download / report **Route Handlers** | re-throws Next control-flow; else `captureException({ scope:'api', route })` + `500 { error:'Internal server error.' }` |

Read-only actions (`listX` / `getX` / `getCommandKContext`) keep raw throws —
they surface through `app/(dashboard)/error.tsx`. `withApiAuth` (the
`/api/v1` bridge) has its own equivalent catch and is untouched.

**Redaction** — `redactContext()` recursively replaces any key matching
`/pass(word)?|secret|token|authorization|cookie|hash|credential|bearer/i`
with `'[redacted]'`. Nothing user-supplied (`input`, request bodies) ever
enters a context object; the actor context is ids only.

## 2. Rate limiting

`src/lib/rate-limiter.ts` — a true **in-process sliding window** (per
instance; see its docstring for the Redis swap seam). P2 additions:
`rateLimitHeaders(result)`, `rateLimitGuard(key, rule)` (one `hit()` + the
header set for both branches), `withRateLimitHeaders(res, result)`.

`X-RateLimit-Limit / -Remaining / -Reset` are set on the **allowed 200**
too, not just the 429 (which also carries `Retry-After`).

### The rule table — `src/lib/rate-limits.ts`

| Rule | Default | Window | Key | Applied at |
| --- | --- | --- | --- | --- |
| `LOGIN` | 10 | 1 min | per IP | `api/auth/[...nextauth]` credentials POST |
| `REGISTER` | 5 | 15 min | per IP / user | `registerOrganization`, `createOrganizationForCurrentUser` |
| `PASSWORD_CHANGE` | 5 | 10 min | per user | `changePasswordAction` |
| `DOC_PARSE` | 10 | 1 min | per user | `api/parse-document` |
| `BULK_EXPORT` | 30 | 5 min | per user | `api/reports/portfolio-csv`, `api/projects/[id]/export` |
| `DOC_GEN` | 30 | 1 min | per user | `api/projects/[id]/status-report`, `…/audit-certificate` |
| `TEMPLATE_DOWNLOAD` | 60 | 1 min | per user | `api/templates/[id]` |
| `BATCH_INGEST` | 20 | 1 min | per user | `stage/commit/update/discardImportBatch`, `commitCsvImport` |
| `WORKSPACE_SNAPSHOT` | 5 | 10 min | per user | `export/restoreWorkspaceSnapshot` |

Every `limit` is overridable via `RL_<NAME>_LIMIT` (e.g.
`RL_BULK_EXPORT_LIMIT=50`); windows are fixed in code.

### Distributed enforcement & failure policy — `src/lib/rate-limiter-redis.ts`

With `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` set, every
boundary shares **one atomic sliding window** in Upstash Redis
(`SLIDING_WINDOW_LUA`, one round trip). Without them each instance keeps its
own window.

| Environment | Upstash not configured | Upstash configured, Redis call throws |
| --- | --- | --- |
| Non-production (`NODE_ENV !== 'production'`) | in-process limiter | in-process limiter, reported once at `warning` |
| **Production** | in-process limiter (accepted posture), noted once at `info` | **request DENIED (429)**, reported once at `error` |

A deployment with **no** Upstash backend runs on the in-process limiter by
design — that is a deliberate, accepted posture, not a failure, so it falls
back cleanly (production leaves one `info` breadcrumb).

A deployment that **has** committed to Upstash and then loses it is the case
that must not silently downgrade: in production the request **fails closed**
(`429`, `error`-level alert). Escape hatch:
`RL_ALLOW_INPROCESS_FALLBACK=1` restores the fall-back after a configured-Redis
failure (for a sustained outage where locking users out is worse), reported
once at `warning`; unset it once Upstash recovers.

A **Server Action** has no `Response`, so the over-limit path returns
`{ ok:false, error:'RATE_LIMITED — too many requests. Try again in …' }`
(`src/lib/rate-limit-action.ts` — `rateLimitByIp` / `rateLimitByUser`). The
client's `useSafeAction` / inline handlers surface it like any other domain
failure.

## 3. Verification

- `tests/observability.test.ts` — `withAction` (pass-through, throw→generic
  + capture, control-flow re-throw, guard-code mapping), `withRouteHandler`
  (verbatim response, throw→500+capture), `redactContext`.
- `tests/rate-limiter.test.ts` — `rateLimitHeaders` / `rateLimitGuard`
  (Remaining counts down) / `withRateLimitHeaders`.
- `tests/security/rate-limit-endpoints.test.ts` — `GET
  /api/reports/portfolio-csv` served `limit` times then 429 (+ per-user
  isolation); `changePasswordAction` rate-limited at `limit + 1`;
  `withRouteHandler` around a throwing stub → 500.
