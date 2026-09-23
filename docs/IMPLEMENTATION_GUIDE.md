# Implementation & Operations Guide — PS-DOS™

_Current as of **v1.27.0**. The master runbook: enough, in one read-through
and in the right order, for an engineer with zero prior context to clone
the repo, stand up a local environment, run every test suite, and deploy
to production independently. Where a topic already has its own deep-dive
doc, this guide narrates the sequence and links out rather than repeating
it — see §9 for the full index._

---

## 1. What you're standing up

PS-DOS is a multi-tenant SaaS "Delivery Operating System" for
Professional-Services organizations. Next.js 15 App Router (React Server
Components) · Prisma 5.22 · PostgreSQL 17 (Supabase) · NextAuth v4 (JWT
sessions) · Tailwind. One deployable app serves both the tenant-facing
product and A2R's own internal operator console (`/ops`), split by RBAC,
not by separate deployments. Multi-tenancy is **row-level** (a shared
schema; every tenant-owned table carries its own `organizationId` column),
**not** separate Postgres schemas per tenant — enforced by four
independent layers (ORM auto-scope, composite foreign keys, Postgres Row-
Level Security, environment isolation). Full detail:
`docs/TENANT_MODEL_INVENTORY.md`, `docs/ERD.md`.

## 2. Prerequisites

- **Node.js ≥ 18.18** (`package.json` `engines`). `npm`, not yarn/pnpm —
  the repo has a committed `package-lock.json`.
- **A PostgreSQL 17 instance** you control. Nothing in this app requires
  Supabase specifically — the app is a plain Prisma client (`@prisma/
  client`, no `@supabase/*` SDK) — but the shipped RLS migrations use
  Postgres-specific syntax (`SET LOCAL`, policies), so a real Postgres 15+
  is the target, not SQLite/MySQL. A free Supabase project is the fastest
  path to one.
- **Git** access to `nschawla/a2r-dos`, and — if you'll deploy — a Vercel
  account with access to the `a2r-dos` project (`docs/VERCEL_DEPLOYMENT.md`).

## 3. Clone & install

```bash
git clone https://github.com/nschawla/a2r-dos.git
cd a2r-dos
npm install     # postinstall runs `prisma generate` automatically
```

## 4. Environment variables

Three files, all gitignored, Next.js's own precedence order
(`.env.local` > `.env.test` for tests only > `.env`):

| File | Purpose |
| --- | --- |
| `.env` | Your default target — typically a personal/staging database, never production on a dev machine. |
| `.env.local` | Overrides `.env` for **local `next dev` only** — the standard way to point your own machine at a different DB than the team default without touching `.env`. |
| `.env.test` | The **only** DB the automated test suites (Vitest DB-integration, Playwright) will run against — `tests/helpers/db-target.ts` hard-aborts any run whose resolved URL is the production project ref. Point this at a disposable/staging database, never production. |

