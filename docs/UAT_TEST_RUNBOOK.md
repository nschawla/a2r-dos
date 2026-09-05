# A2R Delivery OS™ — UAT Test Runbook

_Applies to v1.5.x · Last updated 2026-09-05_

This runbook is the human-executable half of the QA framework. It gives a
tester **explicit login data, exact steps, expected visual outcomes, and a
pass/fail checkpoint** for every major module. The automated half
(`vitest` + Playwright) is summarised in §2 and cross-referenced per case.

> Run the automated suites first (§2). Everything green there means the
> engines are sound; this runbook then verifies the assembled product
> against a human's eyes.

---

## 1. Test data

### 1.1 Environment

| Item | Value |
| --- | --- |
| App URL | `http://localhost:3000` |
| Seed command | `npm run db:seed` (idempotent — safe to re-run) |
| Reset a tenant's governance | Admin & Org Setup → Governance → **Standard Delivery** |

### 1.2 Logins

All demo passwords are **`password12345`** unless noted.

**Tenant: A2R DOS Demo** (`a2r-ventures-demo`)

| Email | Console role | Delivery role | Default landing |
| --- | --- | --- | --- |
| `admin@a2rventures-demo.test` | Owner/Admin | ADMIN | Control Tower (`/portfolio`) |
| `vp@a2rventures-demo.test` | Viewer | VP_EXECUTIVE | SteerCo Briefing (`/steerco`) |
| `pd@a2rventures-demo.test` | Admin | PRACTICE_DIRECTOR | Control Tower (`/portfolio`) |
| `dm@a2rventures-demo.test` | Member | DELIVERY_MANAGER | Control Tower (`/portfolio`) |
| `pm@a2rventures-demo.test` | Member | PROJECT_MANAGER | Control Tower (`/portfolio`) |

**Tenant: Acme Health** (`acme-health`) — same five role shapes:
`admin@acme-health.test`, `sponsor@acme-health.test` (VP), `pd@acme-health.test`,
`lead@acme-health.test` (DM), `pm@acme-health.test`.

**A2R platform staff**

| Email | Password | Notes |
| --- | --- | --- |
| `ops@a2rventures.com` | `password12345` | Staff, **no** client membership — lands on `/ops` |
| `navinder@a2rventures.com` | `Password123!` | Master: staff **and** Owner/Admin in every tenant |

### 1.3 Reference figures (A2R DOS Demo, fresh seed)

| Figure | Value |
| --- | --- |
| Engagements in scope (Admin view) | 6 |
| Total contract value | ~$1,430,428 |
| Avg. baseline margin | ~37.5% |
| High-risk (red) projects | 1 |
| Blended billable utilization | ~80.2% (target 68%) |
| Parent program | "Global ERP Modernization" (2 child waves) |

---

## 2. Automated coverage (run before manual UAT)

```bash
npm test            # Vitest — 388 unit + integration tests across 29 files, ~5s
npx tsc --noEmit    # strict typecheck, 0 errors
npm run test:e2e    # Playwright — full Suites A–K against a running dev server
```

| Flow | Automated by |
| --- | --- |
| Role-based landing resolution | `tests/enterprise-flows.test.ts` · `tests/workspace-lens.test.ts` · e2e Suite **J1** |
| Multi-role perspective switching | `tests/enterprise-flows.test.ts` · e2e Suite **J2** |
| Governance template application (Standard / Agile / Board-Only) | `tests/enterprise-flows.test.ts` · `tests/governance-config.test.ts` · e2e Suite **J3** |
| Financial data masking for delivery roles | `tests/enterprise-flows.test.ts` · `tests/masking.test.ts` · e2e Suites **H**, **J4** |
| Ops Console SSO configuration | `tests/enterprise-flows.test.ts` · `tests/identity-*.test.ts` · e2e Suite **J5** |
| Command Center / Portfolio / Governance / Reporting / Ops | e2e Suites **B–I** |
| Role-Based Scoped Filtering — practice-scoped project/resource predicates | `tests/scoping.test.ts` · e2e Suite **K1–K2** |
| Custom KPI Definition Engine — metric calc, validation, persona filtering, create-to-dashboard | `tests/kpi-engine.test.ts` · e2e Suite **K3** |
| Self-service batch import (4 pillars: Weekly Actuals, Milestone & Progress, Forecast & EAC, Status Reports & RAID Log) — schema validation, plain-English errors, CSV/Excel parsing | `tests/batch-schemas.test.ts` · `tests/workbook-reader.test.ts` · `tests/templates.test.ts` (no Playwright suite yet — see UAT-4.7 for the manual walkthrough) |

