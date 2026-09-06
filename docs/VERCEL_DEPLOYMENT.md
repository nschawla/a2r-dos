# Vercel deployment

## Why production builds were failing (and the fix)

Every fresh `main` build since **v1.5.2** failed on Vercel in ~12 s — before
`next build` really started. Cause: `next.config.mjs` `throw`s if the Vercel
environment variables are mis-scoped, and one of those checks
(`siteModeBuildError`) fails a **production** build when `A2R_SITE_MODE` is
not set. That env var was introduced in v1.5.x (it replaced
`NEXT_PUBLIC_COMING_SOON`) and was never added on Vercel, so *every*
production deploy failed regardless of what the commit changed — the
`docs(release):` commits just happened to be the tip of each push.

**Two changes fix it:**

1. **`next.config.mjs` guardrails are non-fatal on Vercel** (v1.11.x). They
   now log a loud banner and let the build finish. The identical checks run
   again at server boot (`src/instrumentation.ts`) and before the Prisma
   client is created (`src/lib/db.ts`), and those **fail closed** — a
   mis-scoped deployment returns 500 on every request and serves no data.
   So the isolation / routing guarantees are unchanged; only the redundant
   build-time hard-stop is downgraded. Locally the hard `throw` stays.
2. **`vercel.json` → `ignoreCommand`** (`scripts/vercel-skip-doc-builds.sh`)
   skips the build entirely for commits that touch only docs / markdown /
   `executive-summary.html` / SQL migrations / tests. A skipped build
   reuses the previous output and can never fail.

## Required environment variables

Set in **Vercel → Project → Settings → Environment Variables**. Scope
matters — get it wrong and a preview URL becomes a backdoor into prod data.

| Variable | Production | Preview | Development | Notes |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | prod pooler (`postgres.<prod-ref>…:6543?pgbouncer=true&connection_limit=1&sslmode=require`) | **a SEPARATE database** | separate DB | Preview/Dev pointing at the prod ref fails the isolation guard (runtime 500). |
| `DIRECT_URL` | prod session pooler (`:5432`) | matching separate DB | matching separate DB | Migrations only. No `connection_limit`. |
| `NEXTAUTH_SECRET` | unique per environment | different value | different value | `openssl rand -base64 32`. Different Production vs Preview so a token can't be replayed across. |
| `NEXTAUTH_URL` | `https://<prod-domain>` | leave unset (Vercel infers) | `http://localhost:3000` | |
| `A2R_SITE_MODE` | `marketing` \| `internal` \| `live` | `internal` (usually) | — | **The one that was missing.** `marketing` = public early-access page; `live` = `/login`; `internal` = app is the front door. Unknown/unset now falls back to `marketing` (safe) with a build warning. |
| `RLS_ENFORCE` | unset (until the RLS cutover — see `docs/RLS_ENFORCEMENT_RUNBOOK.md`) | unset | unset | |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | optional (distributed rate limiting) | optional | — | Unset → in-process limiter. |
| `RETENTION_API_TOKEN` | optional (cron trigger for the retention sweep) | — | — | |

`connection_limit=1` on the **Production** `DATABASE_URL` is important — each
warm serverless instance keeps its own pool; `src/lib/db.ts`'s
`assertServerlessPooling()` warns in the build/runtime logs if it's absent.

## The "Ignored Build Step"

`vercel.json` sets `ignoreCommand`, which takes precedence over the
dashboard setting, so it is version-controlled. To force a build for a
docs-only commit, push an empty commit touching a build path, or trigger a
redeploy from the dashboard.
