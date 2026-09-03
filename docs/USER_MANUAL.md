# A2R Delivery OS™ — User Manual & Operator's Guide

_Applies to v1.1.0 · Last updated 2026-09-03_

A2R Delivery OS is a Delivery Operating System for professional-services
organizations. This guide covers day-to-day use of the workspace: the
sidebar workflow, the Command Center, the universal command palette, the
executive briefing, and — for A2R staff — the operator console.

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
| **Left sidebar** | Navigation, grouped by the delivery workflow (below). |
| **Top header** | Organization switcher · global search · notifications · support · help · your account. |
| **Main pane** | A single centered column — one focused view at a time, never a wall of panels. |

Everything you can see is scoped to **your** organization and, within it,
to **your role** — a project manager sees their own engagements, a
practice director sees their practice, an admin or VP sees the whole
portfolio.

---

## 2. The sidebar workflow

The sidebar is ordered to follow an engagement from sale to close. Work
top-to-bottom.

### Portfolio

| Item | Use it to… |
| --- | --- |
| **Command Center** (`/command`) | Start your day. Portfolio vitals, a command bar, and the live activity stream on one screen. See §3. |
| **Control Tower** (`/`) | See every engagement in your scope — contract value, health, open RAID, one-click into each module. |
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
| **Admin & Org Setup** (`/admin`) | Practices, roles & rate card, the resource directory, governance thresholds, control labels, workspace backup/restore, and the ingestion template hub. |
| **Compliance Ledger** (`/admin/audit-log`) | The tamper-evident, hash-chained record of every high-consequence governance action, with a live integrity badge. |

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

Two ways to get structured data in without manual entry:

### Self-serve CSV import

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

## 8. Keyboard shortcuts

| Keys | Action |
| --- | --- |
| **⌘K** / **Ctrl+K** | Open (or close) the universal command palette — anywhere. |
| **↑ / ↓** | Move the selection in the palette or the Command Bar. |
| **Enter** | Run the selected command. |
| **Esc** | Clear the input, then close the palette / dismiss a drawer. |

---

## 9. Roles & what you can see

| Role | Financial visibility | Portfolio scope |
| --- | --- | --- |
| **Owner / Admin** | Full — including raw contractor cost rates | Whole organization |
| **VP / Executive** | Blended margins and EAC | Whole organization |
| **Practice Director** | Blended margins and EAC | Their practice |
| **Delivery Manager / Project Manager** | None (cost & margin hidden) | Their own engagements |

Where a figure is hidden, you'll see a small **Restricted to Partners**
indicator rather than the value silently disappearing.

---

## 10. Getting help

- The **?** icon in the header opens contextual, route-aware guidance.
- The **✉ (envelope)** icon opens a support request from anywhere.
- Legal: [Terms of Service](/terms) · [Privacy Policy](/privacy).
