# A2R Delivery OS — Phase 3: SaaS Foundation

This is the Next.js / Prisma / Postgres backend for **A2R-DOS**, replacing the
Phase 1/2 static prototype (`a2r/index.html`, a single-file localStorage app)
with a real multi-tenant SaaS foundation. The domain model — Modules 0
through 5 — is lifted 1:1 from that prototype's `state` object; see
`src/lib/constants.ts` for the ported reference data (control catalog, phase
list, default practice/rate-card roster) and `prisma/schema.prisma` for the
full relational model.

**Work Packages at a glance** (each links to its own section below, with
full reasoning for every judgment call made along the way):

1. [Foundation](#whats-built) — scaffold, schema, initial migration.
2. [Calculation Engine](#work-package-2--calculation-engine-srclibcalculations) — the pure, zero-dependency math core.
3. [Enterprise UI Shell](#work-package-3--enterprise-ui-shell-srccomponentslayout-srccomponentsprojects) — Header/Sidebar/CommandPalette/HelpDrawer, per-module routing.
4. [RBAC Scoped Portfolios](#work-package-4--rbac-scoped-portfolios--full-calc-engine-integration) — the real 5-tier delivery role matrix and scoped queries.
5. [Interactive Module Editors](#work-package-5--interactive-module-editors--optimistic-mutation-actions) — every module goes from read-only to live-editable.
6. [Data Pipelines, Audit Trails & Governance](#work-package-6--data-pipelines-audit-trails-contractor-tagging--governance-integrity) — CSV ingestion, Workspace Backup/Restore, the immutable Audit Trail.
7. [Executive Reporting Hub](#work-package-7--executive-reporting-hub-flight-path-variance--decision-governance) — SteerCo decks, portfolio rollups, audit certificates, Flight Path Variance.
8. [Commercialization & Legal](#work-package-8--commercialization-legal-pages-support-ticketing--admin-onboarding) — branding/copyright, `/terms` + `/privacy`, Support ticketing, admin onboarding.

Jump to [Local Development Setup](#local-development-setup) for the
full path from a fresh checkout to a running app.

## ⚠️ Environment note: this scaffold has not been `npm install`-ed

This sandbox's network egress policy blocks the npm and pip registries
(`registry.npmjs.org`, `pypi.org` both return `403 Host not in allowlist`,
confirmed directly and via the proxy status endpoint — not a transient
failure). That means `npm install` / `npx create-next-app` could not be run
here, so **there is no `node_modules`, no `package-lock.json`, and no
generated Prisma client in this checkout.**

Everything else was still verified as far as it could be without a package
registry:

- **The Prisma schema is real and tested.** `prisma/migrations/00000000000000_init/migration.sql`
  was hand-derived from `schema.prisma` and applied directly to a local
  Postgres 16 instance in this sandbox (`a2r_dos` database). All 19 tables,
  enums, foreign keys, and unique constraints were created successfully, and
  a full insert across every table's FK graph (org → user → membership →
  practice → role → resource → project → scope/effort/audit/RAID/financials/
  schedule/activity) was run and rolled back cleanly.
- **The TypeScript is syntactically clean.** `tsc --noEmit` was run over
  every `.ts`/`.tsx` file. It reports only errors that trace directly to
  missing packages (`Cannot find module 'next'`, `'react'`, `'@prisma/
  client'`, `'zod'`, etc., and the cascading `JSX.IntrinsicElements`/
  `Property does not exist on type '{}'` noise that follows from an
  ungenerated Prisma client and absent `@types/react`). Zero `TS1xxx` syntax
  errors.
- Regenerate `prisma/migrations/.../migration.sql` as your source of truth by
  running `prisma migrate dev --name init` the first time this is built
  somewhere with registry access — Prisma's own output supersedes the
  hand-written file here.

## Local Development Setup

Everything below is the full path from a fresh checkout (with real npm
registry access — this sandbox has none, see above) to a running app with
a signed-in tenant. It supersedes the old terse "first run" snippet this
section used to be.

### Prerequisites

- **Node.js ≥ 18.18.0** (see `package.json`'s `engines` field) and npm.
- **PostgreSQL 16** (or any Postgres the pinned `@prisma/client@^5.20.0`
  supports) running locally or reachable over the network. This app was
  built and verified against a local Postgres 16 instance throughout
  WP1–8.
- A `DATABASE_URL` connection string and a `NEXTAUTH_SECRET` (any long
  random string — `openssl rand -base64 32` is a fine way to generate one).

### 1. Install dependencies

```bash
npm install
```

`postinstall` runs `prisma generate` automatically, so the Prisma client
is generated as part of this step — no separate command needed.

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and set:

```bash
DATABASE_URL="postgresql://<user>:<password>@localhost:5432/a2r_dos?schema=public"
NEXTAUTH_SECRET="<a long random string>"
NEXTAUTH_URL="http://localhost:3000"
```

If the target Postgres database (`a2r_dos` above) doesn't exist yet,
create it first (e.g. `createdb a2r_dos`, or via whatever Postgres client
you use) — Prisma migrates an existing empty database, it doesn't create
the database itself.

### 3. Apply the schema

```bash
npm run db:migrate          # runs: prisma migrate dev
```

This reconciles the four hand-derived migrations already checked into
`prisma/migrations/` (`00000000000000_init` through
`00000000000004_wp7_reporting` — see each Work Package's own README
section above for what each one added) into Prisma's own authoritative
migration history, and regenerates the Prisma client against the real
schema. If you'd rather apply the existing SQL verbatim without letting
Prisma re-diff it (e.g. in CI, or a fresh empty database), use
`npm run db:migrate:deploy` instead.

Schema commands use `DIRECT_URL` (a real session), not `DATABASE_URL`
(which on a serverless deploy is a transaction-mode pooler that can't run
DDL) — see `.env.example` and `datasource.directUrl` in the schema.

### 4. Seed demo data (optional, recommended for evaluation)

```bash
npm run db:seed
```

Creates the **"A2R DOS Demo"** organization with 5 logins, one per
`DeliveryRole` tier (ADMIN, VP_EXECUTIVE, PRACTICE_DIRECTOR,
DELIVERY_MANAGER, PROJECT_MANAGER — see Work Package 4), a full practice/
rate-card roster, and a handful of realistic in-flight projects across
different health states. Every seeded login shares the password
`password12345`. This is also the fastest way to see WP7's Executive
Reporting Hub and WP8's Support modal exercised against real-looking
data rather than an empty new tenant.

If you'd rather start from a genuinely empty tenant instead of the demo
dataset, skip this step and register your own organization once the app
is running (next step) — see `docs/ADMIN_ONBOARDING.md` for the full
first-admin runbook from there.

### 5. Run the app

```bash
npm run dev
```

Visit `http://localhost:3000`. Sign in with a seeded demo login (Step 4)
or register a new organization at `/register`. `/terms` and `/privacy`
(WP8) are reachable without signing in at all.

### 6. Verify the build (optional but recommended before deploying)

```bash
npm run typecheck   # tsc --noEmit
npm run lint
npm run build
npm test             # vitest — the WP2 calc-engine's unit suite
```

None of these four could be run to completion in the sandbox this app was
built in (no registry access — see the environment note above); every WP
section's own "Verified" paragraph explains exactly what verification
method stood in for them instead (hand-derived-SQL round-trips against a
real local Postgres, `tsc` runs against a temporarily-fetched compiler,
and `tsx`-run hand assertions against the pure calculation functions).
Running the four commands above for real, with actual registry access, is
the first thing to do once this app leaves the sandbox it was built in.

## What's built

**Multi-tenancy & auth**
- `Organization` is the tenant. `User` ↔ `Organization` via `Membership`
  (`OWNER` / `ADMIN` / `MEMBER` / `VIEWER` — the tenant-console tier).
- NextAuth (Credentials provider, JWT sessions) with the Prisma adapter
  wired up so an OAuth provider (Google/Microsoft SSO) can be added later
  with no schema change (`src/lib/auth.ts`).
- `src/lib/session.ts#requireOrgContext()` is the one place every
  server component/action resolves "current user + current org" — it always
  reads the org id from a membership the session actually holds, never from
  client input. It also resolves the WP4 RBAC fields (`deliveryRole`,
  `resourceId`, `resourcePracticeId` — see Work Package 4 below).
- `src/middleware.ts` gates all routes except `/login`, `/register`,
  `/onboarding`, and the NextAuth API.
- Registering an org seeds it with the same starter roster the prototype's
  `defaultState()` produced (`src/server/actions/auth.ts`): governance
  policy defaults, the 10 control display labels, and the default
  practice/rate-card roster from `src/lib/constants.ts`.
- **RBAC** (`src/lib/auth/rbac.ts`) — a second, independent role axis: the
  5-tier `DeliveryAccessRole` (Admin/VP Executive/Practice Director/
  Delivery Manager/Project Manager) portfolio-and-project permission
  matrix, plus `src/lib/db/scoped-portfolio.ts`'s role/resource-scoped
  project queries. See Work Package 4.

**Data model** (`prisma/schema.prisma`) — every module from the prototype,
normalized into Postgres tables and scoped to `organizationId`:
- Module 0: `Practice`, `DeliveryRole`, `Resource` (WP4: `userId` login
  link, `managerId` reporting line), `OrgPolicy`, `ControlLabel`
- Module 1: `Project` (WP4: `practiceId`), `ScopeItem`, `EffortCell`,
  `ProjectContributor` (WP4)
- Module 2: `AuditEntry`
- Module 3: `RaidEntry`
- Module 4: `FinancialActual`
- Module 5: `SchedulePhase`
- `ActivityLogEntry` for the Control Tower's activity feed

**UI** (`src/app/(dashboard)/…`) — the shell (`src/components/layout/`:
`Header`, `Sidebar`, `CommandPalette`, `HelpDrawer`) and color/type tokens
are ported from the prototype's CSS variables (`tailwind.config.ts`), so the
SaaS app continues the same visual language while dropping every
single-file-prototype artifact (project dropdown, methodology badges,
autosaved badge) from the global header — see Work Package 3 below.
- **Home (PS Control Tower)** and **Module 0 (Admin & Org Setup)** are fully
  wired: real Postgres reads/writes via Server Actions, no mock data.
- **Modules 1–5** (Deal Sizing, Audit, RAID, Financials, Schedule) each have
  a project picker and a per-project page reading real rows through Prisma;
  Audit and RAID also have working write paths (status/owner/evidence edits,
  logging new RAID items). The Financial Realization page implements the
  prototype's exact EAC formula. What's *not* yet ported is the prototype's
  full interactive editors — the live Phase-Effort Matrix grid, drag-drop
  scope builder, CSV actuals import, and inline schedule-date editing. The
  data layer for all of it already exists; these are UI work for the next
  pass.

## Work Package 2 — Calculation Engine (`src/lib/calculations/`)

Every formula from the prototype's business math — sizing, margin
modeling, seniority-weighted matrix suggestion, the EAC engine, schedule
slip/pace risk, audit compliance scoring, project health, and portfolio/
program rollups — is ported as pure, deterministic TypeScript with **zero**
UI, React, or Prisma-client dependency:

- `src/lib/calculations/sizing.ts` — `computeTotalsFor`, `computeMarginModeler`, `suggestMatrixForProject`
- `src/lib/calculations/audit.ts` — `computeAuditProgress`, `computeProjectHealth`
- `src/lib/calculations/financials.ts` — `computeEacSummary`
- `src/lib/calculations/schedule.ts` — `computePhaseSlipDays`, `computePhasePace`, `computeScheduleSummary`
- `src/lib/calculations/portfolio.ts` — `computePortfolioSummary`, `computeProgramRollup`
- `src/lib/calculations/types.ts` — the plain input/output shapes every function above uses (deliberately not the Prisma model types — adapt Prisma rows to these at the call site)

The only import outside the `calculations/` folder is `../constants`
(`PHASES`, `CONTROL_DEFS`, `WORKSTREAM_PHASE_HOURS`, `COMPLEXITY_MULT`) —
itself plain data with no dependencies, kept as the single source of truth
for both the app and the engine rather than duplicating it.

Two intentional deviations from the literal function signatures requested,
both because the underlying math needs the org's rate card and neither the
prototype's globals nor a pure function can supply it implicitly:
`computePortfolioSummary(projects, roles)` and
`computeProgramRollup(parentProject, childProjects, roles)` both take an
explicit `roles` parameter. Every other signature matches as given.

**Verified, not just written.** This sandbox has no `vitest` installed
(same npm-registry block as the rest of Phase 3), so the suite couldn't be
run with `npm test` here. Instead, every expected value in
`tests/calculations.test.ts` was checked by actually executing the real
implementation — via the globally-available `tsx` runtime plus a
~40-line shim implementing vitest's `describe`/`it`/`expect` API against
Node's own `assert`-equivalent (`util.isDeepStrictEqual`) — in a scratch
directory outside the project tree. All **70 tests passed** against the
real code, and `tsc --noEmit --strict` (this project's actual `noUncheckedIndexedAccess`
strict settings) reports zero errors for `src/lib/calculations/**` and
`tests/calculations.test.ts`. The shim itself is not part of this
checkout — once `npm install` brings in real `vitest`, run:

```bash
npm run test        # vitest run
npm run test:watch  # vitest, watch mode
```

## Work Package 3 — Enterprise UI Shell (`src/components/layout/`, `src/components/projects/`)

The original WP3 request targeted Next.js 16 / React 19 / Tailwind 4 and a
unified `/projects/[id]` workspace. Neither matches what WP1 actually built
(Next 14.2 / React 18.3 / Tailwind 3.4, five separate per-module routes), so
before writing any code both conflicts were put to the user directly rather
than guessed at:

- **Stack version** — keep the current, already-built-and-verified
  Next 14.2/React 18.3/Tailwind 3.4 stack rather than upgrading to chase the
  request's stated target. *(User confirmed: keep current stack.)*
- **Project routing** — keep the five per-module routes
  (`/deal/[id]`, `/audit/[id]`, `/raid/[id]`, `/financials/[id]`,
  `/schedule/[id]`) rather than introducing a `/projects/[id]` workspace
  that doesn't otherwise exist in the app. *(User confirmed: keep
  per-module routes.)* `ProjectHeader` is mounted as a shared component at
  the top of each of those five pages instead.

**What was built:**

- `src/components/layout/Header.tsx` — replaces the old prototype-era
  topbar. No project dropdown, no "+ New Project" button, no methodology
  badges, no autosaved badge. Composes an org/workspace switcher, the
  command palette trigger, the help drawer trigger, a notifications bell,
  and a user menu with the persona switcher folded in.
- `src/components/layout/CommandPalette.tsx` — `Cmd+K`/`Ctrl+K` global
  search across projects & parent programs (health pill, routes to
  `/deal/[id]` — the app's canonical "open project" destination), the
  resource directory, and open SteerCo-escalated RAID items. Fuzzy
  matching is a small dependency-free scorer (`src/lib/fuzzy-match.ts`) —
  no fuzzy-search package is installable in this sandbox.
- `src/components/layout/HelpDrawer.tsx` — right slide-over with
  route-aware governance guidance (10 Controls on `/audit`, the True EAC
  formula on `/financials`, slip vs. pace risk on `/schedule`, margin
  modeling and baseline locking on `/deal`).
- `src/components/layout/Sidebar.tsx` — the same 7 nav items as before,
  now collapsible with the collapsed state remembered per-browser.
- `src/components/projects/ProjectHeader.tsx` — the shared per-project
  action bar: name, client, hierarchy tag, live G/Y/R health badge (via
  the WP2 engine's `computeProjectHealth`), and Lock/Unlock Baseline /
  Export Status Report / Export JSON Package actions.
- `src/components/layout/dashboard-ui-context.tsx` — the client
  `DashboardUIProvider`/`useDashboardUI()` coordinating command palette,
  help drawer, and persona state across the header, sidebar, and project
  header. Also defines the cosmetic RBAC-preview `Persona` enum.
- `src/server/queries/calc-adapters.ts` — the one place Prisma's
  uppercase-enum rows get converted into the lowercase-enum shapes the
  WP2 calculation engine expects. Pages and route handlers should go
  through this rather than hand-rolling the conversion inline.
- `src/server/queries/health.ts`, `src/server/queries/notifications.ts`,
  `src/server/actions/organizations.ts`, `src/server/actions/command-palette.ts`
  — the data layer behind the health badge, notification bell, workspace
  switcher, and command palette respectively.
- `src/server/actions/projects.ts` — added `toggleProjectLock`, which
  snapshots the WP2 engine's `computeTotalsFor` output as
  `baselineSnapshot` on lock, and clears it on unlock.
- `src/app/api/projects/[projectId]/export/route.ts` and
  `.../status-report/route.ts` — the two export actions. The first
  returns the full project record (all relations) as a downloadable JSON
  attachment; the second renders a self-contained, print-ready 1280×720
  HTML "slide" (open it, then use the browser's own Print → Save as PDF —
  no PDF-rendering package is installable here) built entirely from the
  WP2 engine (`computeTotalsFor`, `computeEacSummary`,
  `computeScheduleSummary`, `computeProjectHealth`), so it can never drift
  from what the module pages themselves show.

**Persona vs. role — a deliberate split, not an oversight.** The header's
Persona Switcher (Admin / Practice Director / Delivery Manager / Project
Manager / Executive Viewer) is a client-only, `localStorage`-persisted
simulation for previewing how the UI looks under different roles without
five separate logins. It never gates a server action or a data fetch. Every
mutation that needs real authorization — `toggleProjectLock` is the one
this WP adds — checks the session's actual `MembershipRole`
(`OWNER`/`ADMIN`/`MEMBER`/`VIEWER`) from `requireOrgContext()`, independent
of whatever persona is selected. `ProjectHeader` uses the persona only to
decide whether to *show* the lock/unlock button; the server action re-checks
the real role regardless, so a persona switch can never grant access it
doesn't already have.

**Verified the same way as WP1/WP2** (no `npm install` in this sandbox —
see the environment note above): `tsc --noEmit --ignoreDeprecations 6.0 -p
tsconfig.json` over the whole project, then every error was checked against
the established sandbox-noise categories (missing `node_modules` for
`next`/`react`/`zod`/`@prisma/client`/etc., and the type-inference
degradation those missing modules cascade into — collapsed enum unions,
`Map` generics inferring as `unknown`, JSX intrinsic-element fallout). No
new error outside those categories was introduced by any WP3 file.

## Work Package 4 — RBAC Scoped Portfolios & Full Calc-Engine Integration

**The core conflict, and how it was resolved.** The requested 5-role
enterprise RBAC (Admin / VP Executive / Practice Director / Delivery
Manager / Project Manager) had no home anywhere in the schema. Real
server-side authorization was the 4-tier `MembershipRole`
(Owner/Admin/Member/Viewer); WP3's 5-role "Persona" switcher looks similar
but is explicitly cosmetic — client-only, `localStorage`-persisted, and
documented as never gating anything. Making `hasPermission`/
`canEditProject`/the scoped queries real meant deciding where the
enterprise role actually lives, so this was put to the user directly
before writing code (mirroring WP3's stack/routing questions):

- **Add a new, real role field** *(chosen)* — `Membership.deliveryRole`
  (a new `DeliveryAccessRole` enum), independent of `MembershipRole`, plus
  `Resource.userId` (links a login to its roster entry) and
  `Resource.managerId` (the DM→PM reporting line the scoped queries walk).
  WP3's Persona switcher is untouched — still cosmetic, still separate.
- *(not chosen)* Promoting Persona itself to real, server-persisted RBAC —
  a bigger change that would have turned the header's preview switcher
  into a live "view as" permissions control.

**Schema additions** (`prisma/migrations/00000000000001_wp4_rbac/`,
verified against a real local Postgres — see the environment note above):
`DeliveryAccessRole` enum; `Membership.deliveryRole` (nullable — see
`resolveDeliveryRole()` below); `Resource.userId` and `Resource.managerId`;
`Project.practiceId` (a project's home practice, independent of who's
formally assigned PD — lets a Practice Director see every project in their
practice, not only ones they personally lead); and a new
`ProjectContributor` join table (project ↔ resource, for a Project
Manager explicitly added to a project without being its PM of record).
`FinancialActual.roleKey`'s direct-mode convention was also corrected from
a stale `"blended"` to the engine's actual `'_direct'` sentinel
(`computeEacSummary` in `financials.ts` always expected `'_direct'`; no
code had actually written `"blended"` yet, so this was a documentation fix
with no data migration needed).

**`src/lib/auth/rbac.ts`** — the permission matrix and two helpers:
- `hasPermission(role, action)` — coarse, module-level actions
  (`admin:roster`, `portfolio:viewAll`, `steerco:view`,
  `project:editBaseline`, `project:editRaid`, `project:editAudit`,
  `project:editSchedule`, `project:editFinancials`, `project:approve`).
  ADMIN gets everything; VP_EXECUTIVE gets only the two read-all/SteerCo
  actions; PRACTICE_DIRECTOR gets every project-edit action plus approve;
  DELIVERY_MANAGER gets only `project:approve` (review/approval authority,
  not direct edit); PROJECT_MANAGER gets the four actuals/RAID/audit/
  schedule edit actions.
- `canEditProject(session, project)` — per-instance edit authority: ADMIN
  always; PRACTICE_DIRECTOR when they're the assigned PD *or* the
  project's practice matches theirs; PROJECT_MANAGER only when they're the
  PM of record; DELIVERY_MANAGER and VP_EXECUTIVE never (approval and
  read-only respectively).
- `resolveDeliveryRole(membership)` — since `Membership.deliveryRole` is
  nullable with no backfill migration, this derives a default from
  `MembershipRole` (Owner/Admin → Admin, Member → Project Manager, Viewer
  → VP Executive) so every signed-in user resolves to a real delivery role
  without a null-check at every call site. `src/lib/session.ts` calls this
  once per request to populate `OrgContext.deliveryRole`, alongside the
  new `resourceId`/`resourcePracticeId` (resolved live via
  `Resource.userId`, not cached in the JWT, so linking a login to a
  Resource takes effect immediately).

**`src/lib/db/scoped-portfolio.ts`** — `getScopedProjectsForUser(session)`
builds the Prisma `where` clause from the spec exactly: PM scoped to
`projectManagerId = resourceId` or an explicit `ProjectContributor` row; DM
to `deliveryManagerId = resourceId` or `projectManagerId IN
(direct-report ids)`; PD to `practiceDirectorId = resourceId` or
`practiceId` match; Admin/VP unrestricted. A role that depends on a
resource link the signed-in user doesn't have fails closed (matches
nothing) rather than falling through to an unscoped query.
`getScopedPortfolioSummary(session)` runs the WP2 engine's
`computePortfolioSummary` over that scoped list, plus
`computeProgramRollup` for every PARENT-hierarchy project in it — a
program's rollup always aggregates *all* of its children, regardless of
whether each child individually falls in the viewer's scope.

**`toggleProjectLock` now uses `canEditProject`** instead of its previous
`MembershipRole`-only check — a natural first real caller of the RBAC
layer, and a strict widening (Practice Directors can now lock/unlock too),
not a narrowing: `resolveDeliveryRole`'s fallback already maps every
Owner/Admin membership to the ADMIN delivery role, so nothing that could
lock a baseline before this WP lost that ability.

**Module pages rewired to the WP2 engine** — Deal now uses
`computeTotalsFor` for every total it shows, plus a new
`MarginModelerCard` (`computeMarginModeler`, pure client-side — no server
round trip on every slider drag); Audit shows `computeAuditProgress`'s
weighted compliance % instead of a raw "fully evidenced" count; Financials
fully replaced its hand-rolled EAC math with `computeEacSummary` and now
surfaces margin drift and the Open RR cost-impact callout the formula
always implied but the page never showed; Schedule adds a Pace Risk column
(`computePhasePace`) alongside slip (`computePhaseSlipDays`) — pace is an
earlier warning signal than slip, since a phase can still be inside its
planned end date while burning calendar time faster than logged work; the
Control Tower now shows the *scoped* portfolio (stat cards, a Program
Rollups table, the project registry, and recent activity all filtered to
what the signed-in role can see) instead of the whole tenant unconditionally.

**`prisma/seed.ts`** was rewritten from WP1's single-project seed into "A2R
Ventures Demo": 5 logins (one per `DeliveryAccessRole`, shared password
`password12345`), a real reporting line (two PMs report to the Delivery
Manager), 1 Parent Program with 2 Child Waves (one healthy, one
deliberately red — slipped schedule, audit gaps, margin erosion, escalated
RAID — so health/notifications/pace-risk have something real to render),
and 3 standalone projects exercising the scoping edge cases specifically:
one in DIRECT estimation mode, one with no assigned PD (seen only via
practice match), one with an explicit `ProjectContributor`, and one in a
*different* practice than the seeded PD's own (a negative case — that
project should NOT appear in the PD's scoped portfolio). Idempotent: safe
to re-run `npm run db:seed`.

**Verified the same way as WP1–3** (no `npm install` in this sandbox): the
new migration was applied and round-tripped against a real local Postgres
(including a full insert across every new column/table/FK in one
transaction, then rolled back); `tsc --noEmit --ignoreDeprecations 6.0 -p
tsconfig.json` reports no new error outside the established sandbox-noise
categories (this WP added one more shape to that list — a `Record<enum,
V>` index resolving to `V | undefined` because the enum import itself
collapsed to `any` — same root cause as prior categories, just surfacing
as `TS2532` instead of `TS2322` in one spot); and the WP2 test suite was
re-run end to end (still 70/70) to confirm the calc-adapters additions
(`hierarchyLevelLower`) didn't regress anything. `prisma/seed.ts` itself
can't be executed here — it needs a generated Prisma client — so it was
instead verified by cross-checking every `db.<model>.*` call against the
schema and round-tripping its exact insert shape through raw SQL (see
above), the same limitation and mitigation documented for the app code in
earlier work packages.

## Work Package 5 — Interactive Module Editors & Optimistic Mutation Actions

WP5 turns the five module pages from read-only WP4 views into interactive
editors. Every mutation is gated by `canEditProject` (via a new shared
`src/server/authz.ts#authorizeProjectEdit(projectId)` helper — resolves org
context, fetches the minimal project shape, and checks edit authority in
one call, so no Server Action hand-rolls that boilerplate). "Optimistic"
here means hand-rolled, not `useOptimistic`: the locked-in stack is React
18.3 (`useOptimistic` is React 19+), so every editor updates local
`useState` immediately, recomputes entirely client-side against the
zero-dependency WP2 engine, and persists via a `useTransition`-wrapped
Server Action in the background — reverting the field to its last
known-good value if that action reports failure.

**Judgment calls made without blocking on the user** (documented here
rather than via `AskUserQuestion`, since each is an implementation-detail
resolution of a spec-vs-schema gap, not an architectural fork like WP3's
stack/routing questions or WP4's RBAC-role-source question):

- **RAID "Severity (1–5)"** stays the existing 4-tier `RaidSeverity` enum
  (Critical/High/Med/Low) rather than a new numeric field — that enum
  already drives badges, notifications, and the command palette everywhere
  else; a parallel 1–5 number would just be a second, disagreeing severity
  representation for the same concept.
- **"Workstreams × delivery roles" grid** is `EffortCell`'s real axis —
  `phaseKey` × `roleId` — presented as the Phase-Effort Matrix (the
  terminology already established since WP1), not a literal `ScopeItem` ×
  role grid. The entire calc engine (`computeTotalsFor`, `phaseTotals`) is
  phase-keyed; a scope-item-keyed grid would need an incompatible schema.
- **"Actual/Forecast Start/End"** reuses the existing `actualStart`/
  `actualEnd` columns for both — there are no separate forecast columns
  (`computePhasePace`/`computePhaseSlipDays` only ever consumed planned/
  actual), and the same field holding a forecast date until it becomes an
  actual is standard PM practice, not a workaround.
- **"Lock Baseline… with confirmation dialog"** enhances the one Lock/
  Unlock control every module page already shares (`ProjectHeader.tsx`,
  wired to `toggleProjectLock` since WP4) with an inline confirmation
  modal, rather than adding a second, redundant lock control inside
  `DealEditor.tsx`. Both directions (lock *and* unlock) get the
  confirmation — unlocking discards the `baselineSnapshot` the EAC engine's
  margin-drift comparison depends on, which is just as consequential as
  locking.
- **RAID "Title"** turned out to need a real schema field: the Quick-Add
  drawer's spec lists Title and Description as two separate inputs, and
  `RaidEntry` only ever had `description`. Added `RaidEntry.title
  String?` (nullable — `RaidBoard.tsx` falls back to a truncated
  `description` for rows logged before this field existed).

**Schema additions** (`prisma/migrations/00000000000002_wp5_editors/`,
verified against a real local Postgres — see the environment note above):
`AuditEntry.notes String? @db.Text` (verification notes distinct from the
evidence link; `AuditEntry.updatedAt`, already `@updatedAt`-managed,
doubles as the "verified at" timestamp `AuditChecklist.tsx` shows per
control — no new timestamp column needed); `RaidEntry.impact` and
`RaidEntry.mitigationPlan` (both `String? @db.Text` — the Quick-Add
drawer's two fields distinct from the free-text description); and
`RaidEntry.title String?` (see above).

**Module 1 — `src/components/modules/deal/DealEditor.tsx`** + three new
Server Actions in `src/server/actions/projects.ts`
(`updateEffortCell`/`updateDirectIntake`/`setEstimationMode`). A tab
switcher persists which intake mode is authoritative (not just a local
view toggle — `computeTotalsFor` and everything downstream reads
`project.estimationMode`). Matrix Mode is an editable phase × role grid,
one `updateEffortCell` call per cell on blur, with phase/role/grand
totals recalculating live; Direct Mode is a three-field form
(soldHours/targetRevenue/blendedMarginPct) saved together via
`updateDirectIntake` (partial saves don't make sense — Direct Mode's math
back-solves cost from margin, so all three are one atomic value). The
existing `MarginModelerCard` from WP4 is reused unmodified underneath,
fed whichever totals the editor currently holds.

**Module 2 — `src/components/modules/audit/AuditChecklist.tsx`** +
`updateAuditEntry` extended with `notes` and gated by
`authorizeProjectEdit` (it had no edit-authority check at all before
WP5). Each of the 10 controls is a card with a 4-state response selector
(Yes/Partial/No/N-A) whose click instantly lifts to the parent for a live
`computeAuditProgress` recompute — the weighted-compliance header updates
on every click, before anything is saved — plus an evidence-URL input and
a notes field, saved together per-card on the existing dirty-check + Save
convention.

**Module 3 — `src/components/modules/raid/RaidBoard.tsx`** + `raid.ts`
actions extended with `title`/`impact`/`mitigationPlan`, gated with
`authorizeProjectEdit` throughout, plus two new actions: `updateRaidEntry`
(the board's full inline-edit save — severity/description/owner/dates/
status/escalation together) and `toggleRaidEscalation` (a dedicated
one-click SteerCo flag, split out from the full edit so escalating
doesn't require opening the row). The board filters by Type and
"escalated only," and a Quick-Add drawer replaces the old inline
create-form.

**Module 4 — `src/components/modules/financials/EacEditor.tsx`** + new
`src/server/actions/financials.ts#updateFinancialActual`, upserting one
`FinancialActual` row (by the existing `roleKey`, matrix-role-id or
`'_direct'`) at a time. Every row's four fields (Actual Hours/Cost,
Forecast Hours Remaining, Open RR Hours) are lifted to the parent so
`computeEacSummary` — and the True EAC Cost / Margin / Drift KPI cards
above the table — recompute on every keystroke across every row, not just
the one being edited.

**Module 5 — `src/components/modules/schedule/ScheduleTracker.tsx`** +
new `src/server/actions/schedule.ts#updateSchedulePhase`, upserting one
`SchedulePhase` row's dates/status/% complete together (atomically, so a
lone `pctComplete` save can't momentarily pair with a stale planned-date
pair server-side — client-side, Slip and Pace Risk are always correctly
recomputed live from the full draft row). The % Complete slider drives
`computePhasePace`'s badge in real time.

**Superseded WP1-era files removed**: `audit/[projectId]/audit-row.tsx`,
`raid/[projectId]/raid-form.tsx`, `raid/[projectId]/raid-status-select.tsx`
— all fully absorbed into the new module editors above; confirmed
grep-clean of remaining imports before deletion.

**Verified the same way as WP1–4** (no `npm install` in this sandbox): the
new migration statements were applied and round-tripped against a real
local Postgres (`\d audit_entries` / `\d raid_entries` confirm every new
column); `tsc --noEmit --ignoreDeprecations 6.0 -p tsconfig.json` reports
no error outside the established sandbox-noise categories — this WP
surfaces one new code in that same category, `TS7053` ("element implicitly
has an 'any' type" on a `Record<enum, V>` index), traced to the same root
cause as the rest of the list: `useState<T>(...)`'s generic is silently
dropped when `'react'` itself can't be resolved (`Cannot find module
'react'` — confirmed directly in the raw tsc output), so the destructured
state variable collapses to `any` and any indexing expression built from
it does too. The WP2 calc-engine files themselves are untouched by this
WP (every module editor only *imports* `src/lib/calculations/*`, never
edits it), so the existing 70-test suite's pass/fail status is unchanged
from WP4's run — it was not re-executed for this WP since there is
nothing in the pure engine for it to catch that a full `tsc` pass over the
new adapter call sites wouldn't already.

## Work Package 6 — Data Pipelines, Audit Trails, Contractor Tagging & Governance Integrity

WP6 adds a governance layer on top of WP5's interactive editors: a CSV
ingestion pipeline (dry-run preview, then atomic commit), a JSON workspace
backup/restore utility, an immutable Audit Trail for the app's highest-
stakes mutations, an explicit Employee (FTE) vs. Contractor/Vendor tag on
rate-card roles, and route-aware governance guidance in the Help Drawer.

**Judgment calls made without blocking on the user** (documented here
rather than via `AskUserQuestion`, following the same standard WP4/WP5 set
— each is an implementation-detail resolution of a spec-vs-schema gap, not
an architectural fork):

- **FTE/Contractor lives on `DeliveryRole`, not `Resource`.** Sizing
  (`EffortCell`) and Financials (`FinancialActual`) are both role-keyed —
  neither table has a `resourceId` column — and the spec asks for the
  distinction to show up on exactly those two role-keyed screens. Adding a
  `resourceId` to both would be a materially bigger schema change than this
  WP's actual ask.
- **CSV ingestion is gated by `authorizeProjectEdit`, the same per-project
  check every manual edit already uses** — not the pre-declared
  `admin:ingestion` permission (added in WP4's RBAC matrix, unused until
  now). A CSV import is a bulk version of edits a user could already make
  one row at a time; `admin:ingestion` stays reserved for a hypothetical
  future roster-level bulk import that isn't this one.
- **Workspace Backup/Restore gets its own gate**, a new `admin:workspace`
  permission plus `src/server/authz.ts#authorizeAdminAction()` — distinct
  from project-scoped `authorizeProjectEdit` because export/restore can
  touch every project in the tenant at once, a genuinely different (and
  higher) blast radius than anything else in the app.
- **The Audit Trail logs exactly four mutation families by name** —
  baseline lock/unlock, EAC actual updates, RAID SteerCo escalation
  *toggles only* (not full edits), and audit control *status changes only*
  (not owner/evidence/notes edits) — plus this WP's own two new bulk
  surfaces (CSV commit, workspace restore). It deliberately does not
  extend to `updateRaidStatus`, `updateRaidEntry`, `createRaidEntry`,
  `updateEffortCell`, `setEstimationMode`, `updateDirectIntake`, or
  `updateSchedulePhase` — the spec names "critical state changes"
  specifically, not every mutation in the app.
- **Every audit-logged mutation writes its log entry inside the same
  `db.$transaction` as the state change itself** (`logAuditEvent` accepts
  either the bare `db` client or a `Prisma.TransactionClient`), so the two
  can never desync — either both commit or both roll back.
- **No-op saves skip logging.** Financial-actual updates, RAID escalation
  toggles, and audit-status changes all compare previous vs. new state
  first; an unchanged value never writes a redundant Audit Trail entry
  (escalation toggles skip the whole write, not just the log).
- **Reading the Audit Trail is a lighter check than editing** —
  `fetchAuditTrail` only confirms the project belongs to the caller's org,
  matching the access level implied by having the page open at all, not
  edit authority.
- **No new CSV library dependency.** This sandbox has no npm registry
  access (see the environment note above), so `src/lib/ingestion/csv-parsers.ts`
  hand-rolls a small RFC4180-ish tokenizer (quoted fields, embedded commas/
  newlines, doubled-quote escaping) rather than pulling in `papaparse` or
  `csv-parse` — consistent with the calc-engine's zero-dependency-pure-lib
  philosophy, and one fewer dependency even once registry access exists.
- **A CSV's optional "Employment Type" column is a cross-check warning,
  never an override** — the rate card's own `employmentType` is always
  authoritative; a mismatch imports the row anyway with a warning attached.
- **A Financial Actuals CSV's Role column must match the project's actual
  `estimationMode`** — a `"Direct"` row in a Matrix-mode project (or a
  named-role row in a Direct-mode project) is a hard error, not a silent
  fallback; the wrong-mode row is nonsensical for that project.
- **The workspace snapshot is broader than the spec's literal deliverable
  list.** The spec says the export should capture "projects, rate cards,
  baselines, actuals, resource types, and RAID registers," but also calls
  the feature a "full-tenant" backup — and a restore that silently dropped
  a project's Scope Matrix, Audit Checklist, or Schedule would corrupt
  exactly the workspace it claims to protect. The snapshot is the full
  closure needed to faithfully reconstitute a tenant's delivery state
  (Practices, the full Rate Card, the Resource directory, Org Policy +
  Control Label overrides, and every project's complete child set),
  excluding only what isn't "workspace state": Users/Memberships/logins,
  the `ActivityLogEntry` feed, and `AuditLog` itself (immutable history is
  never rewritten or truncated by a restore — see below).
- **Restore is additive/overwrite, never destructive across the tenant.**
  It upserts (id-preserving) every Practice/DeliveryRole/Resource/Project
  *present in the snapshot*, and wipes-and-recreates each of those
  projects' child collections from exactly what the file says — but it
  never deletes a Practice, role, Resource, or Project that exists in the
  live tenant but isn't in the file. A literal "make the tenant exactly
  match this old backup" restore would silently destroy every project
  created since the backup was taken, which is a far more dangerous
  default than an admin restoring an old snapshot actually expects.
- **`Resource.userId` (the login link) is never written by restore**,
  create or update — a restored resource never re-links to whatever `User`
  currently happens to hold the snapshot's original id, and an existing
  login link on a resource already in the tenant is never touched or
  cleared.

**Schema additions** (`prisma/migrations/00000000000003_wp6_governance/`,
verified against a real local Postgres): a new `ResourceEmploymentType`
enum (`FTE`/`CONTRACTOR`) and `DeliveryRole.employmentType` (defaults
`FTE`); a new `AuditLog` model (`organizationId`, `projectId?`, `userId?`,
`action`, `entityType`, `entityId?`, `previousState Json?`, `newState
Json?`, `createdAt`) with relations from `User`/`Organization`/`Project`
and two indexes (`[organizationId, createdAt]`, `[projectId, createdAt]`).

**1. CSV Ingestion Pipeline** — `src/lib/ingestion/csv-parsers.ts` (pure,
zero React/Next/Prisma dependency, same philosophy as
`src/lib/calculations/*`) exports three parsers — `parseEffortMatrixCsv`,
`parseRaidCsv`, `parseFinancialActualsCsv` — each returning a row-by-row
result (`data` when clean, `issues[]` of `error`/`warning` severity
otherwise) rather than throwing on the first bad row. `src/server/actions/ingestion.ts`
wraps them in a two-action dry-run/commit surface: `previewCsvImport`
parses server-side against the org's live roster and writes nothing;
`commitCsvImport` re-parses the *same raw text* itself (never trusts a
client-round-tripped "already validated" payload), writes only the clean
rows in one `db.$transaction`, and logs one `CSV_IMPORT_COMMITTED` entry
summarizing the batch. `src/components/ingestion/CsvImportModal.tsx` is
one generic modal parameterized by `kind` (`effort`/`raid`/`financials`) —
file picker → `FileReader` client-side read → preview table → commit —
wired in via an "Import CSV…" trigger in `DealEditor.tsx`, `RaidBoard.tsx`,
and `EacEditor.tsx`.

**2. Workspace Backup & Restore** — `src/lib/backup/workspace-io.ts` (pure:
a zod schema for the snapshot shape, `validateWorkspaceSnapshot`,
`buildWorkspaceSnapshot`, and a referential-integrity checker) plus
`src/server/actions/backup.ts` (`exportWorkspaceSnapshot` /
`restoreWorkspaceSnapshot`, both gated by `authorizeAdminAction('admin:workspace')`).
`src/components/admin/WorkspaceBackup.tsx`, mounted on the Admin & Org
Setup page, exports a downloaded JSON file and restores from a
user-picked file behind a strong confirmation dialog that spells out
exactly what gets overwritten.

**3. Audit Trail Engine** — `src/lib/audit/logger.ts#logAuditEvent` is the
one place in the app allowed to write an `AuditLog` row (no update/delete
path exists anywhere else — that's what makes it "immutable" in practice).
Hooked into `toggleProjectLock` (`projects.ts`), `updateFinancialActual`
(`financials.ts`), `toggleRaidEscalation` (`raid.ts`), and
`updateAuditEntry` (`audit.ts`), plus the two new WP6 bulk-mutation
actions above. `src/server/actions/audit-log.ts#fetchAuditTrail` and
`src/components/projects/AuditTrailDrawer.tsx` (a slide-over drawer,
mounted in `ProjectHeader.tsx` behind a new "Audit Trail" button) show the
most recent 200 entries per project, filterable by action, each with a
field-level before/after diff.

**4. Employee vs. Contractor Financial Visibility** — `RateRole` (calc
`types.ts`) and `toRateRoles` (`calc-adapters.ts`) now carry
`employmentType`; `EacRow` (`calculations/financials.ts`) carries it too,
and a new pure `computeContractorExposure(eac)` sums actual+forecast+open-RR
cost/hours across contractor-tagged roles (not applicable in Direct Intake
mode, which has no per-role breakdown). `DealEditor.tsx`'s matrix header
and `EacEditor.tsx`'s role rows both show an FTE/Contractor badge per
role, and `EacEditor.tsx` gets a fifth KPI card, "Contractor / 3rd-Party
Cost Exposure." Admin & Org Setup's Roles & Rate Card Matrix gets a new
employment-type toggle per role (`setDeliveryRoleEmploymentType`, a
dedicated action rather than folding into a general "edit role" action
that doesn't otherwise exist) plus a selector on the create-role form.

**5. Contextual Help Enrichment** — `HelpDrawer.tsx` gets a new explicit
`/raid` section (previously folded into the generic fallback) and a new
explicit `/` (PS Control Tower) section, and the existing `/deal`,
`/audit`, `/financials` sections each gain a governance-tie-in entry (CSV
import, the Audit Trail, or Contractor Exposure, as relevant to that
module). The generic fallback (still used for `/admin` and anything
unmatched) gains a "Governance, end to end" summary tying CSV ingestion,
the Audit Trail, and Workspace Backup & Restore together.

**Verified the same way as WP1–5** (no `npm install` in this sandbox): the
new migration statements were applied and round-tripped against a real
local Postgres (`\d delivery_roles` / `\d audit_logs` confirm every new
column, enum, index, and foreign key); `tsc --noEmit --ignoreDeprecations
6.0 -p tsconfig.json` reports no error outside the established
sandbox-noise categories — this WP surfaces one new code in that same
category, `TS2345` ("Argument of type 'unknown' is not assignable to
parameter of type 'string'") on `AuditTrailDrawer.tsx`'s
`availableActions.map((a) => actionMeta(a))`), traced to the identical
root cause as the rest of the list (`'react'`/`@prisma/client` failing to
resolve at all cascades into unrelated type collapses elsewhere) rather
than a real defect — `entries` is concretely typed `AuditTrailEntry[]`
with `action: string`, so `a` is provably `string` regardless of what an
un-resolvable `'react'` module does to JSX's ambient types. Because the
`vitest` harness wasn't fully present at the start of this session (only
`src/lib/constants.ts` and `tests/calculations.test.ts` existed under
`/tmp/verify-tests/`, no runner) and rebuilding it was out of scope for
this WP, the two new pure-function surfaces were instead hand-verified by
transpiling them with `tsc` in isolation (`--ignoreConfig`) and running
targeted assertions under plain Node: all three CSV parsers (valid rows,
role/phase/severity/owner mismatches, the Direct-vs-Matrix mode guard, and
the Employment Type cross-check warning) and `computeContractorExposure`
(matrix-mode attribution math, the Direct-mode "not applicable" case, and
an all-FTE project correctly reporting 0%) — every assertion passed. The
WP2 calc-engine's existing 70-test suite's pass/fail status is otherwise
unchanged from WP5's run (its files are extended additively —
`employmentType` and `computeContractorExposure` are new fields/exports,
nothing existing was altered) and was not re-run in full for the same
reason as WP5: nothing in this WP's diff touches the pure engine's
existing computation paths.

## Work Package 7 — Executive Reporting Hub, Flight Path Variance & Decision Governance

WP7 adds a dedicated executive reporting surface on top of WP1–6's module
pages: a central Reports Hub (`/reports`), three standardized briefing
exports (a 16:9 SteerCo Status Deck, a multi-project Portfolio Margin
Rollup CSV, and a Stage-Gate Audit Verification Certificate), and a new
per-project SteerCo Decision & Action Tracker — plus the three pure
calculations those exports needed and didn't already have: Flight Path
Variance (Sold → Approved Baseline → True EAC margin), Open Demand &
Contractor Burn Risk, and Burn-to-Date %.

**Judgment calls made without blocking on the user** (documented here
rather than via `AskUserQuestion`, following the same standard WP4–6 set):

- **`SteerCoDecision` is its own model, not a repurposed `RaidEntry`.** A
  RAID item is a risk/issue/assumption/dependency to *manage*; a SteerCo
  decision is a specific ask *of the steering committee itself* ("approve
  the change order"). The deck's RAID section and Decision Tracker section
  are deliberately two different lists, sourced from two different tables.
- **Decision Tracker mutations are gated by `authorizeProjectEdit`**, the
  same per-project edit tier every other module mutation uses — not a new
  permission — consistent with WP6's "reuse the existing project-edit gate
  unless the blast radius is genuinely tenant-wide" precedent.
- **Decision Tracker mutations are NOT written to the WP6 Audit Trail.**
  WP6 deliberately scoped `logAuditEvent` to exactly four named mutation
  families plus its own two bulk surfaces (see the WP6 section above); a
  decision's own `status`/`updatedAt`/`resolutionNotes` fields already
  serve as that record's history, and extending the trail to every future
  model would erode the discipline WP6 was built to establish.
- **The Reports Hub is NOT gated by the reserved `steerco:view` permission**
  (ADMIN/VP_EXECUTIVE-only since WP4). That permission stays reserved for a
  future, unrestricted cross-portfolio "SteerCo War Room" (still listed
  under What's next below). This Hub is instead scoped the same way every
  other portfolio surface is — `getScopedProjectsForUser` — so a
  PROJECT_MANAGER can generate a SteerCo deck for their own engagement,
  which a `steerco:view` gate would have blocked entirely.
- **`SteerCoReportView.tsx` and `AuditCertificateView.tsx` are pure
  HTML-string builders, not JSX components**, despite the `.tsx` extension
  and the spec's literal component paths. Both documents are opened via
  `window.open()` outside Next's page-rendering tree for the browser's own
  Print-to-PDF, so neither has compiled Tailwind CSS available to it —
  exactly the constraint the pre-existing `status-report` route already
  solved this way; WP7 just extends the same technique to two more
  documents and factors the render logic out of the route handlers.
  `AuditCertificateView.tsx` duplicates rather than imports
  `SteerCoReportView.tsx`'s palette/helpers on purpose — each print target
  must stand alone as a complete, self-contained document.
- **Flight Path Variance's "Approved Baseline Margin %" reads
  `Project.baselineSnapshot.marginPct`** — the same JSON blob
  `toggleProjectLock` already writes at lock time — via a runtime type
  guard, since it's untyped `Json?`. No baseline is a first-class `'no-baseline'`
  status, not an error or a zero.
- **Burn-to-Date % is measured against True EAC Cost, not sold/baseline
  cost.** That answers "how far through the *current* plan are we," which
  is what a portfolio reviewer actually wants; measuring against a stale
  original estimate would artificially inflate or deflate the number for
  any project that has re-forecast.
- **Open Demand Risk's bands (5%/15%) and Flight Path's drift threshold
  (0.05pt) are deliberately simple, round, documented thresholds** — in the
  same spirit as the schedule engine's own pace-risk bands (50%/75%
  elapsed) and the EAC engine's own 0.05pt drift threshold. The point is a
  fast, explainable signal on an executive deck, not a tuned model.
- **The Portfolio CSV excludes PARENT-hierarchy program containers**, same
  reasoning as `computePortfolioSummary`'s own exclusion — a program
  container has no sizing/financials of its own to roll up.
- **The Portfolio CSV route is a plain `GET` with `Content-Disposition:
  attachment`**, not a Server Action + client-side Blob download (the
  `WorkspaceBackup.tsx` pattern) — a CSV export needs no confirmation step,
  and this matches the existing project JSON-export route exactly.
- **No CSV library dependency**, for the same "no npm registry access in
  this sandbox" reason as WP6's ingestion parsers: `src/lib/reports/portfolio-csv.ts`
  hand-rolls a small RFC4180-ish escaper (quoting, doubled-quote escaping,
  CRLF line endings) rather than pulling one in.

**Schema additions** (`prisma/migrations/00000000000004_wp7_reporting/`,
verified against a real local Postgres): a new `SteerCoDecisionStatus` enum
(`OPEN`/`RESOLVED`) and a new `SteerCoDecision` model
(`projectId`, `decisionRequired`, `decisionOwnerId?` → `Resource`,
`resolutionTargetDate?`, `status` default `OPEN`, `resolutionNotes?`,
`createdAt`/`updatedAt`), indexed on `projectId`, cascading on project
delete and nulling on owner delete.

**1. Central Reporting Hub** — `src/app/(dashboard)/reports/page.tsx`
(server: resolves the role-scoped project set via the same
`getScopedProjectsForUser` every portfolio surface uses, reads `?project=`
for deep-linking from a module page) + `src/components/reports/reports-hub-client.tsx`
(client: project selector, the three launcher cards, and the embedded
Decision Tracker manager — add/resolve/reopen/delete, mirroring
`RaidBoard.tsx`'s Server-Action-plus-`router.refresh()` conventions). A new
"Reports Hub" link on `ProjectHeader.tsx` deep-links here with the current
project preselected, and `/reports` is now in the sidebar (`Sidebar.tsx`).

**2. Executive Report Generators** —
`src/lib/calculations/reporting.ts` (pure: `computeFlightPathVariance`,
`computeOpenDemandRisk`, `computeBurnToDatePct`) is the new math;
`src/components/reports/SteerCoReportView.tsx` and
`AuditCertificateView.tsx` are the new HTML-string print views (see the
judgment-call note above on why they're not JSX); `src/app/api/projects/[projectId]/status-report/route.ts`
was rewritten to compute and pass through the Flight Path bar, the Open
Demand & Contractor Burn alert, the top 3 SteerCo-escalated RAID risks
(sorted by severity then target date), and the Decision Tracker rows; the
new `src/app/api/projects/[projectId]/audit-certificate/route.ts` resolves
control labels the same way `audit/[projectId]/page.tsx` already does
(`labelByKey.get(c.id) ?? getControlDef(c.id)?.labels[methodologyKey] ?? c.id`)
and generates a deterministic `certificateId` from the project id + date
rather than persisting a certificate registry.

**3. Portfolio Rollup CSV** — `src/lib/reports/portfolio-csv.ts` (pure:
`buildPortfolioCsvRows`, `serializePortfolioCsv`) plus
`src/app/api/reports/portfolio-csv/route.ts`, scoped via
`getScopedProjectsForUser` so a download contains exactly the caller's own
portfolio slice, with one row per non-PARENT project: Sold vs. True EAC
Margin, Drift in basis points, Burn-to-Date %, and Open RR Hours exposure.

**4. SteerCo Decision & Action Tracker** — `src/server/actions/steerco.ts`
(`listSteerCoDecisions`, `createSteerCoDecision`,
`updateSteerCoDecisionStatus`, `deleteSteerCoDecision`), consumed by both
the Reports Hub's embedded manager and the SteerCo deck's own Decision
Tracker table.

**Verified the same way as WP1–6** (no `npm install` in this sandbox): the
new migration was applied and round-tripped against a real local Postgres
(`\d steerco_decisions` confirms the enum default, index, and both foreign
keys); `tsc --noEmit --ignoreDeprecations 6.0 -p tsconfig.json` reports no
error outside the established sandbox-noise categories — every error code
this WP's files produce (`TS7026`, `TS2307`, `TS7006`, `TS2339`, `TS7053`,
`TS2322`) is already in that documented list, and a whole-repo scan
confirms no new error code appears anywhere. The three new pure functions
(`computeFlightPathVariance`, `computeOpenDemandRisk`,
`computeBurnToDatePct`) and the CSV serializer were hand-verified with a
`tsx`-run script (same technique as WP6, since the `vitest` harness still
isn't fully rebuilt in this sandbox): the no-baseline case, the erosion/
upside/on-track classification including the exact ±0.05pt boundary, the
0%/5%/15% demand-risk band boundaries, the zero-denominator guards on both
Open Demand Risk and Burn-to-Date, and the CSV's basis-point drift math,
rounding, RFC4180 comma-quoting, CRLF endings, and empty-portfolio
header-only case — 14 assertions, all passing. The WP2 calc-engine's
existing test suite is unaffected (this WP adds a new file rather than
touching any existing calculation path).

## Work Package 8 — Commercialization, Legal Pages, Support Ticketing & Admin Onboarding

WP8 is a commercialization pass rather than a new module: intellectual
property branding/copyright enforcement across the shell UI and core
engine files, public Terms of Service and Privacy Policy pages, an in-app
Support & Ticket Submission surface, and the operator-facing documentation
(this README's own local-setup section, plus a new
`docs/ADMIN_ONBOARDING.md`) needed to actually stand the app up and run a
first tenant end to end.

**Judgment calls made without blocking on the user** (documented here
rather than via `AskUserQuestion`, following the same standard WP4–7 set):

- **No new `SupportTicket` database model.** The spec's own deliverable
  wording asks for the server action to process a ticket payload "with
  structured logging," not persistence — read literally, and consistent
  with this sandbox's now-familiar constraint of having no real ticketing
  system to integrate with (no npm registry access — see the environment
  note above — and no real Zendesk/Jira/Freshdesk account to call).
  `submitSupportTicketAction` (`src/server/actions/support.ts`) validates
  the ticket, resolves the requester's *real* identity server-side via
  `requireOrgContext()` (never trusting the client-displayed
  name/email/org — the same rule every other server action in this app
  follows), mints a stable `SUP-<timestamp36>-<rand4>` reference, and emits
  one structured `[SUPPORT_TICKET] {...}` JSON log line a real deployment's
  log pipeline would forward to whatever ticketing system it actually
  uses. Swapping this for a `db.supportTicket.create(...)` call or an
  outbound webhook later is a one-function change.
- **The Support modal's auto-populated Name/Email/Organization block is
  cosmetic, not authoritative.** It's shown so the user can see exactly
  what accompanies their ticket, but the server action re-derives all of
  it from the session itself; only the free-text ticket fields and the
  current route (which the server cannot know on its own) actually travel
  from the client payload.
- **Two support entry points, one global modal** — `SupportTicketModal.tsx`
  is mounted once in the dashboard layout (same pattern as
  `CommandPalette`/`HelpDrawer`) and opened either from a new dedicated
  icon in `Header.tsx` (next to the existing "?" Help trigger) or from a
  new "Contact Support →" footer CTA inside `HelpDrawer.tsx` itself, which
  closes the help drawer before opening the modal rather than stacking two
  full-attention overlays.
- **`/terms` and `/privacy` are a new `(public)` route group**, deliberately
  outside `(dashboard)` (no Sidebar/Header/RBAC-scoped data fetch — a page
  here must render for a visitor with no account at all, which
  `requireOrgContext()` would otherwise redirect away from) and outside
  `(auth)` (they're not a sign-in flow). `middleware.ts`'s matcher was
  extended to exclude both routes from the auth gate, alongside the
  pre-existing `login`/`register`/`onboarding` exclusions — a ToS has to be
  readable by someone who hasn't signed up yet, and be the actual document
  a signed-in user's account is bound by.
- **Both legal pages are placeholder terms for this project's own
  consistently-used fictional company** ("A2R Ventures LLC" — the same
  entity name used in every export footer since WP3 and WP7's Audit
  Certificate/SteerCo Deck), not a real company's actual legal terms. A
  real deployment needs qualified counsel to review both documents before
  they govern a real customer relationship.
- **Copyright headers went on the core calculation engines
  (`src/lib/calculations/*.ts` except `_internal.ts`/`index.ts`/`types.ts`,
  which are internal plumbing rather than "engines" in the spec's sense)
  and the authentication/authorization utilities** `src/lib/auth.ts`,
  `src/lib/session.ts`, and `src/lib/auth/rbac.ts` — the last one read
  broadly as an "authentication utility" even though it's strictly
  authorization (RBAC), since it's the other half of "who is this
  request allowed to act as" alongside `auth.ts`/`session.ts` and lives
  under the same `src/lib/auth/` namespace.
- **The ™ mark on `Header.tsx` is an accessible label, not new visible
  chrome.** Header's design is organization-focused (the workspace
  switcher shows the *active org's* name, not the app's), so forcing a
  second, visually competing "A2R Delivery OS™" string in there would
  fight the existing layout. Instead the workspace-switcher button carries
  `title="A2R Delivery OS™"` plus a screen-reader-only label, and the
  browser tab title (`src/app/layout.tsx`'s `metadata.title`) now reads
  "A2R Delivery OS™" — real, global, page-independent brand real estate
  every route already shares. `Sidebar.tsx`'s own brand wordmark (the one
  actually visible on every dashboard page) gets the ™ directly.
- **`Footer.tsx` is a plain server component reused verbatim in both
  shells** (`(dashboard)/layout.tsx` and the new `(public)/layout.tsx`) —
  it deliberately does *not* surface its own "Contact Support" action,
  since that depends on `DashboardUIProvider` client context a logged-out
  public page never has; support access stays exactly where the spec put
  it, in `HelpDrawer.tsx` and `Header.tsx`.
- **`docs/ADMIN_ONBOARDING.md` documents what the app actually does, not
  what the spec's step titles literally imply.** Two of the four steps
  ("rate card CSV upload," "role invitations") describe capabilities that
  don't exist in this build — WP6's CSV pipeline covers three *per-project*
  imports (Effort Matrix, RAID, Financial Actuals), not the tenant-wide
  rate-card roster, and there is still no self-serve invite flow (`/register`
  always creates a brand-new organization; it can't join an existing one —
  this has been the single most-cited "What's next" item since WP4). Rather
  than document a fictional feature, the guide describes the real path for
  each (manual entry via the Roles & Rate Card Matrix, or a Workspace
  Backup JSON restore for bulk-seeding; roster entries via the Resources
  panel, with an explicit callout that a roster entry isn't a login) and
  names both as known gaps, matching this project's standing practice of
  surfacing real limitations rather than glossing over them.

**No schema changes this WP** — WP8 is UI, routing, documentation, and one
new server action; nothing here touches `prisma/schema.prisma`.

**1. Branding & Copyright Enforcement** — `Sidebar.tsx`'s wordmark now
reads "A2R Delivery OS™"; the browser tab title and workspace-switcher
`title`/`sr-only` label carry it too (see the judgment-call note above for
why `Header.tsx` doesn't get a second visible wordmark). New
`src/components/layout/Footer.tsx` renders "A2R Delivery OS™ · © {year} A2R
Ventures LLC. All rights reserved." plus Terms/Privacy links, mounted in
both `(dashboard)/layout.tsx` (below `<main>`) and the new
`(public)/layout.tsx`. A short copyright/license banner comment was
prepended to every file in `src/lib/calculations/` (excluding internal
plumbing), `src/lib/auth.ts`, `src/lib/session.ts`, and
`src/lib/auth/rbac.ts`.

**2. Public Legal & Compliance Pages** — `src/app/(public)/layout.tsx` (a
lighter, unauthenticated shell: brand mark, Terms/Privacy/Sign-in nav, the
same `Footer.tsx`) plus `src/app/(public)/terms/page.tsx` (12 sections:
acceptance, definitions, license grant, the Customer-Data-vs-A2R-IP
ownership split, reverse-engineering and resale restrictions, the Mon–Fri
8:00 AM–6:00 PM EST support SLA with per-priority target response times,
term/termination, warranty disclaimer, liability limitation, governing law,
change process, contact) and `src/app/(public)/privacy/page.tsx` (11
sections: what's collected, the multi-tenant `organizationId`-scoped
isolation model, AES-256-at-rest/TLS-1.3-in-transit encryption, an explicit
no-data-selling commitment, retention/deletion, user rights, cookies,
children's privacy, changes, contact). `middleware.ts`'s route matcher now
excludes both.

**3. In-App Support Ticketing** — `src/components/support/SupportTicketModal.tsx`
(subject/category/priority/description form, read-only auto-populated
identity/route context, a confirmation screen showing the generated ticket
reference) plus `src/server/actions/support.ts#submitSupportTicketAction`
(zod-validated, server-resolved identity, structured JSON logging — see
the judgment-call note above). `dashboard-ui-context.tsx` gained a third
open/close flag (`supportModalOpen`) alongside the existing command-palette
and help-drawer ones, wired to Escape-to-close the same way. Triggered from
a new icon in `Header.tsx` and a new footer CTA in `HelpDrawer.tsx`.

**4. Admin Onboarding & Documentation** — `docs/ADMIN_ONBOARDING.md`, a
4-step quickstart (workspace profile setup, rate-card setup, adding team
members, initial baseline creation) covering both what's fully self-serve
today and the two documented gaps above. This README gained a proper
**Local Development Setup** section (below) in place of the previous
terse "First run" snippet, and this WP8 section.

**Verified the same way as WP1–7** (no `npm install` in this sandbox):
`tsc --noEmit --ignoreDeprecations 6.0 -p tsconfig.json` reports no error
outside the established sandbox-noise categories across every new/changed
file (`(public)/terms/page.tsx`, `(public)/privacy/page.tsx`,
`(public)/layout.tsx`, `Footer.tsx`, `SupportTicketModal.tsx`,
`support.ts`, `dashboard-ui-context.tsx`, `Header.tsx`, `HelpDrawer.tsx`,
`Sidebar.tsx`, `middleware.ts`, `layout.tsx`, and the eight
copyright-banner files) — no new error code appears anywhere in a
whole-repo scan. There's no new pure-calculation surface this WP (no
schema, no new `src/lib/calculations/*` function), so there's nothing to
hand-verify under `tsx` the way WP6/WP7 did; the one new server action
(`submitSupportTicketAction`) was instead read-through-checked against its
own zod schema by hand (empty subject/description rejected below the
3/10-character minimums, an out-of-enum category/priority rejected,
`route` optional and defaulted to `''`) rather than round-tripped against a
live Postgres, since it writes no database row.

## Phase 3b — Sprints 1–5: Design System, Command Layer & Executive Briefing

Phase 3b is a UX and operator-experience pass on top of the GA (v1.0.0)
foundation. It ships the obsidian design system, a single-pane Command
Center, a universal ⌘K palette, a platform-telemetry console, and the
SteerCo Briefing, then reorders the sidebar to the delivery workflow.
Released as **v1.1.0** (see `CHANGELOG.md` / the in-app Release Notes).

End-user documentation for everything below lives in
**`docs/USER_MANUAL.md`** (User Manual & Operator's Guide).

### Requirements traceability (Sprints 1–5)

| # | Capability | Primary files | Automated coverage |
| --- | --- | --- | --- |
| S1 | **Obsidian design system** — obsidian ground, single `#0A84FF` accent, flat shadow-free surfaces, status-only status colors | `tailwind.config.ts`, `src/app/globals.css`, `src/components/ui/brand-mark.tsx` | visual; token usage compiled via `tsc` + full `vitest` gate |
| S1 | **`Container` layout primitive** — single-column, generous padding, four size presets | `src/components/ui/container.tsx` | consumed by every new route |
| S2 | **Command Center** route | `src/app/(dashboard)/command/page.tsx` | `tests/command-center.test.ts` |
| S2 | **Pulse strip** — venture vitals (book of business, velocity, margin, risk) | `src/components/command-center/PulseStrip.tsx` | masking-aware via `canViewMargins` |
| S2 | **Active Stream** — merged activity + governance + open escalated risk, newest-first | `src/components/command-center/ActiveStream.tsx`, `src/server/queries/active-stream.ts` | `tests/command-center.test.ts` |
| S2 | **Command Bar** — natural-language resolver (`<module> for <engagement>`, verbs, actions) | `src/components/command-center/CommandBar.tsx`, `src/lib/command-center/commands.ts` | `tests/command-center.test.ts` (routing, verb-strip, staff-gate, cap) |
| S2 | `relativeTime` / money + percent formatters | `src/lib/relative-time.ts`, `src/lib/format.ts` | `tests/command-center.test.ts` |
| S3 | **Platform Pulse** operator console — build / DB probe / test / git telemetry | `src/app/(admin)/ops/pulse/page.tsx`, `src/server/queries/platform-pulse.ts`, `src/lib/dev-signals.ts` | `tests/platform-pulse.test.ts` |
| S3 | **Health poller** — 15s `/api/health/ready` check in the Ops header | `src/components/ops/PlatformHealthPoller.tsx` | — |
| S3 | **API bulk-ingest → tenant Active Stream** — each feed logs an activity event | `src/app/api/v1/ingest/timesheets/route.ts` | `tests/templates.test.ts`, live-DB isolation suite |
| S3 | vitest JSON reporter for the test-suite signal | `vitest.config.ts`, `.gitignore` (`/.a2r/`) | — |
| S4 | **Universal ⌘K / Ctrl+K palette** — global, context-free, route-prefetching | `src/components/command-k/CommandK.tsx`, `src/server/actions/command-k.ts`, `src/lib/command-center/command-k-results.ts` | `tests/command-k.test.ts` |
| S4 | **Micro-interactions** — 120ms transitions, blue focus ring, reduced-motion opt-out | `src/app/globals.css` | visual |
| S4 | ⌘K event bus — `openCommandPalette()` dispatches `a2r:command-k` | `src/components/layout/dashboard-ui-context.tsx`, `src/app/layout.tsx` | `tests/command-k.test.ts` |
| S5 | **SteerCo Briefing** route + view (cover, Pulse, margin health, what-moved, watchlist) | `src/app/(dashboard)/steerco/page.tsx`, `src/components/reports/SteerCoBriefingView.tsx`, `src/server/queries/steerco-briefing.ts` | `tests/steerco-briefing.test.ts` |
| S5 | **Print / PDF export** — light-document reflow, no UI noise, no page-splitting | `@media print` block in `src/app/globals.css` | visual |
| UX | Sidebar reordered to the delivery workflow; Command Bar moved to top of `/command` | `src/components/layout/Sidebar.tsx`, `src/app/(dashboard)/command/page.tsx` | full `vitest` + `tsc` gate |

**Removed:** the dashboard-only `CommandPalette.tsx` / `command-palette.ts`
(superseded by the global `CommandK`).

**Verification:** `npx tsc --noEmit` → 0 errors; `npx vitest run` → **165
passed** across 15 files (13 pure-unit + 2 live-database security suites).

### Placement decision — telemetry is operator data, not tenant data

Sprint 3 asked for git / dev-server / build / test signals in "the Pulse
strip" and "the Active Stream". Those are properties of the platform
deployment, not of any one tenant — surfacing them inside a tenant's
workspace would break the tenant-isolation guarantee in `docs/SECURITY.md`
and is meaningless in production (there is no `localhost:3000` dev server).
So engineering telemetry went to a **staff-gated `/ops/pulse`** console
that reuses the same `PulseStrip` / `ActiveStream` components, while the
automation that genuinely belongs to a tenant — the API bulk-ingest feed —
writes into that tenant's own Active Stream.

## Phase 3c — Enterprise Governance & Identity (v1.2.0)

Phase 3c makes the platform enterprise-configurable per tenant: a
role-based landing layer, a governance framework that bundles pre-tested
compliance postures with tenant-level toggles, and an SSO / identity
federation engine. Released as **v1.2.0**.

End-user instructions live in **`docs/USER_MANUAL.md`** (§3, §7); the
security posture is in **`docs/SECURITY.md`** (§1, §4, §8, §10).

### FRD — functional summary

- **Role-based landing & perspective switcher.** A `WorkspaceLens` axis
  (Executive / Delivery / Finance / Operations) — distinct from the
  `DeliveryRole` security tier and the client-only `Persona` preview —
  drops a multi-role user on their tailored landing page after sign-in and
  can be re-pointed from a header switcher. Every module stays reachable
  from the sidebar and ⌘K regardless of lens.
- **Enterprise Governance Framework (Hybrid Configuration Model).**
  *Layer 1* is a pre-built **compliance template** — Standard Delivery,
  Strict Financial Governance, Agile Delivery, or Board-Only. *Layer 2* is
  the tenant's own overrides on top: which modules appear in navigation
  (**route visibility**), and whether blended margin / EAC / cost variance
  is scrubbed for delivery roles below VP (**financial data masking**,
  layered on the existing role-based tiers). The stored template resolves
  to `CUSTOM` once the settings diverge from any bundle. Config lives on
  `OrgContext.governance`, so every page and server action sees it.
- **Enterprise SSO / Identity Federation.** One IdP per tenant — SAML 2.0
  or OIDC, with setup presets for **Microsoft Entra ID (Azure AD)**,
  **Okta**, and **Google Workspace** (plus a generic option). Admins paste
  IdP metadata (SAML EntityDescriptor XML) or an OIDC discovery URL and
  **verify** it (endpoints + signing-certificate fingerprint extracted and
  pinned). The OIDC client secret is AES-256-GCM encrypted at rest; only a
  fingerprint is ever shown.
- **JIT provisioning & security-group → role mapping.** On a federated
  login, the assertion's group / role claims are matched
  (case-insensitively, lowest-priority-wins) against the tenant's
  `SsoGroupMapping` rows to resolve a delivery + console role; a
  `Membership` is then created — or an SSO-provisioned one re-synced — in
  one transaction. Admin-assigned (`MANUAL`) memberships are never re-roled
  by JIT. When SSO is **enforced** for a domain, password login for that
  domain is refused at the NextAuth `signIn` callback.

### RTM — requirements traceability (Phase 3c)

| # | Capability | Primary files | Automated coverage |
| --- | --- | --- | --- |
| RL-1 | **Workspace-Lens resolver** — available lenses, role default, stored-choice validation | `src/lib/workspace/lenses.ts` | `tests/workspace-lens.test.ts` (14) |
| RL-2 | **Landing dispatcher** `/launch` — post-sign-in redirect to the resolved lens | `src/app/launch/page.tsx`, `src/server/actions/workspace-lens.ts` (cookie) | covered by RL-1 + live e2e |
| RL-3 | **Header perspective switcher** | `src/components/layout/LensSwitcher.tsx`, `src/components/layout/Header.tsx` | RL-1 |
| GV-1 | **Governance config model** — templates, `detectTemplate`, `applyTemplate`, `resolveStoredGovernance`, `withOverrides` | `src/lib/governance/config.ts`, `src/lib/governance/service.ts` | `tests/governance-config.test.ts` (20) |
| GV-2 | **Compliance templates** — Standard / Strict Financial / Agile Delivery / Board-Only | `GOVERNANCE_TEMPLATES` in `config.ts` | `tests/governance-config.test.ts` |
| GV-3 | **Route visibility** — hidden modules filtered from navigation; core modules immune | `src/components/layout/Sidebar.tsx` (`hiddenHrefs` prop), `src/app/(dashboard)/layout.tsx` | `tests/governance-config.test.ts` (`isPathHidden`, `hiddenHrefs`) |
| GV-4 | **Financial data masking** — `maskFinancialsForDelivery` downgrades Practice Director → restricted | `src/lib/security/masking.ts` (optional `FinancialMaskOptions`), threaded through `/`, `/command`, `/steerco`, `/reports`, `/financials/[id]`, `/commercial-baseline/[id]` | `tests/masking.test.ts` (+6) |
| GV-5 | **`GovernanceConfig` schema** + admin actions + ledger event | `prisma/schema.prisma`, `src/server/actions/admin.ts` (`applyGovernanceTemplate`, `updateGovernanceConfig`), `LedgerActionType` `GOVERNANCE_CONFIG_CHANGE` | migration `00000000000005_step1_governance` |
| GV-6 | **Governance admin panel** | `src/app/(dashboard)/admin/admin-panels.tsx` (`GovernancePanel`) | live e2e (apply Board-Only → sidebar filters → restore) |
| ID-1 | **IdP vendor presets + email-domain helpers** (client-safe, zero-dep) | `src/lib/identity/vendors.ts` | `tests/identity-metadata.test.ts` |
| ID-2 | **Secret-at-rest crypto** — AES-256-GCM, fingerprint | `src/lib/identity/crypto.ts` | `tests/identity-crypto.test.ts` (5) |
| ID-3 | **Metadata verification** — SAML EntityDescriptor parse + OIDC discovery validate | `src/lib/identity/metadata.ts`, `src/lib/identity/service.ts` (`fetchOidcDiscovery`) | `tests/identity-metadata.test.ts` (~15) |
| ID-4 | **Security-group → role mapping** | `src/lib/identity/mapping.ts` | `tests/identity-mapping.test.ts` (8) |
| ID-5 | **JIT provisioning decision core + orchestrator** | `src/lib/identity/jit.ts`, `src/server/services/identity-jit.ts` (`applyFederatedLogin`) | `tests/identity-jit.test.ts` (8) |
| ID-6 | **`IdentityProvider` / `SsoGroupMapping` schema** + `Membership.provisionedVia` | `prisma/schema.prisma` | migration `00000000000006_step2_identity_federation` |
| ID-7 | **Identity admin panel** — config, verify, group mappings, enable / enforce | `src/app/(dashboard)/admin/identity-federation-panel.tsx`, `src/server/actions/identity.ts` | live e2e (create OIDC connection → status chips → remove) |
| ID-8 | **SSO enforcement** — password login blocked for an enforced domain | `src/lib/auth.ts` (`signIn` callback), `src/lib/identity/service.ts` (`isSsoEnforcedForEmail`), `src/app/(auth)/login/page.tsx` (`AccessDenied` copy) | — |
| UX | **Sidebar icons + child-item indentation**; **soft-charcoal theme** (obsidian → `#12141C` cool-charcoal ramp, hairlines preserved) | `src/components/layout/Sidebar.tsx`, `tailwind.config.ts`, `src/app/global-error.tsx`, `src/components/reports/{SteerCoReportView,AuditCertificateView}.tsx` | visual; full `tsc` + `vitest` gate |

**Ledger:** `SSO_CONFIG_CHANGE` and `SSO_JIT_PROVISION` join
`GOVERNANCE_CONFIG_CHANGE` as new `LedgerActionType`s — every governance
and federation change is hash-chained in the Compliance Ledger.

**Not yet wired (follow-on):** the live IdP handshake itself — browser
redirect to the IdP, assertion signature validation against the pinned
cert / JWKS, and a NextAuth per-tenant provider. Everything up to "a
verified federated identity in hand" is built and tested;
`applyFederatedLogin()` is the single seam it plugs into.

**Verification:** `npx tsc --noEmit` → 0 errors; `npx vitest run` → **231
passed** across 21 files (19 pure-unit + 2 live-database security suites).

## Phase 3d — Executive Clarity, the RBAC Master Matrix & Self-Service Batch Import (v1.2.2 – v1.3.0)

Phase 3d is a visual, navigational, and data-operations pass on top of
Phase 3c: a full light-theme redesign with a new logo, a central RBAC
permission matrix that drives real navigation omission and route
enforcement (not just the masking tiers Phase 3c added), and a tenant-wide
self-service engine for weekly BAU batch uploads with a real quarantine
and correction workflow. Released as **v1.2.2** (Executive Clarity) through
**v1.3.0** (this release).

End-user instructions live in **`docs/USER_MANUAL.md`** (§6, §10); the
security posture is in **`docs/SECURITY.md`** (§8, §9); the schema is in
**`docs/ERD.md`**.

### FRD — functional summary

- **"Executive Clarity" visual redesign.** The workspace moved from a dark
  charcoal theme to a crisp, high-contrast **light theme** (`#F6F7F9`
  canvas, white surfaces, WCAG AAA body/table text) built for an executive
  audience and print/PDF export, with universal sub-navigation pills
  replacing long single-screen scrolls across Admin, Control Tower, and
  the Executive Hub.
- **Navigation polish.** Trailing item-count badges were removed from
  every nav pill/tab (`Engagements 6` → `Engagements`), and Methodology
  Reference was removed from the sidebar's Reporting group — it now lives
  solely in its proper context under Control Audit.
- **RBAC Master Matrix.** A single permission matrix
  (`src/lib/governance/rbacMatrix.ts`) maps five personas — mapped 1:1
  onto the real `DeliveryAccessRole` rather than a second, disconnected
  role system — to allowed sidebar groups, per-engagement module pills,
  and route prefixes. Unauthorized items are **omitted from rendering**,
  never merely disabled, and `src/middleware.ts` independently blocks a
  direct navigation to a disallowed route as defence in depth. An
  Ops-Console-only "Persona Preview" (moved out of the tenant header, which
  had grown a redundant second role picker next to the Perspective
  switcher) lets an A2R operator preview a tenant's navigation ahead of a
  demo — display-only, never a real access grant.
- **A2R DOS rebrand.** The flagship demo tenant is renamed "A2R DOS Demo"
  (from "A2R Ventures Demo") across the UI, seed data, and documentation.
- **"Concept B: Ascent Vector" logo.** The integrated brand mark is now a
  single geometric glyph — a solid triangle with a nested triangular
  counter (the classic bold-monogram "A" construction), rendered in a
  fixed solid **Gunmetal Gray (`#545A61`)** via its own `logo` design
  token, deliberately independent of the `brand` interactive-accent token
  so a future accent re-theme can never silently recolor the logotype (or
  vice versa). Pure vector paths — crisp from 18px in the Sidebar to 40px
  on the sign-in screen — replacing the earlier live-text "A2R" wordform.
- **Self-Service Batch Import Engine.** A drag-and-drop portal (**Admin &
  Org Setup → Data Ingestion & Templates → Batch Import**) accepts CSV or
  Excel files of weekly **Actuals** or **Milestone & Progress** updates
  spanning any number of engagements in one file — distinct from the
  existing per-project CSV import, which stays scoped to one project at a
  time. Every row is validated against the tenant's live projects and
  roster and staged as a `DataImportBatch`/`DataImportRow` pair: valid and
  invalid rows alike, so nothing is lost. Invalid rows carry a plain-English
  reason per failure (missing primary keys, unmapped project references,
  unrecognizable dates); an inline correction grid lets a user fix a row
  in place and re-validate it live, with no re-upload. **Re-validate &
  Commit** is a genuine hard stop, re-checked authoritatively server-side
  immediately before commit — a batch can never partially land while any
  row still errors. A successful commit upserts into
  `WeeklyAssignmentSlot` / `SchedulePhase` in one transaction and is
  recorded in both the Audit Trail and the hash-chained Compliance Ledger.

### RTM — requirements traceability (Phase 3d)

| # | Capability | Primary files | Automated coverage |
| --- | --- | --- | --- |
| EC-1 | **Light theme tokens** — `bg`/`surface`/`ink`/`brand`/status ramp, AAA contrast | `tailwind.config.ts`, `src/app/globals.css` | visual; full `tsc`/`vitest` gate |
| EC-2 | **Universal `<ModuleTabs>` sub-navigation** — Admin, Control Tower, Executive Hub, per-project pills | `src/components/ui/module-tabs.tsx` | e2e Suites B/C/F (tab-scoped assertions) |
| EC-3 | **Nav-pill badge removal + Methodology Reference relocation** | `src/components/layout/Sidebar.tsx`, `src/components/ui/module-tabs.tsx` call sites | e2e Suite G2 (asserts link absent from sidebar, reachable from `/audit`) |
| RBAC-1 | **Master permission matrix** — personas, allowed modules/routes, `DELIVERY_ROLE_TO_PERSONA` | `src/lib/governance/rbacMatrix.ts` | `tests/rbac-matrix.test.ts` (20) |
| RBAC-2 | **Dynamic Sidebar / `ModuleNav` filtering** — union of governance-hidden + RBAC-hidden hrefs | `src/components/layout/Sidebar.tsx`, `src/components/projects/ProjectHeader.tsx` | `tests/rbac-matrix.test.ts` (`rbacHiddenHrefs` set-partition property) |
| RBAC-3 | **Edge-safe middleware route guard** — real block/redirect independent of the server-action authorization layer | `src/middleware.ts` | `tests/rbac-matrix.test.ts` (`isRouteBlockedForPersona`) |
| RBAC-4 | **Cross-shell Persona Preview** — Ops-Console-only, localStorage-shared, display-only | `src/lib/client/rbac-preview.ts`, `src/components/ops/RbacPersonaSwitcher.tsx`, `src/app/(admin)/layout.tsx` | live e2e (set in Ops → reflected in tenant Sidebar) |
| RB-1 | **"A2R DOS Demo" rebrand** — seed, live tenant row, docs, tests | `prisma/seed.ts`, `tests/steerco-briefing.test.ts`, `e2e/enterprise-verification.spec.ts`, `docs/*.md` | full `vitest` + e2e gate |
| RB-2 | **"Ascent Vector" logo, Gunmetal Gray** — single glyph component, dedicated `logo` token | `src/components/ui/brand-mark.tsx`, `tailwind.config.ts` | visual; consumed by every existing call site with no changes needed |
| WP7-1 | **Batch schema + validation** — `WEEKLY_ACTUALS` / `MILESTONE_PROGRESS` column defs, plain-English `BatchRowIssue`s | `src/lib/ingestion/batch-schemas.ts` | `tests/batch-schemas.test.ts` (18) |
| WP7-2 | **Isomorphic CSV/Excel reader** — shared by client preview and (future) server paths | `src/lib/ingestion/workbook-reader.ts` | `tests/workbook-reader.test.ts` (6, incl. a real `xlsx`-library round-trip) |
| WP7-3 | **`DataImportBatch` / `DataImportRow` schema** | `prisma/schema.prisma` (`BatchImportDataType`/`Status`/`RowStatus`) | `docs/ERD.md` |
| WP7-4 | **Stage / correct / commit / discard server actions** — authoritative re-validation at every step, all-or-nothing transactional commit | `src/server/actions/data-import.ts` | manual UAT-4.7; live-verified end-to-end (staged batch → corrected → committed → `WeeklyAssignmentSlot` + ledger row confirmed) |
| WP7-5 | **Drag-and-drop portal + quarantine/correction grid UI** | `src/components/ingestion/{BatchUploadPortal,BatchList,BatchImportPanel,BatchDetailView}.tsx` | manual UAT-4.7 |
| WP7-6 | **Admin-only gating** — `admin:ingestion` permission, tab hidden (not disabled) for other roles | `src/app/(dashboard)/admin/ingestion/page.tsx`, `src/lib/auth/rbac.ts` | manual UAT-4.7 (step 10) |
| WP7-7 | **Starter templates** added to the existing Template Hub | `src/server/services/templates.ts` (`weekly-actuals-batch`, `milestone-progress-batch`) | `tests/templates.test.ts` |

**Ledger:** `BATCH_IMPORT_COMMITTED` joins the `LedgerActionType` union —
every self-service batch commit is hash-chained in the Compliance Ledger,
alongside a `BATCH_IMPORT_STAGED`/`BATCH_IMPORT_COMMITTED`/
`BATCH_IMPORT_DISCARDED` trio in the general Audit Trail.

**Not yet wired (follow-on):** a permanent Playwright suite for the Batch
Import Engine (today it's manual UAT-4.7 plus the pure-logic Vitest
coverage above); server-side re-parsing of the original file bytes at
commit time (today the server re-validates every field authoritatively,
but trusts the client-parsed row structure the same way any web form
trusts submitted field values — see `data-import.ts`'s doc comment); and
extending `BatchImportDataType` to a third weekly data kind if a future
release needs one beyond Actuals and Milestone/Progress. _(Superseded by
Phase 3e below, which extends `BatchImportDataType` to four pillars.)_

**Verification:** `npx tsc --noEmit` → 0 errors; `npx vitest run` → **303
passed** across 25 files (23 pure-unit + 2 live-database security suites);
`npx playwright test` → **40 passed** across Suites A–J.

## Phase 3e — Role-Based Scoped Filtering, the Custom KPI Definition Engine & 4-Pillar Ingestion (v1.4.0)

Phase 3e closes two gaps Phase 3d's RBAC Master Matrix deliberately left
open — that matrix governs *navigation*, not which *rows* a scoped role's
own queries return — and turns the Batch Import Engine from a two-pillar
into a complete four-pillar weekly intake surface. It adds no new
persona/role concept: scoping reuses the real `DeliveryAccessRole`, and
Custom KPIs bind to the existing `RbacPersona` set from Phase 3d's matrix.
Released as **v1.4.0**.

End-user instructions live in **`docs/USER_MANUAL.md`** (§6, §8.3, the
Role-Based Scoped Filtering subsection under §10); the security posture is
in **`docs/SECURITY.md`** (§8, §9, §10); the schema is in **`docs/ERD.md`**;
manual walkthroughs are **`docs/UAT_TEST_RUNBOOK.md`** UAT-3.6 and UAT-4.8.

### FRD — functional summary

- **Role-Based Scoped Filtering.** A third, distinct axis from edit
  authority (`canEditProject`) and navigation (the RBAC Master Matrix):
  which project/resource *rows* a role's own queries return.
  `src/lib/scoping.ts` treats ADMIN and VP_EXECUTIVE (the org's VPs, PMO
  Heads, and PS Ops leads) as **global** — every practice, every project —
  and PRACTICE_DIRECTOR, DELIVERY_MANAGER, and PROJECT_MANAGER as
  **scoped**, to their `practiceId`, direct reports, and own assignments
  respectively. DB-free predicates and the Prisma `where`-clause builders
  live in the same file so the two can never drift apart, and are applied
  at the Control Tower, Resource & Capacity Cockpit, and every project
  picker across Financial Realization, RAID Cockpit, Commercial Baseline,
  Control Audit, and Schedule & Milestones.
- **Custom KPI Definition Engine.** `/admin/kpis` lets an Admin bind a
  curated metric — never an arbitrary formula — from one of four data
  sources (Financial Realization, Schedule & Milestones, RAID Cockpit,
  Resource & Capacity) to a target/warning threshold and a set of target
  personas. The resulting card renders live on the Control Tower and the
  Executive Hub for exactly those personas, with no redeploy. Authoring is
  gated on `admin:governance`; the display read is deliberately ungated so
  a KPI a viewer is bound to always renders for them.
- **Forecast & EAC Updates (3rd ingestion pillar).** A new Batch Import
  pill ingests forward-looking cost-to-complete and revised
  Estimate-at-Completion hours by rate-card role, upserting real
  `FinancialActual.forecastHours` / `openRRHours`. Matrix-mode projects
  only — a Direct Intake project's rows quarantine with a clear pointer
  back to that project's own Financial Realization import.
- **Status Reports & RAID Log (4th ingestion pillar).** A new pill
  ingests a weekly narrative status highlight, a new RAID item, or both,
  per project — narrative rows become `ActivityLogEntry`s, RAID rows
  become `RaidEntry`s, sharing the same stage/correct/commit pipeline as
  the other three pillars.
- **AutoDemo tour updates.** The cinematic walkthrough gained a dedicated
  "role-aware scoping" beat (VP/global vs. Practice Director/scoped, on the
  same screen) and an expanded Custom KPI Builder beat that explicitly
  narrates the card appearing on both the Control Tower and the Executive
  Hub; `docs/AUTO_DEMO_SCRIPT.md` stays the synced production/voiceover
  reference for both.

### RTM — requirements traceability (Phase 3e)

| # | Capability | Primary files | Automated coverage |
| --- | --- | --- | --- |
| SCOPE-1 | **Practice/report/assignment scoping predicates + Prisma `where` builders** | `src/lib/scoping.ts` | `tests/scoping.test.ts` (20) |
| SCOPE-2 | **Wired at Control Tower, Capacity Cockpit, and 5 project pickers** | `src/components/dashboard/project-picker.tsx`, `src/app/(dashboard)/capacity/page.tsx`, `src/app/(dashboard)/page.tsx` | e2e Suite K1–K2; manual UAT-3.6 |
| KPI-1 | **KPI schema + curated metric catalog** (`KpiDataSource`/`KpiFormulaType`/`KPI_METRICS`) | `src/types/kpi.ts` | type-checked via `npx tsc --noEmit` |
| KPI-2 | **Evaluation + validation logic** — status thresholds, direction-aware warning/target ordering | `src/lib/kpi-engine.ts` | `tests/kpi-engine.test.ts` (24) |
| KPI-3 | **`CustomKpi` schema + gated CRUD actions** | `prisma/schema.prisma`, `src/server/actions/kpis.ts` | `docs/ERD.md`; manual UAT-4.8 |
| KPI-4 | **Ungated visibility read + widget cards on Control Tower & Executive Hub** | `src/server/queries/kpi-data.ts`, `src/components/kpi/KpiWidgetCard.tsx` | e2e Suite K3; manual UAT-4.8 |
| KPI-5 | **`/admin/kpis` builder UI** | `src/components/admin/KpiBuilderPanel.tsx` | e2e Suite K3; manual UAT-4.8 |
| WP7-8 | **Forecast & EAC batch pillar** — matrix-mode-only validation, `FinancialActual` upsert | `src/lib/ingestion/batch-schemas.ts` (`validateForecastEacRow`), `src/server/actions/data-import.ts` | `tests/batch-schemas.test.ts`; manual UAT-4.7 new-pillar spot-check |
| WP7-9 | **Status Reports & RAID Log batch pillar** — narrative and/or RAID-item rows | `src/lib/ingestion/batch-schemas.ts` (`validateStatusRaidRow`) | `tests/batch-schemas.test.ts`; manual UAT-4.7 new-pillar spot-check |
| WP7-10 | **2 new starter templates** | `src/server/services/templates.ts` (`forecast-eac-batch`, `status-raid-batch`) | `tests/templates.test.ts` |
| DEMO-1 | **Scoped-practice-view and expanded admin-kpis tour beats** | `src/lib/demo/demo-script.ts` | `tests/demo-script.test.ts` (12) |

**Ledger:** no new `LedgerActionType` — the two new ingestion pillars commit
through the existing `BATCH_IMPORT_COMMITTED` path alongside Weekly Actuals
and Milestone/Progress.

**Not yet wired (follow-on):** practice-scoping does not yet extend to the
Custom KPI Definition Engine's Capacity metrics, which stay tenant-wide,
matching the Capacity Cockpit's own pre-existing simplification; and the
two new ingestion pillars have Vitest coverage plus a manual UAT walkthrough
but no dedicated Playwright suite yet (same follow-on noted for the
original two pillars in Phase 3d).

**Verification:** `npx tsc --noEmit` → 0 errors; `npx vitest run` → **387
passed** across 29 files (27 pure-unit + 2 live-database security suites);
`npx playwright test` → **47 passed** across Suites A–K.

## Phase 3f — Production deploy, database hardening & a public front door (v1.4.1 – v1.6.0)

Phase 3f takes the platform from "runs locally" to "runs on the internet":
a live Vercel + Supabase deployment, the database-security work that
implies, a marketing / "Coming Soon" front door so the bare domain isn't a
login wall, and a forced-password-change flow for operator-provisioned
accounts.

### FRD — functional summary

- **v1.4.1 — production database hardening.** Runtime queries go through
  the Supabase connection pooler (the direct host is IPv6-only; serverless
  has no IPv6), with a dedicated `DIRECT_URL` for schema migrations
  (`datasource.directUrl`). **Row Level Security is `ENABLE`d on every
  `public` table** with no policies — deny-all for every role except the
  Prisma-owned `BYPASSRLS` role — and all grants are revoked from the
  provider's web-exposed `anon` / `authenticated` roles, closing the
  Supabase Security Advisor finding without touching a single Prisma
  query. The SEC-2 HTTP security headers and the Ops build stamp, dropped
  by an earlier `next.config.mjs` edit, are restored.
- **v1.5.0 → v1.5.1 — the site root becomes a "Coming Soon" page.**
  v1.5.0 shipped a public marketing landing page at `/`; v1.5.1 replaced
  it with a sleek dark early-access page: `src/app/page.tsx` (moved to the
  root layout so it owns its own theme), the "Deliver Projects with
  Absolute Clarity. Zero Chaos." headline, a **Sneak Peek** preview modal
  (`src/components/marketing/SneakPeekModal.tsx` — portaled past the
  `backdrop-blur` header), and a lead-capture form (full name,
  organization, work email, phone) posting to the public
  `submitEarlyAccessLead` action (Zod + honeypot + per-IP rate limit,
  structured-log-only, same pattern as the support-ticket action).
  Readable with no account (the middleware gate excludes the bare root);
  a signed-in visitor is forwarded to `/launch`. `/terms` and `/privacy`
  keep the light `(public)` shell.
- **The Control Tower moved `/` → `/portfolio`.** One route registry
  (`GOVERNABLE_MODULES`) drives the Sidebar, ⌘K, RBAC route guard and
  governance hiding, so the move is a single `href` change there plus the
  handful of literal "go home" redirects (`middleware.ts`,
  `requireOpsContext`, onboarding, the `/admin` back-link, the Auto Demo
  `welcome`/`closing` beats).

### RTM — requirements traceability (Phase 3f)

| # | Capability | Primary files | Automated coverage |
| --- | --- | --- | --- |
| DEPLOY-1 | **Serverless DB connectivity** — pooler `DATABASE_URL` + `directUrl` | `prisma/schema.prisma`, `.env.example` | live: `/api/health/ready` → `{"database":"ok"}` |
| SEC-RLS-1 | **RLS lockdown** — ENABLE (not FORCE) on all tables, revoke anon/authenticated, alter default privileges | `prisma/migrations/00000000000007_rls_lockdown/migration.sql` | applied + verified against production (35/35 RLS-on, 0 residual grants, Prisma read+write intact); `docs/SECURITY.md` § "Database-level access control" |
| SEC-HDR-1 | **Restored SEC-2 headers + build stamp** | `next.config.mjs` | live: response headers confirmed; `tests/build-info.test.ts` |
| LAND-1 | **"Coming Soon" page** at `/` — Sneak Peek modal + early-access form | `src/app/page.tsx`, `src/components/marketing/*`, `src/server/actions/early-access.ts` | e2e regression 4a; live (dark page 200 signed-out, forward signed-in; modal + form exercised) |
| LAND-2 | **Control Tower `/` → `/portfolio`** — route registry + redirects + demo beats | `src/lib/governance/config.ts`, `src/components/layout/Sidebar.tsx`, `src/lib/workspace/lenses.ts`, `src/middleware.ts`, `src/lib/demo/demo-script.ts` | `tests/enterprise-flows.test.ts`, `tests/rbac-matrix.test.ts`; e2e Suites A/B/J1 updated to `/portfolio` |
| LAND-3 | **`NEXT_PUBLIC_COMING_SOON` toggle** — ON by default; a falsy value makes `/` forward to `/launch` (preview deploys) | `src/app/page.tsx`, `.env.example` | live: flag unset → dark page; `=0` → 307 to `/login` |

**Verification:** `npx tsc --noEmit` → 0 errors; `npx vitest run` → **388
passed** across 29 files; `npx playwright test` → **47 passed** across
Suites A–K. Production `/api/health/ready` → `{"database":"ok"}`; SEC-2
headers live; `/` public, `/portfolio` gated.

### v1.6.0 — forced password change on first sign-in

FRD:

- **A password set by anyone other than the user is single-use.** When an
  A2R operator provisions a tenant, the new admin gets a temp password
  (shown to the operator once). `provisionTenantAction` stamps
  `User.mustChangePassword = true` on that account (migration
  `00000000000008` — additive, existing rows unaffected). A self-registered
  user, who chose their own password, is never flagged; seeded demo
  accounts are left at the default `false`.
- **The workspace is unreachable until they set their own.** The flag
  rides on the NextAuth JWT (refreshed from the DB every request by the
  `jwt` callback), and `src/middleware.ts` redirects **every** route to
  `/change-password` while it's set — ahead of the `/ops` and RBAC
  Master Matrix checks.
- **One shared password policy.** `src/lib/auth/password-policy.ts`'s pure
  `validatePasswordStrength` (≥12 chars, an upper- and lowercase letter, a
  digit, no edge whitespace) backs both `changePasswordAction` and the
  form's live feedback. The change also refuses re-use of the current
  password, and verifies the current password before accepting a new one.
- **`/change-password` is also a voluntary change screen** for any
  signed-in user; on success the user is signed out for a clean re-login
  (the simplest way to shed the stale token).
- **Credential hygiene in the seed.** `navinder@a2rventures.com`'s
  `passwordHash` is no longer reset on re-seed (only on a first-ever
  `create`), so a password rotated in a live deployment survives
  `npm run db:seed`. A dedicated `master.e2e@a2rventures.com` account
  (isA2rStaff + OWNER/ADMIN in every org, oldest-org-first) now backs the
  enterprise-verification suite's Suite A / I, so those tests never depend
  on a human's real credential.

| # | Capability | Primary files | Automated coverage |
| --- | --- | --- | --- |
| AUTH-PW-1 | **`mustChangePassword` flag + JWT/session plumbing** | `prisma/schema.prisma`, `src/lib/auth.ts`, `src/types/next-auth.d.ts` | `npx tsc --noEmit`; e2e Suite A (master account sign-in unaffected) |
| AUTH-PW-2 | **Middleware enforcement** — every route → `/change-password` while flagged | `src/middleware.ts` | live-verified (armed demo account: redirected, `/portfolio` bounced, cleared after change); manual UAT-3.7 |
| AUTH-PW-3 | **`/change-password` page + `changePasswordAction`** | `src/app/(auth)/change-password/`, `src/components/auth/ChangePasswordForm.tsx`, `src/server/actions/auth.ts` | live-verified end-to-end; manual UAT-3.7 |
| AUTH-PW-4 | **Shared strength policy** | `src/lib/auth/password-policy.ts` | `tests/password-policy.test.ts` (8) |
| AUTH-PW-5 | **Provision flow sets the flag; seed credential hygiene** | `src/server/actions/ops.ts`, `prisma/seed.ts` | e2e Suites A / D / I (provisioned + master accounts) |

**Verification (current):** `npx tsc --noEmit` → 0 errors; `npx vitest run`
→ **396 passed** across 30 files (28 pure-unit + 2 live-database security
suites); `npx playwright test` → **47 passed** across Suites A–K.

## Phase 4 — Security architecture hardening (v1.7.0)

Nine focused changes from a Principal-Architect audit of the v1.6.0 release,
plus a production-readiness observability pass. Every item ships with
migration, tests (vitest + playwright), and all four verification gates
green. Feature docs live under `docs/`.

### FRD — functional summary

- **ORM-level tenant auto-scoping (P0 #1).** A Prisma client extension
  (`src/lib/db.ts` + `src/lib/db/org-scope.ts`) rewrites **every** query on a
  tenant-owned model to include the request's `organizationId`, and throws
  `OrgScopeError` if a tenant query runs with no resolved scope. Fed by an
  `AsyncLocalStorage` cell + a lazy session/cookie resolver (`enterWith` is
  unreliable across App Router boundaries). A structural backstop under the
  hand-written `where` clauses. `docs/RLS_ROADMAP.md`.
- **Explicit A2R-staff grants (P0 #2).** The `@a2rventures.com` email wildcard
  and `User.isA2rStaff` are gone (migration `00000000000009`). Staff access
  is one attributed, revocable `staff_grants` row — grant/revoke from
  `/ops/staff` or `npm run staff:grant|revoke|list`.
- **Deep forced-password-rotation enforcement (P0 #3).** `mustChangePassword`
  is rejected with `403 PASSWORD_CHANGE_REQUIRED` in every server-action /
  route-handler auth path, not just the middleware redirect.
  `changePasswordAction` bumps `users.sessionVersion` in the same
  transaction as the hash write → every other device is `REVOKED` on its
  next request (migration `00000000000011`).
- **Preview / production data-isolation guardrail (P0 #4).** Build,
  server-boot, and Prisma-client hard-fail if a Vercel Preview/Development
  deployment points `DATABASE_URL` at the production Supabase ref.
  `docs/PREVIEW_ENVIRONMENT_ISOLATION.md`.
- **Server-only site routing (P1).** `A2R_SITE_MODE` (`marketing | internal |
  live`) — a strict, fail-closed enum read at request time in the Edge
  middleware. Replaces `NEXT_PUBLIC_COMING_SOON`. An unknown value in
  production fails the deploy; at runtime it falls back to marketing, never
  the internal app. `docs/SITE_ROUTING_MODEL.md`.
- **Restricted-session state machine (P1).** `ACTIVE | PENDING_PASSWORD_CHANGE
  | REVOKED`, re-derived from the DB every request (`src/lib/auth/session-state.ts`),
  token-version pinned. Any DB error / timeout → `REVOKED` (fail-closed).
  `docs/SESSION_STATE_MACHINE.md`.
- **Composite tenant keys + named DAL (P1).** Migration `00000000000012`
  adds `organizationId` + FK to the 9 formerly join-scoped models — every
  tenant table now binds its rows to a tenant at the database. `src/lib/dal/`
  is the named entry point; `src/app/**` / `src/components/**` may not import
  `@/lib/db` (ESLint + `tests/dal-boundary.test.ts`). `docs/DATA_ACCESS_LAYER.md`.
- **Just-In-Time staff elevation (P1).** A standing `staff_grants` row is now
  eligibility only. Every mutating `/ops` action requires a live,
  reason-logged, session-bound, auto-expiring `staff_elevations` grant
  (migration `00000000000013`, TTL 30 min default / 60 max). In-console audit
  trail at `/ops/staff`. `docs/JIT_STAFF_ELEVATION.md`.
- **Centralized error boundary + advanced rate limiting (P2).**
  `withAction` / `withRouteHandler` wrap every mutation action + the
  download/report routes: an unhandled throw → one structured,
  secret-redacted log line + a safe generic error. Named sliding-window
  rate-limit rules (`src/lib/rate-limits.ts`, `RL_*_LIMIT` overrides) on the
  auth / export / doc-gen / ingest / snapshot boundaries, with `X-RateLimit-*`
  on the allowed 200. `docs/OBSERVABILITY.md`.

### RTM — requirements traceability (Phase 4)

| # | Capability | Primary files | Automated coverage |
| --- | --- | --- | --- |
| SEC-P0-1 | ORM tenant auto-scoping + fail-closed | `src/lib/db.ts`, `src/lib/db/org-scope.ts` | `tests/org-scope.test.ts`, `tests/security/tenant-isolation.test.ts` |
| SEC-P0-2 | Explicit staff grants (no email wildcard) | `src/lib/ops/staff-grants.ts`, `src/lib/ops-auth.ts`, migration 09 | `tests/staff-grants.test.ts` · e2e Suites D/I |
| SEC-P0-3 | Deep password-rotation + all-device logout | `src/server/actions/auth.ts`, `src/lib/auth.ts`, migration 11 | `tests/password-rotation.test.ts`, `tests/security/password-rotation-flow.test.ts` · e2e Suite N |
| SEC-P0-4 | Preview/prod isolation guardrail | `src/lib/config/env-isolation-core.mjs`, `next.config.mjs`, `src/instrumentation.ts` | `tests/environment-isolation.test.ts` |
| SEC-P1-1 | Server-only `A2R_SITE_MODE` routing | `src/lib/config/site-mode.mjs`, `src/middleware.ts` | `tests/site-mode.test.ts` · e2e Suite M |
| SEC-P1-2 | Session state machine (fail-closed) | `src/lib/auth/session-state.ts`, `src/lib/auth.ts` | `tests/session-state.test.ts` (29), `tests/with-timeout.test.ts` · e2e Suite N |
| SEC-P1-3 | Composite tenant keys + DAL boundary | `prisma` migration 12, `src/lib/dal/`, `.eslintrc.json` | `tests/dal.test.ts`, `tests/dal-boundary.test.ts`, `tests/security/tenant-isolation.test.ts` · e2e Suite O |
| SEC-P1-4 | JIT staff elevation | `src/lib/ops/staff-elevation.ts`, `src/lib/ops-auth.ts`, migration 13 | `tests/staff-elevation.test.ts` (11) · e2e Suite P |
| SEC-P2-1 | Centralized error boundary | `src/lib/observability/{action,route}-wrapper.ts` | `tests/observability.test.ts` (10) |
| SEC-P2-2 | Advanced rate limiting + headers | `src/lib/rate-limits.ts`, `src/lib/rate-limiter.ts`, `src/lib/rate-limit-action.ts` | `tests/rate-limiter.test.ts`, `tests/security/rate-limit-endpoints.test.ts` |

**Verification:** `npx tsc --noEmit` → 0 errors; `npx vitest run` → **536
passed** across 43 files; `npx playwright test` → **60 passed** (Suites
A–P); `npm run build` → compiled cleanly. Migrations `00000000000011–13`
applied to the production database.

## Phase 5 — Framework LTS upgrade & tenant-isolation hardening (v1.7.1 – v1.8.0)

Two releases from the enterprise production-readiness track: a framework
hygiene pass, then the next batch of P0 security findings from the
Principal-Architect audit.

### v1.7.1 — Next.js 15 LTS (Phase A)

- **`next` 14.2.35 → 15.5.25**, `next-auth` → 4.24.15, `eslint-config-next`
  → 15.5.25; React stays on 18.3 (Next 15 peer-supports it). Clears the
  Next.js advisories affecting the 14.2 line.
- **Async request APIs** — every `cookies()` / `headers()` call and every
  dynamic-route `params` / `searchParams` is now awaited (~25 files), as
  Next 15 requires. `postcss` forced to `^8.5.x` via a package override.
- Linter clean sweep — `npm run lint` → 0 errors, 0 warnings.

### v1.8.0 — Tenant-isolation & security hardening (Phase B)

- **Composite tenant foreign keys (P0-3).** Migration `00000000000014`
  adds `UNIQUE ("organizationId", "id")` to `projects` /
  `data_import_batches` and replaces the single-column parent FK on all 11
  project- / batch-scoped child tables with a **composite** FK
  `("organizationId", <parentId>)` → `parent("organizationId", "id")`. The
  database now physically rejects a child row whose tenant disagrees with
  its parent's — defence in depth under the app-tier + ORM scoping.
- **Hashed bearer tokens (P0-5).** Migration `00000000000015` —
  `staff_elevations.token` / `impersonation_grants.token` → `tokenHash`.
  The httpOnly cookie carries a 256-bit secret (`src/lib/crypto/bearer-token.ts`);
  the database stores only `sha256(secret)` and resolves sessions by hash
  with a constant-time compare. Mirrors `ApiKey.hashedKey`.
- **Distributed rate limiting (P0-6).** `src/lib/rate-limiter-redis.ts` —
  when `UPSTASH_REDIS_REST_URL` / `_TOKEN` are set, every rate-limited
  boundary enforces one atomic sliding window in Redis (single server-side
  Lua script) consistent across all serverless instances; unset → the
  in-process limiter, unchanged; a per-call Redis failure falls back to it.
- **DB-level RLS groundwork (P0-2), dormant.** The per-request
  `SET LOCAL app.current_org` Prisma bridge (`src/lib/db/rls-transaction.ts`,
  no-op unless `RLS_ENFORCE=1`), the restricted-role + per-table-policy
  migrations (`16` + `17`, **not applied**), a direct-SQL enforcement smoke
  test (`npm run db:rls:smoke`), and the staged rollout procedure
  (`docs/RLS_ENFORCEMENT_RUNBOOK.md`). Enforcement is Phase C — it needs a
  rehearsal database and a maintenance window.

### RTM — requirements traceability (Phase 5)

| # | Capability | Primary files | Automated coverage |
| --- | --- | --- | --- |
| FW-1 | Next.js 15 LTS + async request APIs | `package.json`, `next.config.mjs`, ~25 route/page/action files | full suite (tsc / vitest / playwright / build) |
| SEC-P0-3 | Composite tenant FKs — DB rejects cross-tenant child rows | `prisma/schema.prisma`, migration 14 | `tests/security/tenant-isolation.test.ts` (composite-key models) |
| SEC-P0-5 | Hashed elevation / impersonation bearer tokens | `src/lib/crypto/bearer-token.ts`, `src/lib/ops/staff-elevation.ts`, `src/lib/ops/tenant-management.ts`, migration 15 | `tests/staff-elevation.test.ts` · e2e Suites I, P |
| SEC-P0-6 | Distributed (Upstash) rate limiting + in-process fallback | `src/lib/rate-limiter-redis.ts`, `src/lib/rate-limiter.ts`, `src/lib/rate-limit-action.ts` | `tests/rate-limiter-redis.test.ts`, `tests/rate-limiter.test.ts`, `tests/security/rate-limit-endpoints.test.ts` |
| SEC-P0-2 | RLS bridge + policy migrations + smoke test (groundwork; enforced in Phase 6) | `src/lib/db/rls-transaction.ts`, `prisma/migrations/16`+`17`, `scripts/rls-smoke.ts` | `tests/security/rls-policies.test.ts` |

**Verification:** `npx tsc --noEmit` → 0 errors; `npm run lint` → 0 / 0;
`npx vitest run` → **539 passed, 3 skipped** across 45 files;
`npx playwright test` → **60 passed** (Suites A–P); `npm run build` →
compiled cleanly on Next 15.5.25. Migrations `00000000000014–15` rehearsed
(`BEGIN … ROLLBACK`) then applied to the production database; `prisma
migrate diff` reports no drift. Migrations `16`–`17` authored, not applied.

## Phase 6 — Enterprise environment separation & live database RLS (v1.9.0)

P0-2 of the audit, taken from "authored" to "enforced" — on a dedicated
staging environment, ahead of the production cutover.

### FRD — functional summary

- **Dedicated staging database.** A separate Supabase project (its own
  region), provisioned via `prisma db push` + `prisma/seed.ts`, so schema
  and security migrations are rehearsed off the shared production project.
- **DB-level Row-Level Security, enforced on staging.** With `RLS_ENFORCE=1`,
  every tenant-scoped transaction runs `SET LOCAL ROLE a2r_app` +
  `SET LOCAL app.current_org = <org>` as its first statements. `a2r_app` is
  a least-privilege role (`NOSUPERUSER`, `NOBYPASSRLS`), so from that point
  the migration-17 `tenant_isolation` policies apply for the application's
  own queries. `SET LOCAL` reverts on COMMIT — nothing leaks onto the
  pooled connection, and no second connection pool is needed (the pooler
  does not accept a custom-role login, so the owner `SET ROLE`s in-band —
  `GRANT a2r_app TO postgres` in migration 16).
- **`withTenantTx` (`src/lib/db/with-tenant-tx.ts`).** Every former
  `db.$transaction(fn)` that touches a tenant model (~20 call sites) routes
  through it. Cross-tenant / pre-session flows (ops console, provisioning,
  SSO JIT, retention) run as the owner role. When `RLS_ENFORCE` is unset —
  i.e. production — it is a plain transaction, byte-for-byte unchanged.
- **`src/lib/db/rls-transaction.ts`** wraps a bare `db.model.op()` in a
  tenant request in its own per-op transaction with the same `SET LOCAL`s;
  it detects and skips that inside a `withTenantTx`.
- **Direct-SQL proof.** `npm run db:rls:smoke` and
  `tests/security/rls-policies.test.ts` auto-detect the `a2r_app` role and
  verify enforcement over raw SQL (scoped counts vs. ground truth, empty
  GUC → 0 rows, cross-tenant `INSERT` → `42501`, cross-tenant `UPDATE` → 0).

Production keeps the three application-tier isolation layers from Phases
4–5 until its own cutover — apply migrations 16 + 17 (inert while acting as
`postgres`), deploy `RLS_ENFORCE=1`, soak, then `FORCE ROW LEVEL SECURITY`.
See `docs/RLS_ENFORCEMENT_RUNBOOK.md`.

### RTM — requirements traceability (Phase 6)

| # | Capability | Primary files | Automated coverage |
| --- | --- | --- | --- |
| SEC-P0-2a | Restricted `a2r_app` role + per-table policies (staging) | `prisma/migrations/16`, `prisma/migrations/17` | `npm run db:rls:smoke` (28 tables) |
| SEC-P0-2b | `SET LOCAL ROLE` + GUC bridge, no-op when off | `src/lib/db/with-tenant-tx.ts`, `src/lib/db/rls-transaction.ts` | `tests/security/rls-policies.test.ts` · full suite under `RLS_ENFORCE=1` |
| SEC-P0-2c | `db.$transaction` → `withTenantTx` at every tenant call site | `src/server/actions/**`, `src/server/services/identity-jit.ts`, `src/app/api/v1/ingest/timesheets/route.ts`, `src/lib/audit-ledger.ts` | full suite (staging + production) |
| ENV-1 | Dedicated staging database, provisioned + seeded | `.env` (staging), `prisma/seed.ts` | full suite green against it |

**Verification (staging, `RLS_ENFORCE=1`, `a2r_app`):** `npx tsc --noEmit` →
0 errors; `npm run lint` → 0 / 0; `npx vitest run` → **542 passed** (45
files, 0 skipped — the RLS suite now runs); `npx playwright test` → **60
passed** (Suites A–P); `npm run build` → clean; `npm run db:rls:smoke` →
*"OK — all 28 tenant tables enforce isolation for a2r_app"*. Re-verified
green against production (RLS off) after the refactor.

## Phase 7 — Payload strictness, session lifecycle & production polish (v1.10.0)

The final enterprise-security hardening cycle — P1 mass-assignment + session
hygiene, P2 production polish.

### FRD — functional summary

- **Strict request schemas (P1).** Every request-input `z.object` in
  `src/app/api/**`, `src/server/actions/**`, `src/lib/backup/workspace-io.ts`
  and `src/lib/ai-parser.ts` is now `z.strictObject(...)` — an unexpected
  property is a validation failure, not a silently-dropped field. Closes the
  mass-assignment surface, above all the Workspace Restore snapshot (writes
  attacker-influenceable JSON into ~10 models). The `src/lib/ingestion/**`
  CSV row schemas stay non-strict by design (a spreadsheet may carry extra
  columns) but already whitelist the fields they read.
- **Explicit global sign-out (P1).** `signOutEverywhereAction` bumps
  `users.sessionVersion` (same mechanism as a password change) — one menu
  click revokes every session on every device and serverless instance via
  the DB-backed jwt-callback check. The normal "Sign out" stays device-local.
- **Cookie flags (P1).** `a2r_active_org` / `a2r_lens` / `a2r_ops_elevation`
  / `a2r_impersonation` → `sameSite: 'strict'` + `secure` (prod) + `httpOnly`.
  `authOptions.cookies` pins the NextAuth session / CSRF / callback flags
  (session stays `sameSite: 'lax'` deliberately — no external-deep-link
  friction, still CSRF-safe).
- **Serverless pooling (P2).** `src/lib/db.ts`'s `assertServerlessPooling()`
  warns in production on Vercel when `DATABASE_URL` is not a pooler host
  carrying `connection_limit`; `.env.example` prescribes the settings.
- **Error sanitization (P2).** `src/app/api/internal/retention/route.ts` now
  runs through `withRouteHandler`; `tests/security/error-sanitization.test.ts`
  fails the build if any handler is unwrapped or would put a raw error in a
  response body. `ImmutableAuditLedger` audited — 16 hash-chained,
  append-only `actionType`s, no `update`/`delete` path; no change needed.

### RTM — requirements traceability (Phase 7)

| # | Capability | Primary files | Automated coverage |
| --- | --- | --- | --- |
| SEC-P1-a | `z.strictObject` at every validated entry point | `src/app/api/**`, `src/server/actions/**`, `src/lib/backup/workspace-io.ts`, `src/lib/ai-parser.ts` | vitest + e2e action coverage (596 / 60) |
| SEC-P1-b | Explicit "Sign out of all sessions" | `src/server/actions/auth.ts`, `src/components/layout/Header.tsx` | `tests/security/sign-out-everywhere.test.ts` · e2e Suite N |
| SEC-P1-c | App cookies Strict/Secure/HttpOnly; NextAuth flags pinned | `src/server/actions/{organizations,workspace-lens,ops-elevation,ops}.ts`, `src/lib/auth.ts` | `tests/security/cookie-flags.test.ts` |
| SEC-P2-a | Serverless pool warning + docs | `src/lib/db.ts`, `.env.example` | (config assertion) |
| SEC-P2-b | Every API route error-bounded; no raw error to client | `src/app/api/internal/retention/route.ts`, `src/lib/observability/route-wrapper.ts` | `tests/security/error-sanitization.test.ts` |

**Verification:** against **production** (`.env`, RLS off) **and staging**
(`RLS_ENFORCE=1`, `a2r_app`): `npx tsc --noEmit` → 0; `npm run lint` → 0/0;
`npx vitest run` → **596 passed** (48 files); `npx playwright test` → **60
passed** (Suites A–P); `npm run build` → clean; staging
`npm run db:rls:smoke` → OK (28 tables).

## Phase 8 — Data-model integrity: financial precision & audit retention (v1.11.0)

Phase 1 of the enterprise-readiness hardening plan.

### FRD — functional summary

- **Financial precision — `Float` → `Decimal` (Postgres `NUMERIC`), 13
  columns (migration 18, applied production + staging).** `$` amounts →
  `NUMERIC(14,2)`, `$/hr` rates → `NUMERIC(12,4)`, percentages →
  `NUMERIC(7,4)`, KPI thresholds → `NUMERIC(18,6)`. Money is now exact at
  rest, and a Prisma `_sum` over a portfolio is an exact decimal with no
  accumulated float error. Hours / FTE / utilisation / `pctComplete` stay
  `Float` (non-monetary). **Storage-only precision boundary:**
  `src/server/queries/calc-adapters.ts` converts `Decimal` → `number` at the
  one documented Prisma→plain-number boundary, so `src/lib/calculations/**`
  and its test suite are untouched; other read boundaries (the reporting
  queries, the KPI queries, the workspace-snapshot build, and the
  financials / commercial-baseline / admin pages) convert with `Number()` —
  a Prisma `Decimal` does not serialise into a Client Component. Writes are
  unchanged (Prisma coerces `number` → `NUMERIC`).
- **Security-history preserved on delete (migration 19, applied production +
  staging).** `staff_grants.userId`, `staff_elevations.userId` and
  `impersonation_grants.organizationId` become `ON DELETE RESTRICT` — a raw
  `DELETE` of the user or organization is refused while any history row
  exists, so a cascade can never destroy the operator-access trail (the
  posture the audit tables have had since CMP-1). Normal lifecycle is
  unaffected (revoke / end / the soft Purge Protocol).
- **The data-retention sweep no longer deletes ended impersonation grants.**
  Operator-access history — impersonation grants, staff grants, staff
  elevations — is retained indefinitely; the `ImmutableAuditLedger` is the
  permanent tamper-evident record. `RETENTION_IMPERSONATION_GRANT_DAYS`
  removed.

### RTM — requirements traceability (Phase 8)

| # | Capability | Primary files | Automated coverage |
| --- | --- | --- | --- |
| DATA-1 | Money / rate / margin / EAC / BAC columns are exact `NUMERIC` | `prisma/schema.prisma`, migration 18 | `tests/financial-precision.test.ts` (exact round-trip, exact `_sum`) |
| DATA-2 | `Decimal` → `number` at the calc boundary; engine untouched | `src/server/queries/calc-adapters.ts` | full `tests/calculations.test.ts` (unchanged) + suite green |
| SEC-HIST-1 | User / org delete cannot cascade-destroy security history | `prisma/schema.prisma`, migration 19 | `tests/security/security-history-cascade.test.ts` |
| SEC-HIST-2 | Retention sweep excludes operator-access history | `src/server/services/data-retention.ts` | `tests/data-retention.test.ts` |

**Verification:** against **production** (`.env`, RLS off) **and staging**
(`RLS_ENFORCE=1`, `a2r_app`): `npx tsc --noEmit` → 0; `npm run lint` → 0/0;
`npx vitest run` → **602 passed** (50 files); `npx playwright test` → **60
passed** (Suites A–P); `npm run build` → clean; staging
`npm run db:rls:smoke` → OK. Migrations 18 + 19 rehearsed
(`BEGIN … ROLLBACK`) then applied to both databases; `prisma migrate diff`
→ no drift.

## Phase 9 — Production RLS cutover prep, identity-table lockdown & break-glass (v1.12.0)

Phase 2 of the enterprise-readiness hardening plan. Closes the gap between
"DB-level RLS enforced on staging" (Phase 6 / v1.9.0) and "safe to enforce on
production".

### FRD — functional summary

- **Production RLS migrations applied (inert).** Migrations 16 + 17 + a new
  **20** are applied to the production database via `DIRECT_URL` (rehearsed
  `BEGIN … ROLLBACK` first). They do nothing while the app connects as
  `postgres` — the only new capability is `SET ROLE a2r_app`.
  `npm run db:rls:smoke` against production runs for real and passes all
  8 checks. The remaining step is a single Vercel change: `RLS_ENFORCE=1` +
  redeploy. Full procedure + verification matrix: `docs/RLS_ENFORCEMENT_RUNBOOK.md`.
- **Identity / routing tables denied to the tenant runtime (migration 20).**
  The 9 identity tables (`users`, `accounts`, `sessions`,
  `verification_tokens`, `memberships`, `organizations`, `staff_grants`,
  `staff_elevations`, `impersonation_grants`) move from the permissive
  `rls_app_plumbing` policy (`USING (true)`) to a hard `rls_deny_app`
  (`USING (false) WITH CHECK (false)`) for `a2r_app`. `signOutEverywhereAction`
  and `changePasswordAction` — the only tenant-runtime flows that touched
  `users` / `sessions` — now run under `runUnscoped` (they key by explicit
  `userId`, an account-level operation), so the tenant runtime never touches
  an identity table as `a2r_app`. `a2r_app` is also set `NOLOGIN`.
- **RLS break-glass.** `_rls_control` (a one-row control table) +
  `src/lib/db/rls-break-glass.ts`: a time-boxed (≤ 60 min), auto-expiring,
  alerting window that disables DB-level RLS within ~10 s during an incident —
  no redeploy — while keeping application-tier scoping fully in force.
  Operable via `scripts/rls-break-glass.ts` (over `DIRECT_URL`, no app
  dependency) or the elevated ops actions. Rehearsed on staging.
- **Tenant-model inventory.** `docs/TENANT_MODEL_INVENTORY.md` maps all 37
  Prisma models to their tenant binding and DB-level enforcement (9 identity +
  28 tenant-owned, 11 of the 28 also carrying a composite FK to a tenant
  parent), with two residuals tracked for Phase 3.

### RTM — requirements traceability (Phase 9)

| # | Capability | Primary files | Automated coverage |
| --- | --- | --- | --- |
| RLS-PROD-1 | Migrations 16/17/20 applied + verified on production (inert) | migrations 16/17/20, `docs/RLS_ENFORCEMENT_RUNBOOK.md` | `npm run db:rls:smoke` against production → OK |
| RLS-PROD-2 | Direct-SQL verification matrix (SELECT/INSERT/UPDATE/DELETE/UPSERT, cross-tenant FK, ingest) | `scripts/rls-smoke.ts` (8 checks) | run on staging + production |
| RLS-ID-1 | Identity/routing tables unreachable by `a2r_app` | migration 20 `rls_deny_app` | `tests/security/tenant-model-inventory.test.ts` |
| RLS-ID-2 | Session-revocation flows run as `postgres`, not `a2r_app` | `src/server/actions/auth.ts` (`runUnscoped`) | `tests/security/sign-out-everywhere.test.ts`, `tests/password-rotation.test.ts` |
| RLS-BG-1 | Break-glass: time-boxed, auto-expiring, alerting | `src/lib/db/rls-break-glass.ts`, `_rls_control` (migration 20) | `tests/security/rls-break-glass.test.ts` + staging rehearsal |
| RLS-BG-2 | Break-glass operable without a redeploy | `scripts/rls-break-glass.ts`, `src/server/actions/ops.ts` | manual (UAT-3.14) |
| RLS-INV-1 | Complete tenant-model inventory, zero crossing gaps, drift-guarded | `docs/TENANT_MODEL_INVENTORY.md` | `tests/security/tenant-model-inventory.test.ts` |

**Verification:** against **production** (`.env`, RLS off) **and staging**
(`RLS_ENFORCE=1`, `a2r_app`): `npx tsc --noEmit` → 0; `npm run lint` → 0/0;
`npx vitest run` → **612 passed** (52 files) on both; `npx playwright test` →
**60 passed** (Suites A–P) on staging; `npm run build` → clean;
`npm run db:rls:smoke` → OK on staging **and production**. Break-glass
rehearsed on staging (engage → tenant isolation held at the app tier →
disengage → smoke green). Migrations 16 + 17 + 20 rehearsed
(`BEGIN … ROLLBACK`) then applied to production; migration 20 also to staging.

## Phase 10 — WP1: engine-level ledger immutability, composite-FK closure, break-glass removal (v1.13.0)

ChatGPT Round-4 audit blockers.

### FRD — functional summary

- **Ledger immutability at the SQL level (migration 21, prod + staging).**
  `a2r_app` keeps `SELECT` + `INSERT` on `immutable_audit_ledger` and
  **loses `UPDATE` + `DELETE`** (`REVOKE`). A `BEFORE UPDATE OR DELETE` row
  trigger and a `BEFORE TRUNCATE` statement trigger reject the operation for
  **every** role; the only bypass is a deliberate, transaction-local
  `SET LOCAL "a2r.ledger_admin" = 'on'` (lawful GDPR/CCPA erasure + the
  tamper-detection test), which `a2r_app` can never use. `rls-smoke` grows
  to 10 checks; `tests/security/ledger-immutability.test.ts` is new.
- **Complete composite tenant foreign keys (migration 22, prod + staging).**
  Every remaining intra-tenant single-column FK becomes composite
  `(organizationId, <col>)` → `<parent>(organizationId, id)` — `Resource →
  DeliveryRole/Practice/Resource(manager)/RoleUtilizationPolicy`, `Project →
  Resource ×3/Practice/Project(parent)`,
  `WeeklyAssignmentSlot/TimesheetEntry/ProjectContributor → Resource`,
  `EffortCell/FinancialActual → DeliveryRole`, `RaidEntry/SteerCoDecision →
  Resource(owner)`, `SsoGroupMapping → IdentityProvider/Practice`,
  `ActivityLogEntry/AuditLog → Project`. Five parents gain
  `@@unique([organizationId, id])`. NOT NULL children keep `ON DELETE
  CASCADE`; nullable children use the PG15+ `ON DELETE SET NULL ("<col>")`
  form so parent-delete behaviour is unchanged. A migration pre-flight
  `RAISE`s rather than null a pre-existing cross-tenant row (count: 0).
- **The fast global break-glass is removed.** The v1.12.0 `_rls_control`
  flag dropped every tenant transaction on every instance to the `postgres`
  owner role and was toggleable from an Ops Console action. `withTenantTx`
  now runs the enforced path unconditionally under `RLS_ENFORCE=1`. The sole
  rollback lever is unsetting `RLS_ENFORCE` on Vercel + a redeploy.

### RTM — requirements traceability (Phase 10)

| # | Capability | Primary files | Automated coverage |
| --- | --- | --- | --- |
| WP1-LEDGER-1 | `a2r_app` has no `UPDATE`/`DELETE` on the ledger | migration 21 (`REVOKE`) | `tests/security/ledger-immutability.test.ts`, `rls-smoke` 9–10 |
| WP1-LEDGER-2 | Engine rejects ledger mutation/truncation for every role | migration 21 (triggers) | `tests/security/ledger-immutability.test.ts` (owner-without-opt-in), `tests/security/ledger-concurrency.test.ts` |
| WP1-LEDGER-3 | Deliberate maintenance opt-in for lawful erasure | migration 21 (`current_setting` guard), `tests/helpers/ledger.ts` | `tests/security/ledger-immutability.test.ts` (owner-with-opt-in) |
| WP1-FK-1 | Every intra-tenant FK is composite; DB rejects cross-tenant parent | `prisma/schema.prisma`, migration 22 | `tests/security/tenant-isolation.test.ts`, `rls-smoke` 7 |
| WP1-FK-2 | Parent-delete behaviour unchanged (`SET NULL ("<col>")`) | migration 22 | full vitest + playwright suites |
| WP1-BG-1 | No fast global break-glass; tenant traffic always `a2r_app` under RLS | `src/lib/db/with-tenant-tx.ts` (branch removed), deletions | `tests/security/rls-policies.test.ts`, `rls-smoke` |

**Verification:** against **production** (`.env`, RLS off) **and staging**
(`RLS_ENFORCE=1`, `a2r_app`): `npx tsc --noEmit` → 0; `npm run lint` → 0/0;
`npx prisma validate` → clean; `npx vitest run` → **612 passed** (52 files)
on both; `npm run build` → clean; `npx playwright test` → **60 passed** on
production (staging is clean single-worker; the remote-pooler session-lookup
timeout flakes under full parallelism — a pre-existing condition unrelated
to WP1, confirmed green on production with identical code);
`npm run db:rls:smoke` → OK (10 checks) on staging **and production**.
Migrations 21 + 22 rehearsed (`BEGIN … ROLLBACK`) then applied to both
databases.

## Phase 11 — WP2: exact-decimal financial arithmetic, JIT elevation step-up, test-rig prod isolation (v1.14.0)

ChatGPT's final audit round.

### FRD — functional summary

- **Exact-decimal financial arithmetic through the calc engine.** `decimal.js`
  is a direct dependency; `src/lib/calculations/money.ts` provides `d()` /
  `roundMoney()` / `money()` / `sumMoney()`. `sizing.ts`, `financials.ts` and
  `portfolio.ts` accumulate every `$` amount and rate in exact decimal — no
  IEEE-754 drift summing hundreds of `hours × rate` products or many
  `eacCost` rows — and round **once** at the accounting boundary: `$` →
  HALF_UP, 2 dp; rates full-precision; percentages / ratios / hours computed
  from the exact decimals (single operation, no accumulation) and left as
  `number`. Output types unchanged (`number`), so consumers + RSC→Client
  serialization are untouched. `calc-adapters.ts` passes the exact `NUMERIC`
  string across the boundary; `executive-briefing.ts` (the one re-aggregating
  query) switches to decimal accumulation. New
  `tests/calculations-precision.test.ts` proves it (400-cell matrix,
  150-project portfolio, 60-row EAC).
- **JIT elevation step-up + session binding** (migration `00000000000023`,
  prod + staging). `requestElevation` requires a fresh `bcrypt.compare`
  against the account password (rate-limited) before minting; the row stores
  `sessionVersion` + `reauthAt`; `ops-auth.ts` rejects an elevation whose
  epoch ≠ the live session, so a password change / global sign-out kills every
  elevation immediately. SSO-only operators must set a console password. The
  `OpsElevationBar` modal gains a password field.
- **Test-rig production isolation.** `tests/setup.ts` + new
  `e2e/global-setup.ts` resolve the DB from `TEST_DATABASE_URL` → `.env.test`
  → `.env` and **refuse** a production URL (`A2R_ALLOW_PROD_TESTS=1` = a
  documented single-machine break-glass). `db:rls:smoke` inherits the guard.
  New **`npm run db:rls:verify`** (`scripts/rls-prod-verify.ts`) is the
  production acceptance gate — `pg_catalog` / `information_schema` SELECTs,
  **zero DML**.

### RTM — requirements traceability (Phase 11)

| # | Capability | Primary files | Automated coverage |
| --- | --- | --- | --- |
| WP2-DEC-1 | `$` / rate arithmetic is exact decimal end-to-end in the engine | `src/lib/calculations/{money,sizing,financials,portfolio}.ts` | `tests/calculations-precision.test.ts` |
| WP2-DEC-2 | Defined rounding at accounting boundaries (money HALF_UP 2dp) | `src/lib/calculations/money.ts` | `tests/calculations-precision.test.ts` (roundMoney cases) |
| WP2-DEC-3 | Re-aggregating consumers don't reintroduce drift | `src/server/queries/executive-briefing.ts` | full vitest suite |
| WP2-ELEV-1 | Elevation requires fresh password verification | `src/lib/ops/staff-elevation.ts`, `src/server/actions/ops-elevation.ts` | `tests/staff-elevation.test.ts` (wrong-pw, SSO-only) |
| WP2-ELEV-2 | Elevation bound to `sessionVersion`; dies on session change | migration 23, `src/lib/ops-auth.ts` | `tests/staff-elevation.test.ts` (epoch-bump cases) |
| WP2-ELEV-3 | Elevation attempts rate-limited | `src/server/actions/ops-elevation.ts` (`rateLimitByUser`) | manual (UAT-3.10) |
| WP2-TEST-1 | Vitest + Playwright refuse a production DB | `tests/helpers/db-target.ts`, `tests/setup.ts`, `e2e/global-setup.ts` | guard verified (prod URL → run aborts) |
| WP2-TEST-2 | Production acceptance is read-only | `scripts/rls-prod-verify.ts` | run against production → OK, zero writes |

**Verification:** `npx tsc --noEmit` → 0; `npm run lint` → 0/0;
`npx prisma validate` → clean; `npx vitest run` → **625 passed** (53 files)
on **staging** (`.env.test`); `npm run build` → clean;
`npx playwright test` → **60 passed** on staging; `npm run db:rls:smoke` → OK
on staging; `npm run db:rls:verify` against **production** → OK (read-only,
zero DML). Migration 23 rehearsed (`BEGIN … ROLLBACK`) then applied to both
databases. The prod-pointed test runs of earlier work packages are no longer
possible — the guard aborts them.

## Phase 12 — hardening batches: rate-limiter fail-closed, operator MFA step-up (v1.15.0)

Post-v1.14.0, executing ChatGPT's remaining hardening recommendations as
numbered batches.

### FRD — functional summary

- **Batch 1 — distributed rate limiter fails closed in production.**
  `src/lib/rate-limiter-redis.ts` `hitDistributed()`: with a shared Upstash
  backend configured, a failing `client.eval` in production now **denies**
  the request (`429` + `error`-level report) rather than silently dropping
  to the per-instance limiter. No backend configured ⇒ in-process limiter,
  clean fallback everywhere (prod leaves one `info` breadcrumb).
  Non-production always falls back. Escape hatch
  `RL_ALLOW_INPROCESS_FALLBACK=1` (non-production behaviour in prod, for a
  sustained outage).
- **Batch 2 — mandatory operator second factor (TOTP)** (migration
  `00000000000024`, prod + staging). `requestElevation` calls
  `verifySecondFactor` after the password step-up: a 6-digit RFC 6238 code
  or a single-use recovery code, against the operator's `operator_mfa` row.
  Secret AES-256-GCM sealed (`src/lib/crypto/secret-box.ts`);
  `lastStepCounter` anti-replay; 10 SHA-256-hashed recovery codes issued
  once. **Hard cut-over** — no activated factor ⇒ `MFA_SETUP_REQUIRED`.
  Enrollment is self-service at **`/ops/security`** (standing grant + fresh
  password); rotation needs a live elevation; disabling is CLI-only
  (`npm run ops:mfa:reset`). `otplib` + `qrcode` added.

### RTM — requirements traceability (Phase 12)

| # | Capability | Primary files | Automated coverage |
| --- | --- | --- | --- |
| B1-RL-1 | Prod fails closed when a configured Upstash call fails | `src/lib/rate-limiter-redis.ts` | `tests/rate-limiter-redis.test.ts` (production failure policy) |
| B1-RL-2 | No backend configured ⇒ clean in-process fallback, all envs | `src/lib/rate-limiter-redis.ts` | `tests/rate-limiter-redis.test.ts` |
| B2-MFA-1 | Elevation requires a valid TOTP / recovery code | `src/lib/ops/staff-elevation.ts`, `src/lib/ops/operator-mfa.ts` | `tests/staff-elevation.test.ts`, `tests/operator-mfa.test.ts` |
| B2-MFA-2 | TOTP secret encrypted at rest; anti-replay enforced | `src/lib/crypto/secret-box.ts`, `src/lib/ops/operator-mfa.ts` | `tests/secret-box.test.ts`, `tests/operator-mfa.test.ts` (replay) |
| B2-MFA-3 | Self-service enrollment; CLI-only disable | `src/app/(admin)/ops/security/**`, `src/server/actions/ops-mfa.ts`, `scripts/ops-mfa.ts` | `e2e/staff-elevation.spec.ts` (Suite P), `e2e/global-setup.ts` |
| B2-MFA-4 | Elevation records the second-factor proof | migration 24 (`staff_elevations.secondFactorAt`) | `tests/staff-elevation.test.ts` (happy path) |

**Verification:** `npx tsc --noEmit` → 0; `npm run lint` → 0/0;
`npx prisma validate` → clean; `npx vitest run` → **644 passed** (55 files)
on **staging**; `npm run build` → clean; `npx playwright test` → **60 passed**
on staging. Migration 24 rehearsed (`BEGIN … ROLLBACK`) then applied to
production and staging (additive: one table + one nullable column).

## Phase 13 — audit follow-ups + organizational roles (v1.15.1 – v1.16.0)

Continued ChatGPT audit response, then a role model.

### FRD — functional summary

- **v1.15.1 — MFA key separation + atomic replay + CLI hardening.**
  `src/lib/crypto/secret-box.ts`: AES-256-GCM key now from a dedicated
  `MFA_ENCRYPTION_KEY` (required in prod; ≠ `NEXTAUTH_SECRET`), ciphertext
  `v2.<keyVersion>.<iv>.<tag>.<ct>`, legacy `v1` still decrypts, rotation via
  `MFA_ENCRYPTION_KEY_V<n>` + opportunistic re-seal on verify.
  `verifySecondFactor`: TOTP anti-replay is one conditional `UPDATE`
  (`lastStepCounter` advances only when strictly newer → the loser sees
  `count 0` → `REPLAYED`); recovery codes consumed under
  `SELECT … FOR UPDATE`. Operator CLIs (`scripts/lib/cli-io.ts`): no password
  as an argument (masked prompt / `--password-stdin` / `--generate`);
  `user:password:set` / `operator:create` default `mustChangePassword=true`
  + bump `sessionVersion`; every mutating CLI refuses a prod write without
  `--yes-prod` / `A2R_ALLOW_PROD_WRITE` / a typed confirmation.
- **v1.15.2 — readiness-probe hardening.** `GET /api/health/ready` returns
  **only** `{ status: "ready" | "unavailable" }` to unauthenticated callers
  (no database dependency / `latencyMs` / error-type / timestamp);
  `x-a2r-internal-token: <HEALTH_CHECK_TOKEN>` unlocks the diagnostic body.
  `GET /api/health` is a constant `{ status: "ok" }`.
- **v1.16.0 — A2R organizational roles.** `enum OperatorRole` on
  `staff_grants.role` (migration `00000000000025`; existing grants →
  `SUPER_ADMIN`): `SUPER_ADMIN` · `PROVISIONING` · `SUPPORT` · `AUDITOR` ·
  `BILLING` · `VIEWER`. Capability matrix `src/lib/ops/operator-roles.ts`
  (pure, Edge-safe) enforced in the middleware (`roleReachesOpsRoute` →
  redirect), `requireOpsCapability` (page), and `requireElevatedOps(cap)`
  (action → `ROLE_FORBIDDEN`). New `/ops/access` (Role & Access Management —
  view + change a role as a re-grant), `/ops/billing`, `/ops/audit`.
  `DeliveryAccessRole.VIEWER` — strict read-only tenant tier (`portfolio` +
  `steerco` view, no edit, financials `restricted`) + `OBSERVER` RBAC
  persona. Login screen: password show/hide eye toggle. Five family guest
  Viewer accounts (`npm run guests:seed`), seeded on production.

### RTM — requirements traceability (Phase 13)

| # | Capability | Primary files | Coverage |
| --- | --- | --- | --- |
| P13-KEY-1 | MFA secret sealed under a dedicated, versioned key | `src/lib/crypto/secret-box.ts` | `tests/secret-box.test.ts` (versioned key · rotation · legacy v1) |
| P13-RACE-1 | Atomic TOTP / recovery-code consumption | `src/lib/ops/operator-mfa.ts` `verifySecondFactor` | `tests/operator-mfa.test.ts` (concurrent races) |
| P13-CLI-1 | No password as a CLI argument; prod-write confirmation | `scripts/lib/cli-io.ts` + 4 CLIs | `tests/cli-io.test.ts` (10) |
| P13-HLTH-1 | Readiness probe leaks nothing to unauthenticated callers | `src/app/api/health/ready/route.ts` | `tests/security/health-endpoint.test.ts` (7) |
| P13-ROLE-1 | 6 operator roles, capability matrix, 3-layer enforcement | `src/lib/ops/operator-roles.ts`, `src/middleware.ts`, `src/lib/ops-auth.ts` | `tests/operator-roles.test.ts` (13), `tests/operator-role-grants.test.ts` (7) |
| P13-ROLE-2 | Role change is a re-grant (audit-preserving); not your own | `staff-grants.ts` `setOperatorRole`, `src/server/actions/ops-roles.ts` | `tests/operator-role-grants.test.ts` |
| P13-ROLE-3 | Read-only tenant Viewer tier + guest accounts | `DeliveryAccessRole.VIEWER`, `rbac.ts` / `rbacMatrix.ts` / `masking.ts` / `scoping.ts`, `scripts/seed-guests.ts` | `tests/rbac-matrix.test.ts` (6 personas) · **e2e Suite Q** |
| P13-UI-1 | Login password show/hide toggle (a11y) | `src/app/(auth)/login/page.tsx` | e2e Suites A / Q |

**Verification:** `tsc` → 0 · `lint` → 0/0 · `prisma validate` → clean ·
`vitest` → **689 passed** (59 files) on staging · `next build` → clean ·
`playwright` → **65 passed** (Suites A–Q) on staging · `db:rls:verify`
against production → OK (read-only) · `health:prod` → ready · database ok.
Migrations 24–25 rehearsed (`BEGIN … ROLLBACK`) then applied to production
and staging. Tags `v1.15.1` (`19bef0e`), `v1.15.2` (`67783b5`), `v1.16.0`
(`e1a0c09`) each point at the exact commit deployed to production.

## What's next (Phase 3b+)

1. `npm install` once registry access exists, then `prisma migrate dev` to
   generate the authoritative migration and Prisma client (reconciling the
   four hand-derived migrations into Prisma's own history), then rebuild
   the `vitest` harness in full and run it — including new coverage for
   `computeContractorExposure`, the CSV parsers, `computeFlightPathVariance`/
   `computeOpenDemandRisk`/`computeBurnToDatePct`, and the Portfolio CSV
   serializer, all hand-verified across WP6/WP7 but not yet under the real
   test runner — plus `npm run db:seed` to confirm both against the real
   toolchain.
2. Apply `canEditProject`/`hasPermission` to the remaining mutations
   (RAID create/status-change, schedule date edits) — most module
   mutations now route through `authorizeProjectEdit` as of WP5/WP6, but a
   few (e.g. `updateRaidStatus`) still don't.
3. Port the remaining interactive editors (scope builder, schedule date
   pickers) onto the existing schema.
4. Invite flow (`Membership` creation for a second user, with a
   `deliveryRole` picker). Federated tenants get this via **SSO JIT
   provisioning** as of Phase 3c (`src/server/services/identity-jit.ts`),
   but a password-based org still has no manual invite / role-change UI:
   `/register` always creates a *new* organization, and `deliveryRole` is
   set only at seed time. Documented as a known gap in
   `docs/ADMIN_ONBOARDING.md`'s Step 3 (hand-seeding, same as
   `prisma/seed.ts`'s demo logins) until it ships.
5. A tenant-wide rate-card CSV importer — WP6's CSV pipeline covers three
   *per-project* imports (Effort Matrix, RAID, Financial Actuals), not the
   `DeliveryRole` roster itself. Documented as a known gap in
   `docs/ADMIN_ONBOARDING.md`'s Step 2, with the Workspace Backup/Restore
   JSON snapshot as today's real bulk-load path.
6. Persist Support tickets to a real store (or forward them to an actual
   ticketing system) instead of WP8's structured console log line —
   `submitSupportTicketAction`'s `{ok, ticketId}` contract was designed so
   this is a one-function swap (add a `SupportTicket` model + migration, or
   call an outbound webhook) with no change needed in
   `SupportTicketModal.tsx` or either of its two entry points.
7. **Live IdP handshake for Enterprise SSO** — Phase 3c ships the full
   config / metadata-verification / JIT / group-mapping engine and the
   Admin panel, but not yet the browser redirect to the IdP, assertion
   signature validation against the pinned cert / JWKS, and a NextAuth
   per-tenant provider. `applyFederatedLogin()` is the seam that plugs in.
   _(The `admin:*` governance surface reserved earlier shipped in Phase 3c
   as the Governance and Identity Federation panels in Admin & Org Setup.)_
8. Deployment config (Vercel/Docker + managed Postgres, e.g. Neon/RDS) and
   CI (`typecheck`/`lint`/`build` on PRs).
