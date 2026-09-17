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
