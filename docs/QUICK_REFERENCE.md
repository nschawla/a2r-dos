# Quick Reference

_A one-page cheat sheet for the parts of this project that are easy to
forget. Written for you, not for an engineer picking up the repo — for the
deeper technical docs, see the index at the bottom._

_The product's full name is **PS Delivery OS**; **PS-DOS** is its official
shorthand, used everywhere space is tight (browser tabs, the footer, this
doc index) — both names refer to the same product._

## Local dev logins

Seeded by `prisma/seed.ts`. Re-running `npm run db:seed` restores all of
these (your own account's password is preserved across re-seeds, not reset).

**Your own account — full access everywhere (client workspaces + `/ops`):**

| | |
| --- | --- |
| Email | `navinder@a2rventures.com` |
| Password | `Password123!` |

**Demo persona accounts — shared password `password12345`:**

*Apex Global Services org* (Global ERP Modernization, Claims Automation Pilot, …):

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

## Production test accounts — family persona matrix

A separate roster from the local seed accounts above: real accounts in the
**production** database, built for the family to test against the live app
(not local dev). Each tenant has a full ladder from Admin down to VP so a
tester can compare what each tier actually sees.

**A2R Ventures — provider side (`/ops` staff, no client workspace):**

| Login | Ops role |
| --- | --- |
| `navinder@a2rventures.com` | Super Admin — full `/ops` + Admin in every tenant |
| `abha@a2rventures.com` | Support |
| `janvi@a2rventures.com` | Provisioning |
| `honey@a2rventures.com` | Viewer (read-only QA) |

**Client 1 — Apex Global Services:**

| Login | Tier |
| --- | --- |
| `rajan@client.com` | Client Admin |
| `indeepa@client.com` | Client Admin |
| `lucky@client.com` | Client PM |
| `angad@client.com` | Client DD |
| `mani@client.com` | Client Practice Director |
| `chan@client.com` | Client VP |

**Client 2 — Acme Health:**

| Login | Tier |
| --- | --- |
| `pankaj@client.com` | Client Admin |
| `ananya@client.com` | Client PM |
| `griffin@client.com` | Client DD |
| `sudhindra@client.com` | Client Practice Director |
| `urvashi@client.com` | Client VP |

Shared password for every account above: `password12345`. None of these
hold any staff/`/ops` access except the four provider-side logins — every
client-side login is scoped to exactly one tenant, with no reach into the
other, and no way to see the Ops Console at all.

## Where things live

| | |
| --- | --- |
| Production site | https://www.a2rventures.com |
| GitHub repo | `nschawla/a2r-dos` |
| Vercel project | `a2r-dos` |
| Current version | see `package.json` / the in-app Release Notes (Ops Console) |

Two separate databases: **production** (real, used by the live site — never
run tests against it — this is where the family persona matrix above lives)
and **staging** (used by the automated test suite and this session's own
verification work). Which one a command touches is controlled by
`DATABASE_URL`/`DIRECT_URL` — **but the file that actually wins depends on
which command you're running:** direct scripts (`tsx scripts/...`, this
session's own CLIs) read `.env`, which is production; **`npm run dev` reads
`.env.local` instead** (Next.js gives it priority over `.env`), and
`.env.local` here points at **staging** — so your local dev server has
always been showing staging's data (currently ~25 tenants / ~185 users from
accumulated test runs), never production's. `.env.test` is staging too, used
by the automated test suite specifically. If local dev ever looks like it
has "extra" or "missing" tenants compared to the live site, this is why —
check which env file the command in question actually loaded before
assuming something broke.

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
- **Vercel CLI is authenticated and working** (`npx vercel`, logged in as
  `nschawla`, team `a2-r-dos` / project `a2r-dos`) — I can pull real
  deployment status and live production logs (`npx vercel ls --prod`,
  `npx vercel logs <deployment-url>`) directly now, not just confirm the
  site responds. This is how the `/ops/integrations` crash a few sessions
  back actually got root-caused — live-tailed logs while reproducing it,
  rather than guessing from reading code. A fresh terminal session may
  need `! npx vercel login` run again (auth doesn't always persist across
  sandbox sessions) — ask if a Vercel-CLI command suddenly stops working.
- **Recently added, worth knowing about** (full detail in the in-app
  Release Notes or `CHANGELOG.md`):
  - **v1.43.0** — Tabbed Multi-Tasking Workspaces (clicking into a project
    opens a dismissible tab below the header) and **PS-DOS IQ**, a
    client-side search bar on Active Projects. Worth knowing plainly: PS-DOS
    IQ is keyword/threshold matching (`red`, `unassigned`, `raid>2`, plain
    substrings), not real natural-language understanding — a genuine free-form
    sentence will likely match nothing.
  - **v1.44.0** — fixed a real misalignment bug on the Commercial Baseline
    tab's "Commercial Setup" card (labels were rendering in the value
    column) — caught by you looking at the live screen, not by any
    automated check.
  - **v1.45.0** — the Persona Preview banner (the role-switcher control) is
    now **A2R staff only**. A real tenant's own Client Admin — including
    every `client.com` family test login — no longer sees it at all.
  - **v1.45.1–v1.45.3** — found and fixed a real production bug: the Ops
    Console sidebar's background link-prefetch was silently crashing
    whichever `/ops` page you were actually looking at, because
    `/ops/integrations`'s database tables existed on staging only. Added a
    proper error boundary, fixed the crash, then — at your request —
    applied that migration to production for real; verified live.
  - **v1.46.0** — a full documentation-hub catch-up. Every doc under
    `docs/` had drifted out of date (some by 16+ releases); two had gone
    past "stale" into **actively wrong** on real facts (a revoked operator
    grant still listed as active, a stale persona-count). All corrected
    against live-verified state. If you're reading a `docs/*.md` file and
    something looks off, it's worth double-checking against this
    session's own verification rather than assuming it's current — the
    same drift can always start accumulating again.
- **Current git state:** `main` is ahead of `origin/main` (v1.46.0's
  documentation catch-up + v1.47.0, this very update) — waiting on your
  go-ahead to push, per the standing convention that nothing reaches
  `main` without an explicit "push to main" each time. Check
  `git status -sb` for the live answer; this line itself will drift the
  moment the next commit lands — treat it as a hint, not a source of
  truth.

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
| The PS Control Tower's Bento Grid / Decisions tab layout | `docs/UI_DESIGN_SYSTEM.md` §8 |
| The flattened sidebar / Command Center retirement / 4-Tier RBAC | `docs/UI_DESIGN_SYSTEM.md` §9, `docs/ROLE_ACCESS_MATRIX.md` §2.3 |
| Running a client demo (manual click-through, or hands-free) | `docs/DEMO_WALKTHROUGH.md`, `docs/AUTO_DEMO_SCRIPT.md` |
| Security posture / compliance | `docs/SECURITY.md` |
| Deploying / Vercel environment variables | `docs/VERCEL_DEPLOYMENT.md` |
| Full data model | `docs/ERD.md`, `docs/TENANT_MODEL_INVENTORY.md` |
| What's traced to what (requirements ↔ code ↔ tests) | `docs/RTM.md`, `docs/FRD.md` |
| Zero-to-deployed setup, for someone new to the repo | `docs/IMPLEMENTATION_GUIDE.md` |
| Live client-support triage (error reference ids, Tier 1/2/3 escalation) | `docs/CLIENT_SUPPORT_RUNBOOK.md` |
| Reading any of this **inside the app**, no checkout needed | `/ops/docs` — the Documentation Hub, A2R staff only |
| Test suite layout / how to run everything | `docs/TEST_COVERAGE.md` |
