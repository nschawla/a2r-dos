# Preview / Production environment isolation

_Status: **code guardrail shipped (P0 #4). Vercel dashboard steps below are
manual and still outstanding.**_

## The risk

Vercel builds a fresh deployment for every branch. If a **Preview** (or
**Development**) deployment inherits the **production** `DATABASE_URL` /
`DIRECT_URL`, then a preview URL — which is guessable, gets pasted into
PRs / Slack, and is crawled — is an unauthenticated path straight into
real client data.

## The code guardrail (shipped)

`src/lib/config/env-isolation-core.mjs` decides: _is this a Vercel
Preview/Development deployment whose `DATABASE_URL` or `DIRECT_URL` points
at the production database?_ It matches the production Supabase project ref
(`xoaabhqsbfetffyawayw`, baked in as a default; the ref appears in both
`db.<ref>.supabase.co` and the `postgres.<ref>` pooler username) anywhere
in either URL.

It runs and **hard-fails** in three places:

| Stage | File | Effect |
| --- | --- | --- |
| Build | `next.config.mjs` | `next build` throws → the Preview deployment never ships |
| Server boot | `src/instrumentation.ts` | the server instance refuses to start |
| Just before the first DB connection | `src/lib/db.ts` (`createBaseClient`) | the Prisma client is never created → no query can run |

Local `next dev` and CI are **never** gated (no `VERCEL_*` env vars).
A Vercel **Production** deployment on the production DB passes; a
Production deployment _not_ on the known production DB logs a
non-fatal warning (so a real migration doesn't brick prod).

Escape hatch: `ALLOW_PROD_DB_OUTSIDE_PROD=true` (logs a loud warning).
**Never set this in Vercel** — it exists only for a one-off local build.

Env vars the guard reads (all optional — the default covers today's setup):

| Var | Purpose |
| --- | --- |
| `PRODUCTION_SUPABASE_PROJECT_REF` | override the baked-in production ref (set if the DB is migrated) |
| `PRODUCTION_DB_HOST` | an additional / alternative host substring to treat as production |
| `ALLOW_PROD_DB_OUTSIDE_PROD` | deliberate local-only override |

---

## Manual Vercel steps (do these now)

### 1. Audit what Preview is using today
Vercel → **Project → Settings → Environment Variables**. Look at
`DATABASE_URL` and `DIRECT_URL`: if their scope is **All Environments** (or
explicitly includes **Preview**), Preview is on production data right now.

### 2. Rotate the production DB password
The audit's premise is that a preview may already hold the production
connection string — treat it as leaked.
- Supabase → **Project Settings → Database → Reset database password**.
- Update the **Production-scoped** `DATABASE_URL` / `DIRECT_URL` in Vercel
  with the new password, and redeploy production.

### 3. Stand up a separate Preview database
Pick one:
- **A second Supabase project** (e.g. `a2r-dos-preview`) — simplest, fully
  isolated. Copy its Transaction-pooler URL (`DATABASE_URL`) and
  Session-pooler URL (`DIRECT_URL`).
- Supabase branching, or a separate Neon project — if you already use one.

### 4. Scope the env vars so the two never mix
In **Settings → Environment Variables**:
1. Edit `DATABASE_URL` → set scope to **Production only**.
2. Edit `DIRECT_URL` → **Production only**.
3. **Add** `DATABASE_URL` → scope **Preview** + **Development** → the
   preview DB pooled URL (`...?pgbouncer=true&connection_limit=1&sslmode=require`).
4. **Add** `DIRECT_URL` → scope **Preview** + **Development** → the preview
   DB session URL (`...:5432/postgres?sslmode=require`).

### 5. Migrate + seed the Preview DB
Locally, pointed at the **preview** database:
```bash
DATABASE_URL="<preview pooled>" DIRECT_URL="<preview session>" npx prisma db push --skip-generate
DATABASE_URL="<preview pooled>" npm run db:seed
# staff bootstrap on the preview DB:
DATABASE_URL="<preview pooled>" npm run staff:grant -- you@a2rventures.com "preview bootstrap"
```

### 6. Separate `NEXTAUTH_SECRET`
`openssl rand -base64 32` → a **new** value.
- Scope the current secret to **Production only**.
- Add the new value scoped to **Preview** + **Development**.

Why: a session token (and, via `src/lib/identity/crypto.ts`, the SSO-secret
encryption key) is derived from this. Distinct secrets mean a preview
session can't be replayed against production, and vice versa.

### 7. `NEXTAUTH_URL`
- **Production**: `https://www.a2rventures.com`
- **Preview**: leave **unset** — NextAuth falls back to `VERCEL_URL`.
- **Development**: `http://localhost:3000`

### 8. (Optional) make the guard explicit
Add `PRODUCTION_SUPABASE_PROJECT_REF=xoaabhqsbfetffyawayw` scoped to **All
Environments**. Not required (it's the baked-in default) but it documents
intent and survives a code change.

### 9. Deployment Protection — stop a leaked URL being usable at all
Vercel → **Project → Settings → Deployment Protection**:
- **Vercel Authentication** → **Standard Protection** (protects Preview +
  all non-production). Every preview URL then requires a Vercel login with
  access to this project. Free on every plan — this is the primary control.
- **Password Protection** (Pro/Enterprise) — only if you need to share
  previews with people who aren't on the Vercel team.
- **Protection Bypass for Automation** — enable only if CI/E2E hits preview
  URLs; it issues a secret header. Store it as a CI secret, never in the repo.
- Leave **Production** unprotected (it is the public site).

### 10. (Optional, defense in depth) Supabase network restrictions
Production Supabase → **Settings → Database → Network Restrictions**.
Vercel has no static egress IPs without the dedicated-IP add-on, so this is
usually impractical on Hobby/Pro — note it, don't depend on it.

---

## Verify

1. Redeploy the `feature/landing-page-preview` branch as a Preview.
   - **Builds & deploys** → env scoping is correct. ✅
   - **Build fails** with `🛑 ENVIRONMENT ISOLATION VIOLATION
     (PREVIEW_USING_PRODUCTION_DB)` → a var is still mis-scoped; fix step 4.
2. Open the Preview URL → you should hit the Vercel Authentication gate.
3. After signing in, `GET <preview>/api/health/ready` → `{"database":"ok"}`,
   and the app shows **seed** data (demo tenants), not real clients.

## Ongoing

- Never set `ALLOW_PROD_DB_OUTSIDE_PROD` in Vercel.
- Rotating the production DB → update only the **Production-scoped** vars.
- Migrating the production Supabase project → update
  `PRODUCTION_SUPABASE_PROJECT_REF` (All Environments) so the guard keeps
  recognising production.
