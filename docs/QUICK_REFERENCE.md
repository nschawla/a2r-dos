# Quick Reference

_A one-page cheat sheet for the parts of this project that are easy to
forget. Written for you, not for an engineer picking up the repo — for the
deeper technical docs, see the index at the bottom._

## Local dev logins

Seeded by `prisma/seed.ts`. Re-running `npm run db:seed` restores all of
these (your own account's password is preserved across re-seeds, not reset).

**Your own account — full access everywhere (client workspaces + `/ops`):**

| | |
| --- | --- |
| Email | `navinder@a2rventures.com` |
| Password | `Password123!` |

**Demo persona accounts — shared password `password12345`:**

*PS-DOS Demo org* (Global ERP Modernization, Claims Automation Pilot, …):

| Email | Role |
| --- | --- |
| admin@a2rventures-demo.test | Admin |
| vp@a2rventures-demo.test | VP Executive |
| pd@a2rventures-demo.test | Practice Director |
| dm@a2rventures-demo.test | Delivery Manager |
| pm@a2rventures-demo.test | Project Manager |

*Acme Health org* (Cloud EHR Migration, Digital Front Door — Red, …):

| Email | Role |
| --- | --- |
| admin@acme-health.test | Admin |
| sponsor@acme-health.test | VP Executive |
| pd@acme-health.test | Practice Director |
| lead@acme-health.test | Delivery Manager |
| pm@acme-health.test | Project Manager |

*Ops Console only (no client workspace):*

| Email | Role |
| --- | --- |
| ops@a2rventures.com | SUPER_ADMIN operator — password `password12345` |
| support@a2rventures.com | SUPPORT operator — password `password12345` |

To reach a mutating action in `/ops` (not just view it), that account also
needs a TOTP authenticator enrolled once at `/ops/security` — a standing
login alone isn't enough by design (JIT elevation, see
`docs/JIT_STAFF_ELEVATION.md`).

## Where things live

| | |
| --- | --- |
| Production site | https://www.a2rventures.com |
| GitHub repo | `nschawla/a2r-dos` |
| Vercel project | `a2r-dos` |
| Current version | see `package.json` / the in-app Release Notes (Ops Console) |

Two separate databases: **production** (real, used by the live site — never
run tests against it) and **staging** (used by the automated test suite and
this session's own verification work). Which one a command touches is
controlled by `DATABASE_URL`/`DIRECT_URL` — local `.env` is production,
`.env.test` is staging.

## Running it locally

```
npm run dev          # start the app at localhost:3000
npm run db:seed       # (re)load the demo data + logins above
npm test               # unit tests
npm run test:e2e      # full browser test suite (staging DB only, never prod)
npm run build          # production build (what Vercel runs)
```

## A few things worth remembering

- **Secrets (database passwords, API keys, the NextAuth secret) do not
  belong in a Word doc or anywhere outside a password manager / Vercel's
  own Environment Variables screen.** Nothing in this file is a real
  secret — the logins above are local demo/seed accounts, not production
  credentials for anything outside this app.
- Pushing to `main` deploys the app on Vercel automatically, but it does
  **not** apply database migrations — those are a separate, deliberate
  step, held for your explicit go-ahead each time a change needs one.
- I don't have a way to check Vercel's build/deploy status directly from
  here yet (no CLI login, no API token configured in this environment) — I
  can only confirm the live site is responding. If you want me to check
  build status directly in future, either run `! vercel login` in a chat
  message (opens the interactive login for me), or hand me a `VERCEL_TOKEN`.
- This session's work in progress: **v1.20.0** (PS Orchestration & Decision
  Engine) is committed locally and its schema migration is applied to
  staging only — both are still waiting on your go-ahead to reach
  production.

## Where to look for more

| If you want to know... | Read... |
| --- | --- |
| What the app does, for a non-technical reader | `docs/EXECUTIVE_SUMMARY.md` |
| What's built vs. planned | `docs/ROADMAP.md` |
| Who can see/do what (roles) | `docs/ROLE_ACCESS_MATRIX.md` |
| How a specific screen works, end to end | `docs/USER_MANUAL.md` |
| The UI design rules ("no cramming," pills, etc.) | `docs/UI_DESIGN_SYSTEM.md` |
| The new Decision Cards / governance workflow | `docs/PORTFOLIO_ORCHESTRATION.md` |
| The dual-tile Executive Triage pattern (RAID/Financials/Schedule/Capacity/Commercial) | `docs/EXECUTIVE_TRIAGE_STANDARD.md` (overview) → each module's own `docs/*_TRIAGE.md` for detail |
| The Control Tower's Bento Grid / Decisions tab layout | `docs/UI_DESIGN_SYSTEM.md` §8 |
| Security posture / compliance | `docs/SECURITY.md` |
| Deploying / Vercel environment variables | `docs/VERCEL_DEPLOYMENT.md` |
| Full data model | `docs/ERD.md`, `docs/TENANT_MODEL_INVENTORY.md` |
| What's traced to what (requirements ↔ code ↔ tests) | `docs/RTM.md`, `docs/FRD.md` |
| Zero-to-deployed setup, for someone new to the repo | `docs/IMPLEMENTATION_GUIDE.md` |
| Live client-support triage (error reference ids, Tier 1/2/3 escalation) | `docs/CLIENT_SUPPORT_RUNBOOK.md` |
| Reading any of this **inside the app**, no checkout needed | `/ops/docs` — the Documentation Hub, A2R staff only |
| Test suite layout / how to run everything | `docs/TEST_COVERAGE.md` |