A tester records `PASS` / `FAIL` (+ notes) against each checkpoint below.

---

## 3. Enterprise flows

### UAT-3.1 · Role-based landing

| Step | Action | Expected | ✅/❌ |
| --- | --- | --- | --- |
| 1 | Sign in as `vp@a2rventures-demo.test` | URL settles on **`/steerco`**; page title "…— Portfolio Review" | |
| 2 | Sign out, sign in as `pm@a2rventures-demo.test` | URL settles on **`/portfolio`**; heading **"PS Control Tower"**; subhead says "Scoped to your Project Manager portfolio" | |
| 3 | Sign out, sign in as `admin@a2rventures-demo.test` | URL **`/portfolio`**; subhead "Portfolio-wide view across every registered engagement" | |
| 4 | As admin, click the browser back button after any deep navigation | No full reload flash; app chrome stays mounted | |
| 5 | Sign out entirely, visit **`/`** | The dark **"Coming Soon" page** renders — the "Deliver Projects with Absolute Clarity. Zero Chaos." headline, a **Sneak Peek** button (opens a preview modal; Escape / backdrop closes it), and an early-access form (Full name, Organization, Work email, Phone number). No redirect to `/login` | |
| 6 | Fill the early-access form and submit | A confirmation panel appears with a `WAIT-…` reference; the row is written to the server log as `[EARLY_ACCESS_LEAD] {…}` | |
| 7 | While signed in, visit **`/`** | Forwarded straight to your workspace (`/portfolio` or your lens landing) — the Coming Soon page is not shown to a signed-in user | |

**Checkpoint:** each role lands on its tailored page, no `/login` bounce, no error overlay.

### UAT-3.2 · Perspective switcher (multi-role)

Signed in as `admin@a2rventures-demo.test`.

