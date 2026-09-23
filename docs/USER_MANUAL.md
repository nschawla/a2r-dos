# PS-DOS™ — User Manual & Operator's Guide

_Applies to v1.29.0 · Last updated 2026-09-23_

PS-DOS is a Delivery Operating System for professional-services
organizations. This guide covers day-to-day use of the workspace: the
sidebar workflow, the Control Tower (including its pinned Command Bar),
the universal command palette, the executive briefing, the enterprise
governance and identity-federation settings in Admin & Org Setup, and —
for A2R staff — the operator console.

If you are setting up a new organization, see
[`ADMIN_ONBOARDING.md`](./ADMIN_ONBOARDING.md) first. For the security and
data-handling posture, see [`SECURITY.md`](./SECURITY.md).

---

## 1. Signing in & getting oriented

Open the app and sign in with your work email and password.

**First sign-in.** If your account was set up for you — an admin
provisioned your organization and sent you a temporary password — the
first time you sign in you land on a **Set your own password** screen and
can't reach the workspace until you do. Pick a password with at least 12
characters, including an upper- and lowercase letter and a number; it
can't be the temporary one. You're then signed out to sign back in with
the new password. (If you created your own organization and chose your
own password at sign-up, this step is skipped.)

**Changing it later.** Any time you're signed in, go to
`/change-password` to set a new one — same rules apply. Changing your
password **signs you out of every other device immediately** (the one you
changed it on stays signed in). If a session ever looks stale — you're
bounced to the sign-in screen mid-task — signing back in resolves it;
nothing is lost.

The workspace has three regions:

| Region | What it is |
| --- | --- |
| **Left sidebar** | Navigation, grouped by the delivery workflow (below). Modules your organization has switched off don't appear here. |
| **Top header** | Organization switcher · global search · notifications · support · help · your account. |
| **Main pane** | A single centered column — one focused view at a time, never a wall of panels. |

Everything you can see is scoped to **your** organization and, within it,
to **your role** — a project manager sees their own engagements, a
practice director sees their practice, an admin or VP sees the whole
portfolio. Where you land right after signing in is decided automatically
by your role (a VP lands on the SteerCo Briefing, a Project Manager on the
Control Tower, and so on) — every module stays reachable from the sidebar
and ⌘K regardless. A tenant Admin (or A2R staff member) can additionally
preview the app as any other role from the **Persona Preview** banner at
the top of the workspace — see "The RBAC Master Matrix" below.

---

## 2. The sidebar workflow

The sidebar is one flat stack (v1.29.0 — no more section headers), ordered
to follow an engagement from sale to close. Work top-to-bottom.

| Item | Use it to… |
| --- | --- |
| **Control Tower** (`/portfolio`) | Your landing page. Every engagement in your scope — contract value, health, open RAID, one-click into each module — plus the Impact-Aware Decision Cards, the pinned Command Bar, and the live activity feed. See §3. It's where every role lands, and `/` (the public site) forwards you here once you're signed in. |
| **Commercial Baseline** (`/commercial-baseline`) | Contractual scope, baseline hours, sold margin, and the agreed rate card. Lock the baseline to freeze it as the plan of record. |
| **Financial Realization** (`/financials`) | Actual cost and forecast against the baseline: EAC, margin drift, contractor exposure, the burn curve. |
| **Schedule & Milestones** (`/schedule`) | Phases, milestone dates, and pace-risk against the planned window. |
| **RAID Cockpit** (`/raid`) | Risks, Assumptions, Issues, Dependencies. Flag an item for **SteerCo escalation** and it surfaces on the executive briefing and in notifications. |
| **Resource & Capacity** (`/capacity`) | Blended billable utilization, the concurrency-overload radar, and a 52-week staffing forecast against role targets and the holiday calendar. |
| **SteerCo Briefing** (`/steerco`) | A lean, print-ready board view of the whole portfolio. See §5. |
| **Executive Hub** (`/reports`) | The full portfolio briefing (macro rollups, utilization, risk distribution) plus per-engagement SteerCo decks and compliance certificates. |
| **Control Audit** (`/audit`) | The delivery-controls checklist and weighted governance score for the engagement. |

