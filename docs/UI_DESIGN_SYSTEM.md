# UI Architecture — No-Scroll / Command Center Standard — PS-DOS™

_Introduced v1.19.0 (follow-up). An executive-grade density standard for
every dashboard, portfolio view, and drill-down page — inspired by
high-density SaaS patterns (PowerPlan-style unitization views): critical
information sits above the fold, tables never force sideways scrolling as
the default experience, and a viewer is never forced back to the global
sidebar just to move between data that belongs to the same context._

---

## 1. The four mantras, and how each is enforced in code

### 1.1 Zero horizontal overflow

**The `<DataTable>` primitive** (`src/components/ui/data-table.tsx`) is the
mechanism: every column is either **core** (always rendered — the table
can't do its job without it) or **optional** (toggleable via a "Customize
Display" control, persisted per-table in `localStorage`). A table's core
column set is chosen to comfortably fit a standard viewport on its own;
optional columns are an opt-in a viewer reaches for, never a surprise the
page ambushes them with. `overflow-x-auto` still wraps the table as a
fallback for a very narrow viewport or a viewer who has switched on every
optional column — a safety net, not the load-bearing mechanism.

**Not every wide table is a `<DataTable>` candidate — three real
exceptions, identified while rolling this out:**

- **Genuinely wide timeline/matrix data** (the Capacity Cockpit's 52-week
  forecast, a Gantt-style schedule) has no "optional column" to hide — the
  whole point is seeing the full timeline at once. `overflow-x-auto` (with
  a sticky first column) is the *correct*, deliberate pattern here, the
  same way a spreadsheet or Gantt tool would render it — not a gap to fix.
- **Dense, per-row-stateful editing grids** (`ScheduleTracker.tsx`'s phase
  table: four date pickers, a slider, a status select, Save/Discard, all
  per row) don't have a natural core/optional split either — every column
  is something the editor needs simultaneously to do their job. These get
  tightened column widths and padding instead of a customize-display menu.
- **KPI-dense analytical tables** where every column is an essential
  figure for the analysis (the Capacity Cockpit's Practice Breakdown and
  Per-Resource Utilization tables — Heads / Available / Billable / Target
  / Actual / Attainment are all load-bearing at once) similarly don't
  benefit from hiding columns — but their content is short (numbers, not
  long free text), so they fit a standard viewport without customization
  being necessary in the first place.

### 1.2 Viewport discipline — critical KPIs above the fold

The Command Center (`/command`) is the reference implementation: one
column, `h1` → `PulseStrip` (four vitals) → `CommandBar` → `ActiveStream`
(a feed, which is *expected* to run below the fold and require scrolling —
a feed is not a KPI). The Control Tower (`/portfolio`) puts its four
top-line `StatCard`s immediately under the page heading, before the
tabbed detail panels.

### 1.3 Contextual in-page navigation, never a dead end

**`ProjectHeader.tsx`** (mounted at the top of every per-project module
route — Commercial Baseline / Financials / Schedule / RAID / Control
Audit) now carries a **"← Back to Portfolio"** link above the project
title — a prominent, in-page way back, never a reliance on the browser's
own Back button. This one change reaches all five module routes at once,
since they all share this header component.

### 1.4 In-context hubs — no sidebar ping-pong

This was already substantially built before this pass: `ProjectHeader`'s
`ModuleNav` pill bar lets a viewer jump between a project's five module
workspaces (Baseline / Financials / Schedule / RAID / Audit) without
touching the global sidebar, and `<ModuleTabs>` (`src/components/ui/
module-tabs.tsx`) gives instant, client-only tab switching within a single
page for views like the Control Tower's Portfolio / Engagements / Activity
panels and the Capacity Cockpit's four-tab layout.

One architectural note for anyone extending this: the app's module pages
are deliberately **separate routes** per module (`/raid/[id]`,
`/schedule/[id]`, …), not one `/projects/[id]` page with five `<ModuleTabs>`
panels — a prior, locked-in decision (see `ProjectHeader.tsx`'s own doc
comment). `ModuleNav` gives the *feel* of an in-context hub (the header
persists, no sidebar detour) without a real-page-navigation cost each
click is still a fast, targeted Server Component render of just that
module. Consolidating this into true single-page tab panels would be a
much larger, separately-scoped rework (URL/bookmark structure, five
modules' independent data-loading, every e2e test that navigates by URL)
and was deliberately out of scope for this pass.

### 1.5 Visual breathing room

`<DataTable>` uses `py-3` row padding (up from the `py-2`–`py-2.5` most
hand-rolled tables used before it) — comfortable without being loose.
`.card` (`src/app/globals.css`) already carries generous padding
(`p-6`) and a soft shadow; `<Container>` already gives every page generous
responsive gutters. Neither needed to change.

### 1.6 Universal pill/tab navigation for multi-section pages

_A further v1.19.0 follow-up._ Any page built from several distinct, substantial
thematic blocks — the kind a viewer wants to jump between rather than
scroll past — gets `<ModuleTabs>` (§1.4) instead of stacking every section
top to bottom. The Executive Briefing Hub's own briefing document
(`ExecutiveBriefing.tsx`: Summary / Resources / Financials / Risks) and the
SteerCo Briefing (`SteerCoBriefingView.tsx`: Pulse / Margin Health / What
Moved / Watchlist) are the reference implementations — both are print
documents, which is exactly why `<ModuleTabs>` gained a `printAll` prop:
every panel still prints one after another regardless of which pill is
active on screen, so the on-screen pills never cost the PDF anything. The
Capacity Cockpit's four tabs were migrated from a bespoke underline-style
tab bar to the same `<ModuleTabs>` pill component for visual consistency —
one tab pattern app-wide, not two.

**Not every multi-`<section>` page qualifies.** A short reference drawer
whose sections are a few lines each (`ControlGuidance.tsx`'s Objective /
Guidance / Evidence fields) reads faster scrolled than clicked through — a
pill bar there would add clicks, not remove scrolling. A linear
step-by-step flow (`OperatorMfaPanel.tsx`'s enrollment wizard, where step 2
doesn't exist until step 1 completes) must stay linear; tabs imply the
sections are independently reachable in any order, which a wizard's steps
are not. Apply this pattern to substantial, independently-meaningful,
simultaneously-relevant blocks — not to every `<section>` tag in the
codebase.

---

## 2. `<DataTable>` — the primitive, and the one rule that matters

```tsx
// Columns are METADATA ONLY — header text, alignment, optional/hidden-by-
// default. NEVER a render function.
const columns: DataTableColumn[] = [
  { key: 'name', header: 'Project', className: 'font-semibold max-w-[26ch]' },
  { key: 'client', header: 'Client', optional: true, className: 'text-ink-muted max-w-[18ch]' },
  { key: 'action', header: '' },
];

// Rows carry PRE-RENDERED cells — build these in the calling Server
// Component, not inside <DataTable> itself.
const rows: DataTableRow[] = projects.map((p) => ({
  key: p.id,
  cellTitles: { client: p.client },              // tooltip text, for a cell whose content isn't itself the full text
  cells: {
    name: <TruncatedCell>{p.name}</TruncatedCell>,
    client: <TruncatedCell>{p.client ?? '—'}</TruncatedCell>,
    action: <Link href={`/commercial-baseline/${p.id}`}>Open →</Link>,
  },
}));

<DataTable storageKey="portfolio-active-projects" columns={columns} rows={rows} />
```

**Why no render function on a column:** `<DataTable>` is a Client
Component (`'use client'` — it needs `useState`/`localStorage` for column
customization), and its caller is almost always a Server Component page. A
function is not serializable across the Server→Client props boundary —
Next.js throws a generic, unhelpful runtime error ("Something went wrong")
the moment one crosses it, with no useful message pointing at the actual
cause. This is exactly the bug this rollout caught on its first real page
(the Portfolio Control Tower, `/portfolio`) — an early draft of this
component took `render: (row) => ReactNode` per column, which broke sign-in
itself (the Control Tower is the post-login landing page) until the design
above replaced it: columns are pure metadata, rows carry the already-
rendered `ReactNode` values, which — unlike a raw function — Server
Components ARE allowed to pass down as props. Caught by the end-to-end
suite before shipping, not by a user.

---

## 3. Rollout status

| Surface | Status |
| --- | --- |
| Portfolio Control Tower — Active Projects table | **Done** — `<DataTable>`, 4 optional columns (Client/PM/Model/Methodology) |
| `ProjectHeader` — Back to Portfolio | **Done** — reaches Commercial Baseline, Financials, Schedule, RAID, Control Audit at once |
| Command Center — above-the-fold discipline | **Already conformant**, verified, no change needed |
| RAID Cockpit, Control Audit checklist | **Not applicable** — already card/list layouts (`RaidBoard.tsx`, `AuditChecklist.tsx`), not tables; no horizontal-scroll risk to begin with |
| Schedule & Milestones phase table (`ScheduleTracker.tsx`) | **Done** — a dense editing grid (§1.1's second exception): sticky "Phase" column, tightened input widths/padding, Pace Risk's elapsed-% moved to a `title` tooltip |
| Financial Realization — EAC table (`EacEditor.tsx`) | **Done** — same dense-grid treatment: sticky "Role" column, tightened input widths |
| Commercial Baseline — Phase × Role sizing matrix (`DealEditor.tsx`) | **Done** — genuinely wide matrix (§1.1's first exception): sticky "Phase" column + "Role Total" footer, tightened input widths |
| Capacity Cockpit — Practice Breakdown / Per-Resource Utilization | **Queued** — KPI-dense, no natural optional column (see §1.1's third exception); likely fine as-is on a standard viewport given short numeric content, worth a visual pass |
| Capacity Cockpit — 52-week forecast matrix | **Not applicable** — genuinely wide timeline data; `overflow-x-auto` + sticky first column is the correct pattern, not a gap |
| Reports Hub — Executive Briefing (`ExecutiveBriefing.tsx`) | **Done** — Health Lens / Practice Utilization tables left as-is (KPI-dense, matches the third exception); Critical Risk Register's Item/Engagement cells now truncate with a `title` tooltip (print document — no interactive "Customize Display" control; see §2's print-CSS note) |
| Ops Console — Tenants (`ops/tenants/page.tsx`) | **Done** — `<DataTable>`, optional columns (Tier/Active Users/Engagements/Created) |
| Ops Console — Billing (`ops/billing/page.tsx`) | **Done** — `<DataTable>`, optional columns (Tier/Seats/Since) |
| Ops Console — Platform Telemetry (`ops/telemetry/page.tsx`) | **Done** — `<DataTable>`, optional columns (Tier/Users/Engagements) |
| Ops Console — Operator capability matrix (`OperatorAccessManager.tsx`) | **Not applicable** — genuine Capability × Role matrix (§1.1's first exception); sticky "Capability" column is correct |
| Ops Console — Staff Access elevations, Audit & Compliance grants/elevations (`ops/staff`, `ops/audit`) | **Not applicable** — short, essential-column audit-trail logs (§1.1's third exception); already narrow, Reason already truncated |
| Ops Console — Connection Health Matrix (`ConnectionHealthMatrix.tsx`) | **Done** — dense per-row-actionable monitoring grid with an expandable detail row (not yet a `<DataTable>`-supported shape): sticky "Tenant" column, tightened padding |
| Ops Console — Staff Access grant list (`StaffAccessManager.tsx`) | **Done** — Reason column now truncates with a `title` tooltip; already narrow otherwise |
| Ops Console — Identity Federation group mappings (`IdentityFederationPanel.tsx`), tenant API keys modal (`TenantActionsMenu.tsx`) | **Not applicable** — short, already-tight tables (the API-keys table also lives inside a fixed-width modal, not a page-level surface) |
| Ops Console — Developer Documentation reference tables (`DevDocs.tsx`) | **Not applicable** — an internal engineering wiki, not a command center/portfolio/dashboard; every column holds prose reference content with no optional subset, so `overflow-x-auto` + `min-w` is deliberate |

Extend this table as further surfaces are converted or explicitly ruled
out, the same way this section documents the first pass's decisions.

### 3.1 Pill/tab navigation rollout (§1.6)

| Surface | Status |
| --- | --- |
| Executive Briefing (`ExecutiveBriefing.tsx`) | **Done** — Summary / Resources / Financials / Risks pills; `printAll` keeps the printed PDF a one-section-after-another board deck |
| SteerCo Briefing (`SteerCoBriefingView.tsx`) | **Done** — Pulse / Margin Health / What Moved / Watchlist pills; same `printAll` treatment |
| Capacity Cockpit (`CapacityCockpit.tsx`) | **Done** — migrated from a bespoke underline-style tab bar to `<ModuleTabs>` for one pill pattern app-wide (functionally unchanged: still instant client-side switching, now also gets `?v=` deep-linking for free) |
| Admin & Org Setup (`admin/page.tsx`) | **Already conformant** — Roster / Governance / Data & Compliance pills predate this pass |
| Portfolio Control Tower, Reports Hub outer shell, Reports Hub batch-detail page | **Already conformant** — existing `<ModuleTabs>` usage |
| `ControlGuidance.tsx` (audit drawer) | **Not applicable** — a handful of short reference fields (Objective/Guidance/Evidence), faster scrolled than clicked through (§1.6) |
| `OperatorMfaPanel.tsx` (2FA enrollment) | **Not applicable** — a linear step-by-step wizard; its steps aren't independently reachable, so tabs would misrepresent the flow (§1.6) |
| Ops Console single-table pages (`ops/staff`, `ops/billing`, `ops/telemetry`, `ops/audit`, `ops/tenants`) | **Not applicable** — one primary surface each, nothing to switch between |

---

## 4. Severity/priority badge standard — Critical / High / Medium / Low

**`src/lib/ui/severity.ts`** is the single source of truth: `SEVERITY_CLASS`
maps the `RaidSeverity` enum (`CRITICAL`/`HIGH`/`MED`/`LOW` — the Prisma
wire values; `SEVERITY_LABEL` spells `MED` out as "Medium") to four
**distinct, never-doubled-up** tones —

| Severity | Tone | Tailwind classes |
| --- | --- | --- |
| Critical | bold red | `bg-critical-soft text-critical` |
| High | warm amber/orange | `bg-warning-soft text-warning` |
| Medium | muted gold/yellow | `bg-medium-soft text-medium` |
| Low | neutral grey | `bg-na-soft text-na` |

`medium` (`tailwind.config.ts`) is a new token — deliberately **not** blue,
since `brand` is already the app's one reserved interactive-blue and
several sidebar zone accents (indigo/teal/violet) are already spoken for;
a muted gold reads clearly as "between High and Low" without competing
with either. `<SeverityBadge severity={...} />`
(`src/components/ui/severity-badge.tsx`) is the ready-made chip for new
call sites; existing badges that already render their own markup (a
table cell, a list-item chip) can import `SEVERITY_CLASS`/`SEVERITY_LABEL`
directly instead of adopting the component wholesale.

**Why this needed a pass:** before it, `RaidBoard.tsx`, `ExecutiveBriefing.tsx`,
`SteerCoBriefingView.tsx`, and the standalone `SteerCoReportView.tsx` HTML
generator each hand-rolled their own CRITICAL/HIGH/MED/LOW → color map, and
every one of them mapped **Medium and Low to the exact same grey** — a
real instance of the "never blended" rule being silently violated. Fixed
by routing every one of them through the shared map (`SteerCoReportView.tsx`
can't import it directly — no Tailwind pipeline, see its file header — so
it hand-keys the same hex values with a comment pointing back here).
`ExecutiveBriefing.tsx`'s Critical Risk Register also had a **second**,
independent bug: it only ever painted CRITICAL red vs. everything else
amber, but the register carries *any* severity that's been escalated for
SteerCo attention — an escalated Medium or Low item was reading as High.
The shared 4-way map fixed that too.

**Out of scope, deliberately:** `DecisionCenter.tsx`'s "High-severity RAID"
alert list only ever shows CRITICAL/HIGH items by construction (its own
query excludes Medium/Low), so its 2-tone `critical`/`warning` badge isn't
a bug. Lifecycle/status badges (tenant ACTIVE/SUSPENDED/GRACE_PERIOD,
elevation Active/Expired, connection Connected/Error) are a different
semantic — state, not severity — and aren't part of this ladder.
`ScheduleTracker.tsx`'s pace-risk coloring (`unknown`/`onTrack`/`slip`/
`warning`/`critical`) and `RaidBoard.tsx`'s exposure-score heatmap tint are
each their own established, internally-consistent scale — not a
Critical/High/Medium/Low badge, so not migrated onto this map.
