# A2R Delivery OS™ — UAT Test Runbook

_Applies to v1.2.x · Last updated 2026-09-03_

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

**Tenant: A2R Ventures Demo** (`a2r-ventures-demo`)

| Email | Console role | Delivery role | Default landing |
| --- | --- | --- | --- |
| `admin@a2rventures-demo.test` | Owner/Admin | ADMIN | Control Tower (`/`) |
| `vp@a2rventures-demo.test` | Viewer | VP_EXECUTIVE | SteerCo Briefing (`/steerco`) |
| `pd@a2rventures-demo.test` | Admin | PRACTICE_DIRECTOR | Control Tower (`/`) |
| `dm@a2rventures-demo.test` | Member | DELIVERY_MANAGER | Control Tower (`/`) |
| `pm@a2rventures-demo.test` | Member | PROJECT_MANAGER | Control Tower (`/`) |

**Tenant: Acme Health** (`acme-health`) — same five role shapes:
`admin@acme-health.test`, `sponsor@acme-health.test` (VP), `pd@acme-health.test`,
`lead@acme-health.test` (DM), `pm@acme-health.test`.

**A2R platform staff**

| Email | Password | Notes |
| --- | --- | --- |
| `ops@a2rventures.com` | `password12345` | Staff, **no** client membership — lands on `/ops` |
| `navinder@a2rventures.com` | `Password123!` | Master: staff **and** Owner/Admin in every tenant |

### 1.3 Reference figures (A2R Ventures Demo, fresh seed)

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
npm test            # Vitest — 259 unit + integration tests, ~5s
npx tsc --noEmit    # strict typecheck, 0 errors
npm run test:e2e    # Playwright — full Suites A–J against a running dev server
```

| Flow | Automated by |
| --- | --- |
| Role-based landing resolution | `tests/enterprise-flows.test.ts` · `tests/workspace-lens.test.ts` · e2e Suite **J1** |
| Multi-role perspective switching | `tests/enterprise-flows.test.ts` · e2e Suite **J2** |
| Governance template application (Standard / Agile / Board-Only) | `tests/enterprise-flows.test.ts` · `tests/governance-config.test.ts` · e2e Suite **J3** |
| Financial data masking for delivery roles | `tests/enterprise-flows.test.ts` · `tests/masking.test.ts` · e2e Suites **H**, **J4** |
| Ops Console SSO configuration | `tests/enterprise-flows.test.ts` · `tests/identity-*.test.ts` · e2e Suite **J5** |
| Command Center / Portfolio / Governance / Reporting / Ops | e2e Suites **B–I** |

A tester records `PASS` / `FAIL` (+ notes) against each checkpoint below.

---

## 3. Enterprise flows

### UAT-3.1 · Role-based landing

| Step | Action | Expected | ✅/❌ |
| --- | --- | --- | --- |
| 1 | Sign in as `vp@a2rventures-demo.test` | URL settles on **`/steerco`**; page title "…— Portfolio Review" | |
| 2 | Sign out, sign in as `pm@a2rventures-demo.test` | URL settles on **`/`**; heading **"PS Control Tower"**; subhead says "Scoped to your Project Manager portfolio" | |
| 3 | Sign out, sign in as `admin@a2rventures-demo.test` | URL **`/`**; subhead "Portfolio-wide view across every registered engagement" | |
| 4 | As admin, click the browser back button after any deep navigation | No full reload flash; app chrome stays mounted | |

**Checkpoint:** each role lands on its tailored page, no `/login` bounce, no error overlay.

### UAT-3.2 · Perspective switcher (multi-role)

Signed in as `admin@a2rventures-demo.test`.

| Step | Action | Expected | ✅/❌ |
| --- | --- | --- | --- |
| 1 | Header: click the **"Perspective · Delivery ▾"** pill | Menu "Land me on" opens with **four** rows: Executive / SteerCo, Delivery Lead, Finance Controller, Operations — each with a one-line blurb | |
| 2 | Click **Executive / SteerCo** | Navigates to `/steerco` **instantly** (no reload); pill now reads "Perspective · Executive" | |
| 3 | In the address bar go to `/launch` | Redirects straight back to `/steerco` (choice persisted) | |
| 4 | Switch perspective back to **Delivery Lead** | Navigates to `/` | |
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
| 2 | Sign in as `pd@a2rventures-demo.test`, land on `/` (Portfolio tab) | **"Avg. Baseline Margin"** stat card shows **`••••`** with a small lock; **Total Contract Value** still shows a number | |
| 3 | As PD open **Financial Realization** for any engagement | Page shows a "Restricted to Partners" notice; EAC / margin figures masked | |
| 4 | Sign in as `vp@a2rventures-demo.test` | Margins **still visible** (VP is unaffected by the delivery-role scrub) | |
| 5 | As `admin@…` restore **Standard Delivery** | | |
| 6 | Sign in as `pd@…` again, view `/` | "Avg. Baseline Margin" now shows **~37.5%** (un-masked) | |
| 7 | Sign in as `pm@a2rventures-demo.test` (any governance) | Margins/cost always masked for a PM — role-based baseline | |

**Checkpoint:** the org toggle bites Practice Director + below, never VP/Admin; masked = `••••` + lock, never a blank.

### UAT-3.5 · Ops Console SSO configuration

Signed in as `ops@a2rventures.com`.

| Step | Action | Expected | ✅/❌ |
| --- | --- | --- | --- |
| 1 | Sidebar → **Identity Federation** (`/ops/identity`) | Heading "Identity Federation"; a tenant selector + a "Select a tenant to configure" list (A2R Ventures Demo, Acme Health) | |
| 2 | Choose **Acme Health** | URL `?org=…`; panel titled **"SSO & Identity Federation — Acme Health"** | |
| 3 | Provider **Microsoft Entra ID**, Protocol **OIDC**, Connection name `Acme Entra ID`, Email domains `acme-health.test` → **Create connection** | Toast "Identity provider saved"; status chips: **Configured** (green), **Unverified** (grey), **Disabled** (grey), **Optional** (grey), `OIDC · AZURE_AD` | |
| 4 | Paste a discovery URL (e.g. `https://accounts.google.com/.well-known/openid-configuration`) → **Verify IdP metadata** | Green result box lists Issuer / Authorization endpoint / Token endpoint / JWKS URI; "Verified" chip turns green | |
| 5 | Add a group mapping: `Acme-Delivery-Admins` → Delivery role **Admin**, priority `10` → **Add mapping** | Row appears in the table | |
| 6 | Try **Enforce SSO** | Blocked with "Enable federation before enforcing it." | |
| 7 | **Enable federation**, then **Enforce SSO** | Both chips flip to green / amber; enforcement now active | |
| 8 | (cleanup) **Remove connection** | Toast "Identity provider removed"; panel returns to the empty state | |
| 9 | Confirm this panel is **not** present in the tenant `/admin` module | Admin & Org Setup → Data & Compliance shows only a note that SSO is managed by A2R | |