| Step | Action | Expected | ✅/❌ |
| --- | --- | --- | --- |
| 1 | Header: click the **"Perspective · Delivery ▾"** pill | Menu "Land me on" opens with **four** rows: Executive / SteerCo, Delivery Lead, Finance Controller, Operations — each with a one-line blurb | |
| 2 | Click **Executive / SteerCo** | Navigates to `/steerco` **instantly** (no reload); pill now reads "Perspective · Executive" | |
| 3 | In the address bar go to `/launch` | Redirects straight back to `/steerco` (choice persisted) | |
| 4 | Switch perspective back to **Delivery Lead** | Navigates to `/portfolio` | |
| 5 | Sign in as `pm@a2rventures-demo.test`, open the Perspective menu | Only **two** rows: Delivery Lead, Operations (PM can't see Executive/Finance) | |

**Checkpoint:** switch is instant, persisted, and role-gated.

### UAT-3.3 · Governance template application

Signed in as `admin@a2rventures-demo.test` → **Admin & Org Setup** → **Governance** tab.

| Step | Action | Expected | ✅/❌ |
| --- | --- | --- | --- |
| 1 | Note the **"Active:"** badge in the Layer 1 header | Reads **"Standard Delivery"** | |
| 2 | Click **Agile Delivery** | Toast "Applied 'Agile Delivery'"; the Agile card gets a blue border + ✓ | |
| 3 | Look at the left sidebar | **Commercial Baseline** and **Executive Hub** are **gone**; Control Tower / Admin / Compliance Ledger remain | |
| 4 | In Layer 2, check "Scrub margins & EAC for delivery roles" | Reads **On** | |
| 5 | Click **Board-Only** | Sidebar collapses to: Control Tower, Control Audit, SteerCo Briefing, Executive Hub, Admin, Compliance Ledger only | |
| 6 | Click **Standard Delivery** | Toast "Applied 'Standard Delivery'"; the full sidebar returns; Active badge → "Standard Delivery" | |
| 7 | Open **Compliance Ledger** (`/admin/audit-log`) | Recent rows include **"Governance config change"** entries; integrity badge **Verified** | |

**Checkpoint:** navigation surface tracks the template; every change is ledgered; restoring Standard is lossless.

### UAT-3.4 · Financial data masking for delivery roles

| Step | Action | Expected | ✅/❌ |
| --- | --- | --- | --- |
| 1 | As `admin@…`, Governance tab → apply **Strict Financial Governance** | Toast confirms | |
| 2 | Sign in as `pd@a2rventures-demo.test`, land on `/portfolio` (Portfolio tab) | **"Avg. Baseline Margin"** stat card shows **`••••`** with a small lock; **Total Contract Value** still shows a number | |
| 3 | As PD open **Financial Realization** for any engagement | Page shows a "Restricted to Partners" notice; EAC / margin figures masked | |
| 4 | Sign in as `vp@a2rventures-demo.test` | Margins **still visible** (VP is unaffected by the delivery-role scrub) | |
| 5 | As `admin@…` restore **Standard Delivery** | | |
| 6 | Sign in as `pd@…` again, view `/portfolio` | "Avg. Baseline Margin" now shows **~37.5%** (un-masked) | |
| 7 | Sign in as `pm@a2rventures-demo.test` (any governance) | Margins/cost always masked for a PM — role-based baseline | |

**Checkpoint:** the org toggle bites Practice Director + below, never VP/Admin; masked = `••••` + lock, never a blank.

### UAT-3.5 · Ops Console SSO configuration

Signed in as `ops@a2rventures.com`.

| Step | Action | Expected | ✅/❌ |
| --- | --- | --- | --- |
| 1 | Sidebar → **Identity Federation** (`/ops/identity`) | Heading "Identity Federation"; a tenant selector + a "Select a tenant to configure" list (A2R DOS Demo, Acme Health) | |
| 2 | Choose **Acme Health** | URL `?org=…`; panel titled **"SSO & Identity Federation — Acme Health"** | |
| 3 | Provider **Microsoft Entra ID**, Protocol **OIDC**, Connection name `Acme Entra ID`, Email domains `acme-health.test` → **Create connection** | Toast "Identity provider saved"; status chips: **Configured** (green), **Unverified** (grey), **Disabled** (grey), **Optional** (grey), `OIDC · AZURE_AD` | |
| 4 | Paste a discovery URL (e.g. `https://accounts.google.com/.well-known/openid-configuration`) → **Verify IdP metadata** | Green result box lists Issuer / Authorization endpoint / Token endpoint / JWKS URI; "Verified" chip turns green | |
| 5 | Add a group mapping: `Acme-Delivery-Admins` → Delivery role **Admin**, priority `10` → **Add mapping** | Row appears in the table | |
| 6 | Try **Enforce SSO** | Blocked with "Enable federation before enforcing it." | |
| 7 | **Enable federation**, then **Enforce SSO** | Both chips flip to green / amber; enforcement now active | |
| 8 | (cleanup) **Remove connection** | Toast "Identity provider removed"; panel returns to the empty state | |
| 9 | Confirm this panel is **not** present in the tenant `/admin` module | Admin & Org Setup → Data & Compliance shows only a note that SSO is managed by A2R | |

**Checkpoint:** SSO config is Ops-only, secrets never shown (only a fingerprint), verification gates enable, enable gates enforce.

### UAT-3.6 · Role-Based Scoped Filtering (PD vs. Admin)

| Step | Action | Expected | ✅/❌ |
| --- | --- | --- | --- |
| 1 | Sign in as `admin@a2rventures-demo.test`, open **Resource & Capacity** (`/capacity`) | Scope-indicator line reads **"Tenant-wide — every practice."**; the full roster count | |
| 2 | Sign out, sign in as `pd@a2rventures-demo.test`, open **Resource & Capacity** | Scope-indicator line reads **"Scoped to your practice — N resources."**, N strictly less than the Admin's tenant-wide count | |
| 3 | As `pd@…`, open the project picker on **Financial Realization**, **RAID Cockpit**, **Commercial Baseline**, **Control Audit**, and **Schedule & Milestones** | Every picker lists only projects in the PD's own practice — never the full tenant roster | |
| 4 | As `admin@…`, open the same five project pickers | Every picker lists the full tenant-wide project list | |
| 5 | Sign in as `dm@a2rventures-demo.test` (Delivery Manager) | Resource & Capacity scopes to their direct reports only, not the whole practice | |
| 6 | Sign in as `pm@a2rventures-demo.test` | Project pickers scope to their own assigned engagements only | |

**Checkpoint:** the same screens render for every role, but the row set — never the layout — narrows strictly with the role's scope; a scoped role never sees a tenant-wide fallback.

---

## 4. Module runbooks

### UAT-4.1 · Command Center (`/command`)

Sign in as `admin@a2rventures-demo.test`, go to **Command Center**.

| # | Check | Expected | ✅/❌ |
| --- | --- | --- | --- |
| 1 | **Pulse strip** | 4 vitals: Book of Business (~$1.43M / 6 engagements), Delivery Velocity (~80.2%), Margin Health (~37.5%), Risk Flags (green when 0, else red count) | |
| 2 | **Command Bar** — type `raid` | Top suggestion "RAID Cockpit"; **Enter** navigates to `/raid` | |
| 3 | Command Bar — type `financials for Global ERP` | Suggestion "Financial Realization — Global ERP Modernization"; Enter opens `/financials/<id>` | |
| 4 | Command Bar — type `search` then Enter | The ⌘K palette opens | |
| 5 | **Active Stream** | A single chronological feed mixing Activity / Governance / Risk items with tone dots and relative timestamps | |
| 6 | As `pm@…` view Command Center | Margin Health vital shows `••••` | |

### UAT-4.2 · Portfolio / Control Tower (`/portfolio`)

| # | Check | Expected | ✅/❌ |
| --- | --- | --- | --- |
| 1 | **Sub-nav pills** | `Portfolio` · `Engagements 6` · `Activity` — clicking swaps the view **instantly**, exactly one panel visible, URL gains `?v=…` | |
| 2 | **Portfolio** tab | 4 stat cards, the Blended Billable Utilization card linking to `/capacity`, "Parent Programs" rollup with "Global ERP Modernization" | |
| 3 | **Engagements** tab | "Active Projects" table (6 rows), each "Open →" deep-links to `/commercial-baseline/<id>`; "Register a New Engagement" form below | |
| 4 | **Activity** tab | Recent governance/activity list | |
| 5 | Deep-link `/?v=engagements` in a fresh tab | Loads straight into the Engagements tab | |
| 6 | Sign in as `pm@…` | Table scoped to the PM's own projects only; subhead reflects the scope | |
| 7 | Switch tenant (header org switcher) to Acme Health | All figures re-scope to Acme; no stale A2R data | |

### UAT-4.3 · Engagement Governance (per-project modules)

Open any engagement from Control Tower → Engagements → **Open →**.

| # | Check | Expected | ✅/❌ |
| --- | --- | --- | --- |
| 1 | **Project header** | Name + health dot + hierarchy tag; action bar (Lock Baseline / Audit Trail / Reports Hub / Export…) | |
| 2 | **Module pills** under the header | `Baseline · Financials · Schedule · RAID · Control Audit` — the current one highlighted | |
| 3 | Click **Financials** pill | Navigates to `/financials/<same id>` (no sidebar detour); pill highlight moves | |
| 4 | Cycle all five pills | Each loads its module for the same project without error | |
| 5 | **Commercial Baseline** | Commercial setup, sizing matrix, scope table; "Lock Baseline" prompts a confirmation dialog | |
| 6 | **Control Audit** | 10-control checklist, weighted score, control-guidance `i` buttons | |
| 7 | **RAID Cockpit** | Counters + type filters (R/A/I/D); SteerCo-escalated items flagged | |
| 8 | **Financial Realization** | EAC KPI cards, burn curve, per-role hours; masked for restricted roles | |
| 9 | **Schedule & Milestones** | Phase table with variance / pace / status | |
| 10 | As `dm@…` (Delivery Manager) | Approve-only authority; no direct edit controls on modules they don't own | |

### UAT-4.4 · Reporting / Executive Hub (`/reports`)

| # | Check | Expected | ✅/❌ |
| --- | --- | --- | --- |
| 1 | **Sub-nav pills** | `Portfolio Briefing` · `Engagement Reports 5` — instant swap | |
| 2 | **Portfolio Briefing** tab | The 4-section executive briefing; **"Print / Export Executive Briefing"** button | |
| 3 | Click Print (or Ctrl/Cmd-P) from the Briefing tab | Print preview is a clean **light** document: no sidebar, header, footer, or pills; sections don't split across pages | |
| 4 | Switch to **Engagement Reports** tab, then Print | The briefing **still** prints (it's flagged print-keep) — the engagement tooling does not | |
| 5 | **Engagement Reports** tab | Project selector; SteerCo deck / margin rollup / compliance certificate launchers; SteerCo Decision Tracker | |
| 6 | As `pm@…` | Briefing figures masked; the tester can still generate a deck for **their own** engagement | |
| 7 | Open a per-project **Reports Hub** link from a Project Header | Lands on `/reports?project=<id>` with that engagement preselected | |

### UAT-4.5 · Ops Console (`/ops`)

Sign in as `ops@a2rventures.com` (or `navinder@…`).

| # | Check | Expected | ✅/❌ |
| --- | --- | --- | --- |
| 1 | Landing | `ops@…` (no membership) lands on `/ops`; a non-staff user visiting `/ops/*` is redirected to `/portfolio` | |
| 2 | **Telemetry** | Platform-wide totals (tenants, red engagements, at-risk RAID) + per-tenant breakdown | |
| 3 | **Platform Pulse** | Running build + commit, live DB probe with latency, last test-suite result, Engineering Stream; header health pill refreshes | |
| 4 | **Tenants** | Every org with status pills; each row's actions menu: Suspend / Impersonate / Export / Purge | |
| 5 | **Identity Federation** | Tenant picker → per-tenant SSO panel (see UAT-3.5) | |
| 6 | **Ingestion & Templates** | CSV template downloads + schema reference | |
| 7 | Impersonate a tenant (Tenants → actions → Impersonate, give a reason) | Opens a **read-only** tenant session with a persistent banner; the reason is written to that tenant's Compliance Ledger before the session starts | |
| 8 | Build stamp at the bottom of the Ops sidebar | Reads `A2R Delivery OS v1.5.x`; click → Release Notes modal | |

### UAT-4.6 · Admin & Org Setup (`/admin`)

Sign in as `admin@a2rventures-demo.test`.

| # | Check | Expected | ✅/❌ |
| --- | --- | --- | --- |
| 1 | **Sub-nav pills** | `Roster` · `Governance` · `Data & Compliance` — instant swap, one panel at a time, no trailing item-count badges | |
| 2 | **Roster** tab | Functional Practices, Roles & Rate Card Matrix, Resource Directory — add/remove works, toasts confirm | |
| 3 | Roster → a rate-card **Cost Rate** column as `admin@…` | Shows real `$` figures (ADMIN = full visibility) | |
| 4 | **Governance** tab | Milestone & Margin Thresholds, Hybrid Configuration Model (see UAT-3.3), Delivery Controls & Governance Standards (rename a control label) | |
| 5 | **Data & Compliance** tab | Workspace Backup / Restore, links to Data Ingestion & Templates and the SOC 2 Compliance Ledger (with a **Verified** badge), and the SSO-moved-to-Ops note | |
| 6 | Sign in as `dm@a2rventures-demo.test` (Member) | `/admin` shows **"You have view-only access to org setup."**; forms disabled | |
| 7 | Refresh `/admin` on the Governance tab | Stays on Governance (tab state survives reload via `?v=governance`) | |

### UAT-4.7 · Self-Service Batch Import Engine (`/admin/ingestion`, Batch Import tab)

Sign in as `admin@a2rventures-demo.test`. Test file — save as `.csv`:

```
Project Code,Employee Email,Week Ending,Actual Hours
BOGUS-CODE,pd@a2rventures-demo.test,2026-03-08,10
Wave 1 – Finance & Procurement,pd@a2rventures-demo.test,not-a-date,5
```

| # | Check | Expected | ✅/❌ |
| --- | --- | --- | --- |
| 1 | **Admin & Org Setup → Data Ingestion & Templates → Batch Import** tab | Data type toggle with **four** pills — **Weekly Actuals** / **Milestone & Progress Updates** / **Forecast & EAC Updates** / **Status Reports & RAID Log** — + a drag-and-drop zone; a **Recent Batches** table below | |
| 2 | Drop the test file (Weekly Actuals selected) | Instant preview: **`0 valid`**, **`2 quarantined`**; a table lists both rows' plain-English reasons (unmapped project code; unrecognizable date) | |
| 3 | Click **Stage 2 rows** | Redirects to the batch's own page; badges read `0 valid` / `2 in quarantine` / `2 total`; **Re-validate & Commit** is **disabled** | |
| 4 | In row 2, correct **Week Ending** to `2026-03-08`, click **Save & re-validate** | That row's date error clears; its **Project Code** error (still bogus) stays; commit stays disabled | |
| 5 | In row 1, correct **Project Code** to `Wave 1 – Finance & Procurement`, click **Save & re-validate** | Row 1 turns **Corrected**; quarantine count drops to 0; **Re-validate & Commit** becomes enabled | |
| 6 | Click **Re-validate & Commit** | Success state; edit controls disappear (batch is now read-only) | |
| 7 | Open **Resource & Capacity** for the "Wave 1" engagement | The week of 2026-03-02 (Monday-anchored) now shows the imported actual hours for Priya Director | |
| 8 | Open **Compliance Ledger** (`/admin/audit-log`) | A **"Self-service batch import committed"** entry appears; integrity badge stays **Verified** | |
| 9 | Start a second upload, then click **Discard batch** before fixing anything | Confirms, then returns to the Batch Import tab; the discarded batch shows status **Discarded** in Recent Batches, nothing was written | |
| 10 | Sign in as `pm@a2rventures-demo.test` | The **Batch Import** tab does not appear — only **Templates** | |

**Checkpoint:** malformed rows never touch live data; the commit button is a genuine hard stop, not just a visual one; every field re-validates against live projects/resources on save, not a cached snapshot; only Admins see the tab.

**New-pillar spot-check:** repeat steps 1-3 and 6-8 once each for the **Forecast & EAC Updates** pill (columns: Project Code, Role, Forecast Hours, Open RR Hours — a Direct Intake project's code should quarantine with a clear "use that project's own Financial Realization import" reason) and the **Status Reports & RAID Log** pill (columns: Project Code, Week Ending, Status Narrative, RAID Type/Description/Severity/Owner Email — a row with neither a narrative nor any RAID fields should quarantine as "nothing to import").

### UAT-4.8 · Custom KPI Builder (`/admin/kpis`)

Sign in as `admin@a2rventures-demo.test`.

| # | Check | Expected | ✅/❌ |
| --- | --- | --- | --- |
| 1 | **Admin & Org Setup → Custom KPIs** (or `/admin/kpis` directly) | A list of existing KPI cards (empty on a fresh seed) + a **"+ New KPI"** button | |
| 2 | Click **"+ New KPI"**, pick data source **RAID Cockpit** | The metric picker updates to that source's two metrics (Open Critical RAID Items / Escalated RAID Items); formula-type defaults sensibly for the chosen metric | |
| 3 | Name it "Open Critical RAID", leave the default metric, set target `2`, warning `5`, assign persona **Admin** only → **Save** | Toast confirms; the new card appears in the list immediately | |
| 4 | Open the **Control Tower** (`/`) as `admin@…` | The "Open Critical RAID" card renders with a live value and a status dot (on-track / at-risk / critical) | |
| 5 | Sign in as `pm@a2rventures-demo.test`, open Control Tower | The card does **not** render (PM is not in its persona list) | |
| 6 | As `admin@…`, edit the KPI and add **Project Manager** to its personas → **Save** | Sign back in as `pm@…`: the card now renders on their Control Tower | |
| 7 | Open the **Executive Hub** (`/reports`) as a persona the KPI is bound to | The same card renders there too | |
| 8 | Delete the KPI | It disappears from `/admin/kpis` and from every dashboard it rendered on, on next load | |

**Checkpoint:** a KPI is a binding (source + metric + thresholds + personas), never a hand-written formula; persona binding is enforced on read, not just on the builder screen; changes reflect without a redeploy.

---

## 5. Regression sweep (every release)

| # | Check | ✅/❌ |
| --- | --- | --- |
| 1 | `npm test` → all green; `npx tsc --noEmit` → 0 errors | |
| 2 | `npm run test:e2e` → Suites A–K all green | |
| 3 | Sign-in works for one login per role shape (admin / vp / pd / dm / pm / ops) | |
| 4 | ⌘K palette opens on every route incl. `/login` and `/ops` | |
| 4a | `/` (signed out) shows the dark Coming Soon page + working Sneak Peek modal + early-access form; `/` (signed in) forwards to the workspace; `/portfolio` renders the Control Tower | |
| 5 | Tenant switch (header) fully re-scopes the workspace | |
| 6 | No Next.js error overlay anywhere during the walkthrough | |
| 7 | Compliance Ledger integrity badge = **Verified** in every tenant | |
| 8 | Demo tenant governance left on **Standard Delivery**; no stray identity providers | |
| 9 | No stray `DataImportBatch` rows or test `WeeklyAssignmentSlot`/`SchedulePhase` writes left in the demo tenant from batch-import testing | |
| 10 | No stray test `CustomKpi` rows left in the demo tenant from Custom KPI Builder testing | |

---

## 6. Sign-off

| Role | Name | Date | Result |
| --- | --- | --- | --- |
| QA Lead | | | PASS / FAIL |
| Product Owner | | | PASS / FAIL |
| Eng Lead | | | PASS / FAIL |