Minimum variables to get a working `next dev` (full table + every
variable's meaning: `docs/VERCEL_DEPLOYMENT.md` §"Required environment
variables"):

```bash
DATABASE_URL="postgresql://...?pgbouncer=true&sslmode=require"   # pooled, for the app
DIRECT_URL="postgresql://...:5432?sslmode=require"                # unpooled, for migrations
NEXTAUTH_SECRET="$(openssl rand -base64 32)"
NEXTAUTH_URL="http://localhost:3000"
A2R_SITE_MODE="internal"     # marketing | internal | live — 'internal' makes the app itself the front door locally
```

`RLS_ENFORCE`, `UPSTASH_REDIS_REST_URL`/`_TOKEN`, `RETENTION_API_TOKEN`
are all optional for local development (unset = safe defaults: RLS
dormant until you explicitly opt in, in-process rate limiting, no
retention cron).

## 5. Database — first-time setup (a fresh, empty Postgres)

```bash
npm run db:generate   # prisma generate — regenerates the Prisma Client types
npm run db:migrate    # prisma migrate dev — replays every migration in order, tracked
npm run db:seed       # tsx prisma/seed.ts — demo organizations, users, projects, RAID, etc.
```

**This sequence is for a genuinely fresh database only.** PS-DOS's own
shared staging and production databases have **no `_prisma_migrations`
tracking table at all** — their entire history was applied via raw SQL /
`prisma db execute`, not `prisma migrate deploy` — so running `migrate
deploy` against either would try to replay all 29+ migrations from
scratch and likely fail or corrupt state. You will not have credentials
for those databases as a new contributor; if you ever do, read
`docs/RLS_ENFORCEMENT_RUNBOOK.md` and this guide's §8 before touching
either with anything but the read-only verification scripts.

After seeding, `docs/QUICK_REFERENCE.md` has the full login-credentials
table for every seeded demo persona (not repeated here — one source of
truth for something this easy to let drift).

## 6. Run it

```bash
npm run dev
```

Visit `http://localhost:3000`. `A2R_SITE_MODE=internal` routes `/` to the
app itself; sign in with a seeded credential from §5. If the dev server's
Fast Refresh ever starts producing bizarre symptoms after a long session
of structural edits (giant unstyled icons, a webpack runtime `TypeError:
Cannot read properties of undefined (reading 'call')`) — a known Next.js
dev-mode module-cache corruption, not a real code defect — the fix is:

```bash
npm run dev:clean   # kills port 3000, wipes .next, restarts clean
```

## 7. Tests

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npx prisma validate
npm test            # vitest run — unit + DB-integration, against .env.test
npm run test:e2e    # playwright test — full browser suites, also .env.test
npm run build        # production build
```

Full suite layout, per-area breakdown, and current counts:
`docs/TEST_COVERAGE.md`. Two things worth knowing before your first run:

- **DB-integration tests are known-noisy when run all together in
  parallel** against a shared, pooled staging Postgres (elevated
  latency under concurrent connections) — a failure in the full-suite
  run is not necessarily a real regression. Re-run the specific failing
  file in isolation (`npx vitest run tests/the-file.test.ts`) before
  concluding anything's actually broken.
- The production-DB guard (`tests/helpers/db-target.ts`) is not a
  suggestion — it hard-aborts. There is no supported way to point the
  test suites at production short of the single documented, deliberate
  single-machine break-glass env var, and you should never need it.

## 8. Deploying

Production deploys on every push to `main` via Vercel's GitHub
integration — no manual step in the normal case. Full detail, including
required environment variables per environment (Production/Preview/
Development scoping matters — a misconfigured Preview can become a
backdoor into prod data) and how to verify a specific push actually went
out: `docs/VERCEL_DEPLOYMENT.md`.

**Database changes are a separate, explicit step from a code push.**
Neither staging nor production auto-applies Prisma migrations on deploy
(confirmed: no `migrate deploy` anywhere in the build). The established,
repeatedly-used-safely pattern for a schema change:

1. Hand-author (or diff-derive, then hand-trim) a single migration's
   `.sql` file under `prisma/migrations/`.
2. Apply it to **staging first**, via `npx prisma db execute --url
   "$STAGING_DIRECT_URL" --file <path>` — never a blind `migrate deploy`.
3. Verify live (a real Prisma Client read, or the relevant `npm run
   db:rls:*` script — `console.log('done')` from the execute command is
   not verification).
4. Apply to **production** only with explicit authorization from
   whoever owns that decision — it is never bundled silently into a code
   push, and this guide is not that authorization.

## 9. Where to go next — the full doc index

| Topic | Doc |
| --- | --- |
| Architecture, ERD, tenant-isolation model | `docs/ERD.md`, `docs/TENANT_MODEL_INVENTORY.md`, `docs/DATA_ACCESS_LAYER.md` |
| Requirements ↔ code ↔ tests traceability | `docs/RTM.md`, `docs/FRD.md` |
| The five Executive Triage modules + PS Control Tower | `docs/EXECUTIVE_TRIAGE_STANDARD.md` (overview), each module's own `docs/*_TRIAGE.md`, `docs/UI_DESIGN_SYSTEM.md` |
| PS Orchestration & Decision Engine | `docs/PORTFOLIO_ORCHESTRATION.md` |
| Test suites, counts, how to run each layer | `docs/TEST_COVERAGE.md` |
| Security posture, compliance framing | `docs/SECURITY.md` |
| Role/permission model | `docs/ROLE_ACCESS_MATRIX.md` |
| Client support & error-resolution playbook | `docs/CLIENT_SUPPORT_RUNBOOK.md` |
| Deploying / Vercel environment variables | `docs/VERCEL_DEPLOYMENT.md` |
| Everyday login/command cheat-sheet | `docs/QUICK_REFERENCE.md` |
| End-user, module-by-module walkthrough | `docs/USER_MANUAL.md` |
| What's built vs. planned | `docs/ROADMAP.md` |

All of the above (this guide included) are also readable inside the app
itself, without a repo checkout, at `/ops/docs` — see that page's own
short intro for who can reach it.
