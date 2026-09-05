# A2R Delivery OS™ — User Manual & Operator's Guide

_Applies to v1.5.0 · Last updated 2026-09-05_

A2R Delivery OS is a Delivery Operating System for professional-services
organizations. This guide covers day-to-day use of the workspace: the
sidebar workflow, the Command Center, the universal command palette, the
executive briefing, the enterprise governance and identity-federation
settings in Admin & Org Setup, and — for A2R staff — the operator console.

If you are setting up a new organization, see
[`ADMIN_ONBOARDING.md`](./ADMIN_ONBOARDING.md) first. For the security and
data-handling posture, see [`SECURITY.md`](./SECURITY.md).

---

## 1. Signing in & getting oriented

Open the app and sign in with your work email. Your organization admin
issues you a one-time password to change on first sign-in.

The workspace has three regions:

| Region | What it is |
| --- | --- |
| **Left sidebar** | Navigation, grouped by the delivery workflow (below). Modules your organization has switched off don't appear here. |
| **Top header** | Organization switcher · **perspective switcher** · global search · notifications · support · help · your account. |
| **Main pane** | A single centered column — one focused view at a time, never a wall of panels. |

Everything you can see is scoped to **your** organization and, within it,
to **your role** — a project manager sees their own engagements, a
practice director sees their practice, an admin or VP sees the whole
portfolio.

### Your perspective

If you wear more than one hat, the **Perspective** pill in the header
(labelled with your current lens) lets you flip your default landing view:

| Perspective | Lands you on | Best for |
| --- | --- | --- |
| **Executive / SteerCo** | the SteerCo Briefing | board prep, leadership syncs |
| **Delivery Lead** | the Control Tower | running engagements day to day |
| **Finance Controller** | the Executive Hub | margin, EAC and utilization rollups |
| **Operations** | the Command Center | the live vitals + activity stream |

Only the perspectives your role can use are shown, and switching is purely
a convenience — every module stays reachable from the sidebar and ⌘K
whichever lens is active. Your choice is remembered for next time.

---

## 2. The sidebar workflow

The sidebar is ordered to follow an engagement from sale to close. Work
top-to-bottom.

### Portfolio

| Item | Use it to… |
| --- | --- |
| **Command Center** (`/command`) | Start your day. Portfolio vitals, a command bar, and the live activity stream on one screen. See §3. |
| **Control Tower** (`/portfolio`) | See every engagement in your scope — contract value, health, open RAID, one-click into each module. It's where a Delivery-lens sign-in lands, and `/` (the public site) forwards you here once you're signed in. |
| **Resource & Capacity** (`/capacity`) | Blended billable utilization, the concurrency-overload radar, and a 52-week staffing forecast against role targets and the holiday calendar. |

### Engagement Governance — the delivery sequence

Run each engagement through these five, in order:

1. **Commercial Baseline** (`/commercial-baseline`) — contractual scope,
   baseline hours, sold margin, and the agreed rate card. Lock the
   baseline to freeze it as the plan of record.
2. **Financial Realization** (`/financials`) — actual cost and forecast
   against the baseline: EAC, margin drift, contractor exposure, the burn
   curve.
3. **Schedule & Milestones** (`/schedule`) — phases, milestone dates, and
   pace-risk against the planned window.
4. **RAID Cockpit** (`/raid`) — Risks, Assumptions, Issues, Dependencies.
   Flag an item for **SteerCo escalation** and it surfaces on the
   executive briefing and in notifications.
5. **Control Audit** (`/audit`) — the delivery-controls checklist and
   weighted governance score for the engagement.

Import data into any of these in bulk with the module's **Import CSV**
action — see §6.

### Reporting

| Item | Use it to… |
| --- | --- |
| **SteerCo Briefing** (`/steerco`) | A lean, print-ready board view of the whole portfolio. See §5. |
| **Executive Hub** (`/reports`) | The full portfolio briefing (macro rollups, utilization, risk distribution) plus per-engagement SteerCo decks and compliance certificates. |
| **Methodology Reference** (`/methodology`) | The delivery standard and per-control guidance. |

### Setup (bottom of the sidebar)

| Item | Use it to… |
| --- | --- |
| **Admin & Org Setup** (`/admin`) | Practices, roles & rate card, the resource directory, governance thresholds, control labels, the **Enterprise Governance** framework, **Single Sign-On & Identity Federation**, workspace backup/restore, and the ingestion template hub. See §8. |
| **Compliance Ledger** (`/admin/audit-log`) | The tamper-evident, hash-chained record of every high-consequence governance action — including governance-template and identity-federation changes — with a live integrity badge. |

---

## 3. The Command Center (`/command`)

Your single-pane starting point. Top to bottom:

### Pulse strip — venture vitals

Four figures, refreshed on every load:

| Vital | Meaning |
| --- | --- |
| **Book of Business** | Total portfolio contract value and the count of active engagements. |
| **Delivery Velocity** | Blended billable utilization, and how it tracks against the target (attainment). |
| **Margin Health** | Blended EAC margin across the portfolio. Shows `••••` if your role isn't authorized to see financials. |
| **Risk Flags** | Red-health engagements plus open SteerCo-escalated RAID items. Green when zero. |

### Command Bar — the execution header

Directly beneath the Pulse strip. Type where you want to go or what you
want to do; the top suggestion runs on **Enter**.

- **A destination** — `raid`, `capacity`, `financials`, or a verb form like
  `go to control tower`.
- **A module for an engagement** — `financials for Contoso`,
  `audit on Northwind` → opens that module for the matched engagement.
- **An engagement by name** — start typing and pick it from the list.
- **An action** — `search` (opens the ⌘K palette), `sign out`.

Keys: **↑ / ↓** move the selection, **Enter** runs it, **Esc** clears the
box then closes suggestions.

### Active Stream — live operational & governance state

One chronological feed that replaces scattered activity boards. It merges:

- **Activity** — who did what (assignments, edits, imports).
- **Governance** — baseline locks, EAC updates, RAID escalations, audit
  score changes, workspace restores.
- **Risk** — currently open, SteerCo-escalated RAID items.

A coloured dot signals tone (neutral / good / warning / critical); the
right-hand column shows how long ago it happened.

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
2. **Portfolio Pulse** — the same four vitals as the Command Center.
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
   batch still has an error. This is a hard stop: A2R Delivery OS will
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

Visible only to A2R Ventures staff accounts. It's a separate shell with no
tenant context.

| Page | Use it to… |
| --- | --- |
| **Telemetry** (`/ops/telemetry`) | High-level health across every tenant — totals, red engagements, at-risk RAID, per-tenant breakdown. |
| **Platform Pulse** (`/ops/pulse`) | The engineering health of A2R Delivery OS *itself* — see below. |
| **Tenants** (`/ops/tenants`) | Provision a new client organization; suspend / reactivate / move to grace period; **impersonate** (read-only, time-boxed, audited); export a tenant's data; execute the Purge Protocol; manage a tenant's API keys. |
| **Ingestion & Templates** (`/ops/ingestion`) | The intake templates and schema reference to hand a new tenant admin during onboarding. |

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

The build stamp (`A2R Delivery OS vX.Y.Z`) sits at the bottom of the
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

> The browser redirect to your IdP and assertion validation are part of a
> later release; this version lands the full configuration, verification,
> mapping and JIT engine plus enforcement of password-login lockout.

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
gets further than a redirect. A2R staff can preview how a role's navigation
looks from the **Ops Console** (a "Persona Preview" — display-only, and
never a way to see data your own account isn't actually permitted to see).

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