Commercial Baseline through Control Audit is the delivery sequence — run
each engagement through those five, roughly in that order. Import data
into any of these in bulk with the module's **Import CSV** action — see
§6. (Methodology Reference (`/methodology`) isn't a top-level sidebar item
— it's contextual to Control Audit, and reachable via ⌘K.)

> **Retired:** the standalone Command Center (`/command`) page is gone —
> the route now redirects to the Control Tower, which is where its two
> live capabilities (the Command Bar and the Decision Cards feed) live
> now. See §3.

### Setup (bottom of the sidebar)

| Item | Use it to… |
| --- | --- |
| **Admin & Org Setup** (`/admin`) | Practices, roles & rate card, the resource directory, governance thresholds, control labels, the **Enterprise Governance** framework, **Single Sign-On & Identity Federation**, workspace backup/restore, and the ingestion template hub. See §8. |
| **Compliance Ledger** (`/admin/audit-log`) | The tamper-evident, hash-chained record of every high-consequence governance action — including governance-template and identity-federation changes — with a live integrity badge. |

---

## 3. The Control Tower (`/portfolio`)

Your single starting point (v1.29.0 — the previously-standalone Command
Center merged in here; `/command` now redirects). A Bento Grid layout, no
long vertical scroll, four tabs:

### Command Bar — pinned above the tabs

Visible no matter which tab is active. Type where you want to go or what
you want to do; the top suggestion runs on **Enter**.

- **A destination** — `raid`, `capacity`, `financials`, or a verb form like
  `go to control tower`.
- **A module for an engagement** — `financials for Contoso`,
  `audit on Northwind` → opens that module for the matched engagement.
- **An engagement by name** — start typing and pick it from the list.
- **An action** — `search` (opens the ⌘K palette), `sign out`.

Keys: **↑ / ↓** move the selection, **Enter** runs it, **Esc** clears the
box then closes suggestions.

> **Signing out.** The user menu (top-right) has two options: **Sign out**
> ends the session on this device only, and **Sign out of all sessions**
> ends every session on every device — use it if you think a device was
> lost or a session was left open somewhere. Changing your password does
> this automatically.

### Overview tab

The above-the-fold read on the whole portfolio: a 4-up KPI strip
(engagements in scope, total contract value, average baseline margin,
high-risk/Red count), a compact Decision Center summary tile, the Blended
Billable Utilization card linking to Resource & Capacity, any Custom KPIs
your Admin defined, Resources-on-Roster / Practices counts, and — where
applicable — the Program Rollups table for multi-wave engagements.

### Decisions tab

The full **Impact-Aware Decision Cards** feed — one card per Red or
over-budget engagement, each carrying Cause / Impact / Owner & Deadline /
Required Action plus 2–3 real response options (Change Order, Resource
Re-leveling, Margin Absorption, and the like) you can open and, if you
hold the authority, execute. Also lists pending decisions and open
high-severity RAID items in a compact strip beneath the cards. See
`docs/PORTFOLIO_ORCHESTRATION.md` for the full mechanics.

### Engagements tab

The portfolio registry table — every engagement in your scope, health, PM,
commercial model, open RAID count — plus **Register a New Engagement**.

### Activity tab

Recent governance actions in your scope (baseline locks, EAC updates,
RAID escalations, audit score changes, workspace restores), newest first.

---

## 4. The universal Command Palette — ⌘K / Ctrl+K

Press **⌘K** (Mac) or **Ctrl+K** (Windows/Linux) **anywhere in the app** —
including the operator console and the sign-in screen. It's the fastest way
to move without touching the mouse.

The palette searches, in one list:

| Section | Contents |
| --- | --- |
| **Navigate** | Every workspace destination, matched by keyword. |
| **Actions** | Open search, sign out. |
| **Engagements** | Your engagements, by name or client — with a health dot. |
| **People** | The resource directory. |
| **Risks** | Open SteerCo-escalated RAID items. |

Keys: **↑ / ↓** move, **Enter** runs the selected row, **Esc** clears then
closes. The selected destination is pre-loaded, so navigation is instant.

The header's **Search projects, people, RAID…** box and the Command Bar's
`search` action both open this same palette.

---

## 5. The SteerCo Briefing (`/steerco`)

A lean, board-ready view of the **whole portfolio** — built for the
10-minute leadership slot, not a deep-dive.

Sections, in reading order:

1. **Cover** — organization, date, and a one-line summary (active
   engagements · green-health share · red count · control compliance).
2. **Portfolio Pulse** — Book of Business, Delivery Velocity, Margin
   Health, and Risk Flags — the same four-vital strip Platform Pulse uses.
3. **Margin Health** — baseline margin, EAC margin, and drift-vs-plan in
   points. Shows a *restricted* notice instead of figures if your role
   isn't authorized to see financials.
4. **What Moved Since the Last Review** — the significant governance and
   risk events from the stream (routine activity is filtered out).
5. **Watchlist** — the open escalated and critical RAID items, with owner.

Every figure is generated by the same engines the module pages use, so
the briefing can never disagree with what the app shows elsewhere.

### Print / export to PDF

Click **Print / Export PDF** (top right, screen only). The page reflows to
a clean, light, ink-on-white document: the sidebar, header, footer,
buttons, and on-screen chart bars are all removed, sections don't split
across pages, and status colours stay legible. Use your browser's
**Save as PDF** to keep it.

---

## 6. Importing data in bulk

Three ways to get structured data in without manual entry:

### Self-service batch import (weekly BAU uploads)

For a **client-wide weekly batch** — spanning any number of engagements in
one file — rather than a single project's own CSV import (below), use
**Admin & Org Setup → Data Ingestion & Templates → Batch Import**.
Available to organization **Admins**. Four intake pills cover the weekly
BAU data streams:

- **Weekly Actuals** — hours worked by person and project, filed under
  that week's Monday.
- **Milestone & Progress Updates** — phase status and % complete.
- **Forecast & EAC Updates** — revised forecast-to-complete and open
  run-rate hours by rate-card role (matrix-mode projects — a Direct
  Intake project should still use that project's own Financial
  Realization import).
- **Status Reports & RAID Log** — a weekly narrative highlight, a new
  RAID item, or both, per project.

1. Choose one of the four pills, then drag a `.csv` or `.xlsx` file onto
   the drop zone (or download a starter template from the **Templates**
   tab first).
2. Every row is validated the moment the file is read — you'll see a live
   count of how many rows are valid and how many will be **quarantined**,
   with the exact reason for each (an unmapped project code, an
   unrecognized date, a missing required field, and so on — always in
   plain English, never a raw error code).
3. Click **Stage N rows**. This is not yet a commit — it saves the whole
   file, valid and invalid rows alike, so nothing is lost and nothing
   needs re-uploading to fix a handful of bad rows.
4. On the batch's own page, correct a quarantined row directly in its
   cells and click **Save & re-validate** — it re-checks against your live
   roster and projects right there, no re-upload required.
5. **Re-validate & Commit** stays disabled for as long as *any* row in the
   batch still has an error. This is a hard stop: PS-DOS will
   never write part of a batch to your workspace while the rest is broken.
   Once every row is clean, committing writes them all in one step and
   records the batch in your Compliance Ledger.
6. A batch you're not ready to fix can be **discarded** at any time before
   it's committed — nothing it contains has touched your live data yet.

### Self-serve CSV import (single project)

1. Download a template from **Admin & Org Setup → Data Ingestion &
   Templates**, or from **Ops Console → Ingestion & Templates**:
   - **Resource Allocations** — the roster (employee id, name, email, role,
     department, weekly capacity, cost & bill rates).
   - **Project Financial Baselines** — engagements (code, name, client,
     contract type, budget, dates, status).
   - **Aggregated Period Actuals & Hours** — approved hours by person /
     project / task / period, exported from your PSA.
2. Fill it in (keep the header row, use `YYYY-MM-DD` dates, leave a cell
   blank for "no value").
3. In the relevant module, use **Import CSV**. Every import is **previewed
   row-by-row before it commits** — invalid rows are flagged and skipped.

Re-importing is safe: rows are matched on their key column and updated in
place, never duplicated.

### Automated feed (the API bridge)

For recurring PSA / ERP feeds, ask your A2R contact to issue your
organization a scoped **API key**; your systems then post to the ingestion
API on a schedule. Each ingest appears automatically in your Active Stream.

---

## 7. For A2R operators — the internal console (`/ops`)

Visible only to A2R Ventures staff accounts holding an explicit access grant
(there is no "any @a2rventures.com email is staff" shortcut). It's a separate
shell with no tenant context.

| Page | Use it to… |
| --- | --- |
| **Telemetry** (`/ops/telemetry`) | High-level health across every tenant — totals, red engagements, at-risk RAID, per-tenant breakdown. |
| **Platform Pulse** (`/ops/pulse`) | The engineering health of PS-DOS *itself* — see below. |
| **Tenants** (`/ops/tenants`) | Provision a new client organization (the new admin gets a one-time password shown to you once — they're forced to set their own on first sign-in); suspend / reactivate / move to grace period; **impersonate** (read-only, time-boxed, audited); export a tenant's data; execute the Purge Protocol; manage a tenant's API keys. |
| **Staff Access** (`/ops/staff`) | Grant / revoke operator access (attributed, revocable — you can't revoke your own), and the **Just-In-Time elevations** audit trail. |
| **Ingestion & Templates** (`/ops/ingestion`) | The intake templates and schema reference to hand a new tenant admin during onboarding. |
| **Developer Docs** (`/ops/dev-docs`) | The in-app engineering reference — build stamp, release history, architecture map, setup steps, and the environment/credentials reference. |

### Just-In-Time elevation

Your access grant lets you **read** every page above. Every action that
*changes* something — provisioning, suspension, impersonation, data export,
the Purge Protocol, API keys, identity-federation changes, granting or
revoking staff — needs a **temporary elevation** first.

- The bar at the top of every `/ops` page shows your status. Amber
  "read-only" → click **Elevate**, type a reason (this goes on the audit
  trail), **re-enter your account password** (step-up — required every time,
  even mid-session), pick a window (15 / 30 / 60 minutes), and submit.
- The bar turns green with a live countdown. Run what you came to run.
- It **auto-expires** — there's no standing elevated session. Click **Drop
  elevation** when you're done, or just let it lapse.
- If you try a privileged action without elevating, the elevation prompt
  opens automatically; nothing is changed.
- Every elevation — who, why, how long — is listed on **Staff Access**.
- **Changing your password or signing out of all sessions ends every
  elevation immediately** (the elevation is pinned to your session). So does
  a platform deploy. Re-elevate once after any of these.
- Operators who sign in only through SSO must set a console password
  (Account → change password) before they can elevate.

### If database-level RLS misbehaves (v1.13.0)

There is **no operator toggle** for database-level Row-Level Security. If a
policy regression causes cross-tenant errors in production, the rollback is a
platform action, not a console action: unset the `RLS_ENFORCE` environment
variable on the hosting platform and redeploy (~2 minutes). The application
reverts to application-tier tenant scoping — the same posture it had before
RLS was switched on — with no data change. See
`docs/RLS_ENFORCEMENT_RUNBOOK.md`.

### Platform Pulse (`/ops/pulse`)

Automatically ingested — no manual entry:

- **Running Build** — the version and commit currently serving.
- **Database** — a live `SELECT 1` probe with latency; a poller in the
  header re-checks `/api/health/ready` every 15 seconds.
- **Test Suite** — the result of the last `npm test` run, read from the
  build stamp.
- **Last Build** — build time and the latest release.

Below the vitals, an **Engineering Stream** lists recent commits (local
development only), the last test run, releases, and database probes.

The build stamp (`PS-DOS vX.Y.Z`) sits at the bottom of the
operator sidebar on every page — click it to open the **Release Notes**.

---

## 8. Admin & Org Setup — governance, masking & identity

These panels live on **Admin & Org Setup** (`/admin`) and are editable by
organization **Owners and Admins**. Every change is written to the
Compliance Ledger.

### 8.1 Enterprise Governance — compliance templates

Governance is a **two-layer** model.

**Layer 1 — pick a compliance template.** Each is a pre-tested bundle of
settings:

| Template | What it does |
| --- | --- |
| **Standard Delivery** | Everything on; standard role-based financial visibility. The default. |
| **Strict Financial Governance** | Margins, EAC and cost variance are locked to Partners and executives — scrubbed for every delivery lead. Full audit and reporting surface stays on. |
| **Agile Delivery** | Hides the Commercial Baseline and the Executive Hub, and scrubs financials for delivery roles. Teams see flow, health and risk. |
| **Board-Only** | A lean executive read-out — SteerCo briefing, portfolio, reporting and control audit only; day-to-day working modules hidden. |

Selecting a template applies its settings immediately. The panel shows the
**active** template; once you change anything by hand it reads **Custom
configuration**.

**Layer 2 — tune it.**

- **Route visibility.** Toggle any non-core module between **Visible** and
  **Hidden**. Hidden modules disappear from every user's sidebar and ⌘K.
  Control Tower, Admin & Org Setup and the Compliance Ledger are core and
  can't be switched off.
- **Sensitive financial data.** Turn on **"Scrub margins & EAC for delivery
  roles"** to mask blended margin, EAC and cost variance for **Practice
  Director and below**, on top of the standard role-based masking (§10).
  VP / Executive and Partners are unaffected.

Click **Save configuration** to persist Layer-2 changes (template
selections save on click).

### 8.2 Single Sign-On & Identity Federation

Federate the workspace with your identity provider. One IdP per
organization.

**1 — Configure the connection.**

| Field | Notes |
| --- | --- |
| **Identity provider** | Microsoft Entra ID (Azure AD), Okta, Google Workspace, or a generic SAML 2.0 / OIDC provider. |
| **Protocol** | OpenID Connect (OIDC) or SAML 2.0. |
| **Connection name** | A label for your reference, e.g. "Contoso Entra ID". |
| **Email domains** | Comma-separated bare domains this IdP is authoritative for, e.g. `contoso.com`. |
| **OIDC** | Discovery URL (`…/.well-known/openid-configuration`), Client ID, Client Secret. The secret is encrypted at rest — leave it blank on a later edit to keep the stored value. |
| **SAML** | Paste the IdP's metadata XML (the `EntityDescriptor`). |

**2 — Verify the metadata.** Click **Verify IdP metadata**. For OIDC the
discovery document is fetched and its endpoints checked; for SAML the
entity ID, SSO URL and signing certificate are extracted. On success the
panel shows the resolved values, a fingerprint, and the verification time.
Federation can't be enabled until verification succeeds.

**3 — Map security groups to roles.** Add a row per IdP group / role claim:
the **group name or id**, the **delivery role** and **console role** to
grant, an optional **practice**, and a **priority** (lowest wins when a
login is in several mapped groups). A login in no mapped group gets the
**default delivery role** you set in the connection.

**4 — Just-in-time provisioning.** With JIT **enabled**, a federated login
with no membership yet is provisioned one automatically, at the mapped
role; an SSO-provisioned member whose group assignment changed is
re-synced on their next login. A role you set **by hand** on a member is
never overwritten by JIT. With JIT **disabled**, only people who already
have a membership can sign in through SSO.

**5 — Enable, then optionally enforce.**

- **Enable federation** turns the connection on (requires a successful
  verification).
- **Enforce SSO** additionally **blocks password sign-in** for your email
  domains — those users must come through the identity provider. Requires
  federation enabled and at least one email domain.

**6 — Give your IdP admin the PS-DOS side of the trust (SAML).** Once a
SAML connection is created, the panel shows three values to hand to
whoever administers your identity provider — the **SP Entity ID**, the
**ACS URL**, and the **SP metadata URL**, each one click to copy. Most
SAML setup wizards (Entra ID's Enterprise Application, Okta's SAML app)
ask for exactly these.

**7 — Signing in (SAML, live as of v1.19.0).** Once enabled, anyone at a
federated email domain sees a **Continue with single sign-on** button on
the sign-in page after typing their email — it redirects to your identity
provider, and returns them signed in with no password prompt. If a
sign-in fails, the page shows a specific reason (an expired attempt, a
sign-in link already used, a configuration mismatch) rather than a generic
error, and every failure is also logged — in the same plain language — to
your **Recent federated sign-in failures** list in the Ops Console panel,
for your platform contact to troubleshoot.

> OIDC's browser redirect and token exchange are the remaining follow-on;
> OIDC connections still complete configuration, verification, mapping,
> JIT, and password-lockout enforcement, same as SAML.

### 8.3 Custom KPIs — build your own metric cards

**Admin & Org Setup → Custom KPIs** (`/admin/kpis`) lets an Admin define
metric cards that render automatically on the **Portfolio Control Tower**
and the **Executive Hub**, for whichever roles they're assigned to.

A custom KPI is a binding, not a formula you write: pick a **data
source** — Financial Realization, Schedule & Milestones, RAID Cockpit, or
Resource & Capacity — then a **metric** from that source's short, real
list (e.g. Blended Baseline Margin, On-Track Phase %, Open Critical RAID
Items, Blended Billable Utilization). Set a **target** and a **warning**
value, choose whether **higher or lower is better**, and assign the
personas who should see the card. Save it, and the card appears
immediately wherever it's bound — no redeploy, no waiting.

Every card shows the live value, a status dot (on track / at risk /
critical, or "No data" when the tenant has nothing to compute it from
yet), and which metric it's reading. Edit or delete a KPI any time from
the same screen — every viewer's dashboard picks up the change on their
next visit.

---

## 9. Keyboard shortcuts

| Keys | Action |
| --- | --- |
| **⌘K** / **Ctrl+K** | Open (or close) the universal command palette — anywhere. |
| **↑ / ↓** | Move the selection in the palette or the Command Bar. |
| **Enter** | Run the selected command. |
| **Esc** | Clear the input, then close the palette / dismiss a drawer. |

---

## 10. Roles & what you can see

| Role | Financial visibility | Portfolio scope |
| --- | --- | --- |
| **Owner / Admin** | Full — including raw contractor cost rates | Whole organization |
| **VP / Executive** | Blended margins and EAC | Whole organization |
| **Practice Director** | Blended margins and EAC | Their practice |
| **Delivery Manager / Project Manager** | None (cost & margin hidden) | Their own engagements |

Where a figure is hidden, you'll see a small **Restricted to Partners**
indicator rather than the value silently disappearing.

Your organization can tighten this further — the **Strict Financial
Governance** and **Agile Delivery** governance templates (§8.1) also hide
margins and EAC from Practice Directors.

### The RBAC Master Matrix — what's omitted, not just hidden

Underneath the table above, a central permission matrix maps every role to
the sidebar groups, per-engagement module pills, and routes it may reach.
An unauthorized item is never rendered at all — there's no disabled button
or greyed-out link to notice and wonder about — and the same matrix backs a
server-side route guard, so a direct link to a page outside your role never
gets further than a redirect. A tenant Admin (or an A2R staff member) sees
a **Persona Preview** banner at the top of the workspace and can pick any
role to see the app exactly as that role would — sidebar, tab pills, and
write controls (like Lock Baseline) all strip down to match. It's clearly
labeled and unmissable while active (a solid warning-colored bar with an
"Exit preview" button) so it's never mistaken for real access, and it's
display-only — it can never show data your own account isn't actually
permitted to see. Every other role signs in and stays locked to its own
real view; no switcher is shown at all.

### Role-Based Scoped Filtering — where "Their practice" is actually enforced

The "Portfolio scope" column above isn't just a display convention — the
same rule filters the underlying data on every surface that lists more
than one engagement or roster entry:

- **Portfolio Control Tower** (`/portfolio`) — your stat cards, project list, and
  program rollups already reflect only the engagements in your scope.
- **Resource & Capacity Cockpit** (`/capacity`) — a Practice Director or
  Delivery Manager sees their own practice's/team's roster and staffing
  only; the page says so explicitly ("Scoped to your practice — *N*
  resources" vs. "Tenant-wide — every practice" for VP/Admin).
- **Financial Realization, RAID Cockpit, Commercial Baseline, Control
  Audit, Schedule & Milestones** — each module's "choose an engagement"
  list only ever offers engagements you're in scope for; there's nothing
  to browse into read-only outside it.

A Practice Director's scope is their `practiceId` — either the practice
they're formally the Director of, or any project whose home practice
matches their own. A Delivery Manager's scope is their own projects plus
their direct reports' projects. A Project Manager's scope is their own
assignments. VP/Executive and Admin remain tenant-wide, as the table
above shows.

---

## 11. Getting help

- The **?** icon in the header opens contextual, route-aware guidance.
- The **✉ (envelope)** icon opens a support request from anywhere.
- Legal: [Terms of Service](/terms) · [Privacy Policy](/privacy).