**Checkpoint:** SSO config is Ops-only, secrets never shown (only a fingerprint), verification gates enable, enable gates enforce.

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

### UAT-4.2 · Portfolio / Control Tower (`/`)

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
| 1 | Landing | `ops@…` (no membership) lands on `/ops`; a non-staff user visiting `/ops/*` is redirected to `/` | |
| 2 | **Telemetry** | Platform-wide totals (tenants, red engagements, at-risk RAID) + per-tenant breakdown | |
| 3 | **Platform Pulse** | Running build + commit, live DB probe with latency, last test-suite result, Engineering Stream; header health pill refreshes | |
| 4 | **Tenants** | Every org with status pills; each row's actions menu: Suspend / Impersonate / Export / Purge | |
| 5 | **Identity Federation** | Tenant picker → per-tenant SSO panel (see UAT-3.5) | |
| 6 | **Ingestion & Templates** | CSV template downloads + schema reference | |
| 7 | Impersonate a tenant (Tenants → actions → Impersonate, give a reason) | Opens a **read-only** tenant session with a persistent banner; the reason is written to that tenant's Compliance Ledger before the session starts | |
| 8 | Build stamp at the bottom of the Ops sidebar | Reads `A2R Delivery OS v1.2.x`; click → Release Notes modal | |

### UAT-4.6 · Admin & Org Setup (`/admin`)

Sign in as `admin@a2rventures-demo.test`.

| # | Check | Expected | ✅/❌ |
| --- | --- | --- | --- |
| 1 | **Sub-nav pills** | `Roster 7` · `Governance` · `Data & Compliance` — instant swap, one panel at a time | |
| 2 | **Roster** tab | Functional Practices, Roles & Rate Card Matrix, Resource Directory — add/remove works, toasts confirm | |
| 3 | Roster → a rate-card **Cost Rate** column as `admin@…` | Shows real `$` figures (ADMIN = full visibility) | |
| 4 | **Governance** tab | Milestone & Margin Thresholds, Hybrid Configuration Model (see UAT-3.3), Delivery Controls & Governance Standards (rename a control label) | |
| 5 | **Data & Compliance** tab | Workspace Backup / Restore, links to Data Ingestion & Templates and the SOC 2 Compliance Ledger (with a **Verified** badge), and the SSO-moved-to-Ops note | |
| 6 | Sign in as `dm@a2rventures-demo.test` (Member) | `/admin` shows **"You have view-only access to org setup."**; forms disabled | |
| 7 | Refresh `/admin` on the Governance tab | Stays on Governance (tab state survives reload via `?v=governance`) | |

---

## 5. Regression sweep (every release)

| # | Check | ✅/❌ |
| --- | --- | --- |
| 1 | `npm test` → all green; `npx tsc --noEmit` → 0 errors | |
| 2 | `npm run test:e2e` → Suites A–J all green | |
| 3 | Sign-in works for one login per role shape (admin / vp / pd / dm / pm / ops) | |
| 4 | ⌘K palette opens on every route incl. `/login` and `/ops` | |
| 5 | Tenant switch (header) fully re-scopes the workspace | |
| 6 | No Next.js error overlay anywhere during the walkthrough | |
| 7 | Compliance Ledger integrity badge = **Verified** in every tenant | |
| 8 | Demo tenant governance left on **Standard Delivery**; no stray identity providers | |

---

## 6. Sign-off

| Role | Name | Date | Result |
| --- | --- | --- | --- |
| QA Lead | | | PASS / FAIL |
| Product Owner | | | PASS / FAIL |
| Eng Lead | | | PASS / FAIL |
