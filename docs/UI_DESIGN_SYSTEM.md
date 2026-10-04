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

The PS Control Tower (`/portfolio`) is the reference implementation — see §8
for the Bento Grid refactor that superseded the earlier standalone Command
Center (`/command`, retired v1.29.0, now a permanent redirect here). It
puts every top-line signal (KPI strip, Decision Center summary,
utilization, roster counts, program rollups) into one scannable grid on
its default "Overview" tab, so a viewer never scrolls
past a wall of stacked full-width cards to see the operational pulse.

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
page for views like the PS Control Tower's Portfolio / Engagements / Activity
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
top to bottom. The Executive Hub's own briefing document
(`ExecutiveBriefing.tsx`: Summary / Resources / Financials / Risks /
Activity — the fifth pill folded in from the retired standalone SteerCo
Briefing in the v1.51.0 merge, §17) is the reference implementation — it's
a print document, which is exactly why `<ModuleTabs>` gained a `printAll`
prop: every panel still prints one after another regardless of which pill
is active on screen, so the on-screen pills never cost the PDF anything. The
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
(the Portfolio PS Control Tower, `/portfolio`) — an early draft of this
component took `render: (row) => ReactNode` per column, which broke sign-in
itself (the PS Control Tower is the post-login landing page) until the design
above replaced it: columns are pure metadata, rows carry the already-
rendered `ReactNode` values, which — unlike a raw function — Server
Components ARE allowed to pass down as props. Caught by the end-to-end
suite before shipping, not by a user.

---

## 3. Rollout status

| Surface | Status |
| --- | --- |
| Portfolio PS Control Tower — Active Projects table | **Done** — `<DataTable>`, 4 optional columns (Client/PM/Model/Methodology) |
| `ProjectHeader` — Back to Portfolio | **Done** — reaches Commercial Baseline, Financials, Schedule, RAID, Controls Audit at once |
| PS Control Tower Overview tab — above-the-fold discipline | **Done** — Bento Grid (§8); the earlier standalone Command Center this row used to describe is retired (v1.29.0) |
| RAID Cockpit, Controls Audit checklist | **Not applicable** — already card/list layouts (`RaidBoard.tsx`, `AuditChecklist.tsx`), not tables; no horizontal-scroll risk to begin with |
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
| Executive Hub (`ExecutiveBriefing.tsx`) | **Done** — Summary / Resources / Financials / Risks / Activity pills (the fifth folded in from the retired standalone SteerCo Briefing, v1.51.0, §17); `printAll` keeps the printed PDF a one-section-after-another board deck |
| Capacity Cockpit (`CapacityCockpit.tsx`) | **Done** — migrated from a bespoke underline-style tab bar to `<ModuleTabs>` for one pill pattern app-wide (functionally unchanged: still instant client-side switching, now also gets `?v=` deep-linking for free) |
| Admin & Org Setup (`admin/page.tsx`) | **Already conformant** — Roster / Governance / Data & Compliance pills predate this pass |
| Portfolio PS Control Tower, Reports Hub outer shell, Reports Hub batch-detail page | **Already conformant** — existing `<ModuleTabs>` usage |
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

---

## 5. Icon & Pill Selector Hub — the Apple-style category/filter row

`src/components/ui/pill-selector.tsx`'s `<PillSelectorRow>` is a row of
rounded, icon-led selector cards for category and filter controls —
distinct from `<ModuleTabs>` (§1.4/1.6). The two solve different problems
and neither replaces the other:

| | `<ModuleTabs>` | `<PillSelectorRow>` |
| --- | --- | --- |
| Switches between | whole panels (different content trees) | a filtered slice of one dataset already on the page |
| ARIA | `role="tablist"` / `role="tab"` | `role="group"` of ordinary toggle buttons |
| Who does the filtering | the panel that's shown/hidden | the caller — this component only renders the row and reports clicks |
| Visual | a compact rounded-lg bar, text-only | larger `rounded-2xl` cards, icon + label + optional count, accent border **and** ring on the active card |

**Active state**: a solid `border-brand` plus a soft `shadow` ring
(`shadow-[0_0_0_3px_rgba(11,95,209,0.14)]`) — never a plain color swap, so
the active pill reads at a glance. This is the one visual treatment for
every pill row in the app; a filter's semantic color (amber for "escalated
only," a health dot inside a pill) still comes through via the pill's
*icon*, not the active-state border, so two different pill rows never
compete for the viewer's attention with two different "active" languages.

### 5.1 Zero-refresh — and the one place it can't be, honestly

The mandate is real client-side reactivity, not a network request per
click. Three of the four rollout surfaces are **pure client-side filters**
— a `useState` + `useMemo` over data the server already sent, zero
network, scroll position untouched:

- RAID Cockpit's type filter (`RaidBoard.tsx`) — restyled from plain text
  chips to icon pills; same `typeFilter` state as before.
- Capacity Cockpit's roster **practice filter** (`CapacityCockpit.tsx`,
  new) — narrows the Per-Resource Utilization table by practice.
- Portfolio PS Control Tower's **health-category filter**
  (`src/components/portfolio/ProjectsExplorer.tsx`, new) — narrows the
  Active Projects `<DataTable>` by Green/Amber/Red, wrapping it so the
  filter and the table share one client component.

The fourth — the **Reports Hub's engagement picker**
(`reports-hub-client.tsx`) — is structurally different: choosing a
different engagement needs a **fresh server fetch** (its own SteerCo
decisions, RBAC-scoped `canEdit`, …), so it can't be a client-only filter
over already-loaded data the way the other three are. It uses
`router.push` — the App Router's standard soft client-side navigation, the
same mechanism the rest of the app already relies on — wrapped in a
`useTransition` for a visible pending state instead of the page going
inert.

**A genuine, pre-existing platform bug surfaced while building this**: a
same-pathname, search-param-only client navigation (`/reports` →
`/reports?project=X`) sometimes never commits in this environment — the
server computes and returns the exactly correct RSC payload (verified by
inspecting it directly), but the client router doesn't apply it. Confirmed
**not** caused by this rollout: reproduced against the original,
pre-existing `<select>` this replaced, and against an unrelated pre-
existing control (`OpsTenantSelect.tsx` on `/ops/identity`) — and
reproduced identically with `router.push`, `router.replace`, and a plain
`next/link` `<Link>`, in both `next dev` and a production build. A
different-*pathname* navigation (e.g. the command palette) is unaffected —
this is narrowly about same-page search-param-only navigations. Filed as a
platform issue to chase separately; out of scope for a UI-pattern pass to
fix at the framework level.

The engagement picker's `handleSelect` works around it honestly rather
than either shipping a silently-broken pill or defaulting to a hard reload
on every click (which the whole point of this pattern rules out): it
starts the normal soft navigation, and arms a fallback timer that only
fires `window.location.assign` if `selectedProjectId` genuinely never
updates within 2.5s — checked via the actual prop change in a `useEffect`,
not a guessed URL string, so a merely slow navigation (this environment's
staging DB pooler has its own latency issues, documented elsewhere) is
never second-guessed into an unnecessary hard reload. The common case is
still a true zero-refresh soft navigation; the fallback is a safety net
for a real platform defect, not the primary mechanism.

---

## 6. Executive Actionability — Triage Feed, Persona-Aware Agent, Provenance

_A further follow-up, addressing stakeholder feedback on executive
actionability, persona-driven workflow, and continuous navigation._

### 6.1 The Executive Action Triage feed

`src/lib/executive-triage.ts` is the pure engine: `selectTriageProjects`
picks every Red-governance or over-budget/behind-schedule project from
data the PS Control Tower's Decisions tab already loaded (no extra query;
originally the standalone Command Center's, before that route's v1.29.0
retirement — see §7 and §8), worst first,
capped at `TRIAGE_LIMIT`; `buildExecutiveTriage` then synthesizes one
narrative card per project — Cause / Impact / Owner & Deadline / Required
Action — from data that **already existed**, not a new schema field:

| Field | Source, in priority order |
| --- | --- |
| Cause | `Project.narrativeBlockers` (already a hand-authored red-engagement note) → the top open RAID item's own description → a templated fallback naming the failing dimension |
| Impact | `actualsCost − bac` (a dollar variance) and/or `computeScheduleSummary(...).worstSlipDays` (schedule engine, `src/lib/calculations/schedule.ts`) — never both invented, only whichever actually applies |
| Owner & Deadline | The driving RAID item's owner/`targetDate`, falling back to the project's Delivery Manager / Project Manager when no RAID item exists |
| Required Action | The driving RAID item's own `mitigationPlan` → a templated action naming what an executive needs to do (approve a budget adjustment, approve a timeline extension, review the audit checklist) |

`src/server/queries/executive-triage.ts` is the one place that assembles
this end to end (scoped project load → flag selection → a *second*, small
query for schedule phases + open RAID items only for the flagged IDs →
synthesis) — shared by the PS Control Tower page and the Executive Agent
(§6.2) below, so both are always reading the exact same computed reality.

### 6.2 The Persona-Aware Executive Agent

A global floating widget (`src/components/assistant/ExecutiveAgentWidget.tsx`,
mounted once in `(dashboard)/layout.tsx`) → `POST /api/assistant/ask` →
`src/lib/executive-agent.ts`. Mirrors `src/lib/ai-parser.ts`'s contract
exactly (same model, same graceful `not-configured` 503 when
`ANTHROPIC_API_KEY` is unset, same never-throws shape) — the second
consumer of that pattern, not a new one.

**Grounded, not delegated**: the model never touches the database. Every
fact it can cite is pre-assembled server-side from the *signed-in user's
own* RBAC-scoped triage + portfolio summary (§6.1) — the same scoping
every other portfolio view uses, never a client-supplied scope — and a
restricted viewer's margin figures are stripped from the context before
it ever reaches the model, the same masking boundary
(`src/lib/security/masking.ts`) the rest of the app enforces. The system
prompt forbids answering from anything else, and the response is a forced
tool call (`answer_executive_question`), not free text — a citation the
model returns is only trusted if its `projectId` actually appears in the
context handed to it; the app supplies the real link itself rather than
trusting a model-generated href.

### 6.3 Continuous context & navigation

Already solved before this pass, not rebuilt: `ProjectHeader.tsx`'s
`ModuleNav` (§1.4) already lets a viewer switch between a project's
Financials / Schedule / RAID / Controls Audit / Commercial Baseline
dimensions without ever bouncing back to the global sidebar. Verified
unregressed, not reimplemented.

### 6.4 Data Provenance Stamps

`src/components/ui/provenance-stamp.tsx` — a minimalist, honest freshness
label ("Updated · 14m ago") on the Triage feed's cards and the Financials
page's summary header. Deliberately reads the real underlying record's
`updatedAt` rather than fabricating a "synced via connector" event this
app doesn't actually have.

## 7. PS Orchestration & Decision Engine — Decision Cards, governed execution

Full detail: `docs/PORTFOLIO_ORCHESTRATION.md`. In UI-system terms:

- `DecisionCard` (`src/components/command-center/DecisionCard.tsx`) is the
  one card component the Portfolio's `DecisionCenter` renders for every
  flagged engagement (both the Overview tab's compact summary and the
  Decisions tab's full list) — upgraded from §6's plain narrative card
  with a Client Strategic Context badge and a row of 2-3 pill-styled
  option buttons (rounded-2xl border-2, the same visual language as §5's
  `PillSelectorRow`, though these are Links-to-an-action rather than a
  filter toggle so they don't reuse that component directly). The
  standalone Command Center's own `ActionTriageFeed` wrapper around this
  same component was retired with that route (v1.29.0, §8) — the
  underlying `DecisionCard`/engine didn't change.
- Clicking an option opens `InterventionDrawer` — a controlled slide-over
  following the exact same backdrop/aside structure as
  `AuditTrailDrawer` (`fixed inset-0 z-[100]`), so the app has exactly one
  drawer idiom, not two.
- Portfolio's Decision Center gave its "Red or over budget" column the
  full `DecisionCard` treatment (not the compact `AlertRow` list every
  other column still uses) — the richest, most actionable content earns
  the space; "no cramming" is served by keeping it capped at the existing
  `TRIAGE_LIMIT` (6).
- Once an intervention is executed, the card shows a one-line
  "Intervention Applied · {option} · {who}" stamp with a
  `ProvenanceStamp` — the same honest-freshness convention as §6.4, not a
  new one.

## 8. PS Control Tower UX Refactor — Bento Grid & the Decisions tab

Before this pass, `/portfolio` stacked its stat cards, the full Decision
Center (up to `TRIAGE_LIMIT` tall Impact-Aware Decision Cards), a
utilization link, program rollups, and roster counts as one long vertical
column above the tabs — the exact "scroll fatigue" §1.2 warns against, on
the page most likely to be an executive's first screen of the day.

- **The default "Overview" tab is now a responsive grid**
  (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`, the same breakpoint
  vocabulary the five triage-module dual-tile headers already use) rather
  than a single undifferentiated column. Cells use `card !p-4` — the same
  tighter density `StatCard` and every triage-module tile already use —
  not the default `.card` `p-6`.
- **v1.30.0 — restructured into 4 explicit rows**, each a full-width
  nested grid so related signals read as one group rather than a
  grab-bag of tiles, in this order:
  1. **Scope & Footprint** — Active Engagements, Active Resources,
     Practices (3-up).
  2. **Financial Scale & Backlog** — one wide card: Total Contract Value
     (`PortfolioSummary.totalValue`, the live-sizing-engine figure,
     unchanged) as the headline, with Actuals to Date, Forecast at
     Completion (`bac − vac`), and **Unscheduled Backlog (USB)**
     highlighted as sub-figures. USB reads `Project.unscheduledBacklog`
     directly — a real denormalized snapshot column ("USB —
     sold-but-unscheduled value" per its own schema comment) that existed
     since the Capacity & Concurrency schema foundation but was never
     surfaced anywhere in the app before this pass. All three sub-figures
     are summed in exact decimal (`src/lib/calculations/money.ts`'s
     `d`/`sumMoney`/`money` — accumulate in `decimal.js`, round once, the
     same convention the WP2 engine itself uses for every `$` rollup),
     not a naive `Number()` reduction. USB renders in `text-warning` tone
     when greater than $0 — real revenue sitting outside a locked
     baseline is exposure, not a neutral fact.
  3. **Action & Risk** — the Decision Center summary tile paired with
     High-Risk (Red) Projects (2-up).
  4. **Performance & Health** — Avg. Baseline Margin paired with the
     Blended Billable Utilization tile (2-up).

  Custom KPIs (when the tenant has any) and Program Rollups (when there
  are parent-hierarchy engagements) still render below the four rows,
  full width — real conditional content, not part of the fixed
  structure. "Engagements in Scope" and "Resources on Roster" are
  renamed **Active Engagements** / **Active Resources** in this pass, to
  read as one consistent "Active X" vocabulary across Row 1.
- **The heavy content moved into a new "Decisions" tab**, alongside the
  existing Engagements and Activity tabs (`ModuleTabs`, §1.6) — every
  panel is still server-rendered and present in the DOM (`hidden`, not
  unmounted), so switching is instant with zero extra requests, exactly
  §1.6's existing contract. `DecisionCenterSummary`
  (`src/components/portfolio/DecisionCenter.tsx`) is the Overview tab's
  compact tile: the same headline + a Red/Amber badge row, linking to
  `?v=decisions`.
- **One data-fetch, two render targets.** The Decision Center's data
  (triage synthesis + the PS Orchestration engine's real-headroom search —
  §7's heaviest query) now feeds both the Overview tile and the Decisions
  tab's full list. Each lives in its own `<Suspense>` boundary since they
  render in different parts of the tree, but the fetch itself is wrapped
  in React's `cache()` (Next.js's documented per-request memoization
  primitive) so calling it from both places only runs the underlying
  queries once — confirmed empirically during this rollout (a temporary
  invocation counter logged exactly one call, not two) rather than assumed.
- **The Overview→Decisions tile link is a plain `<a href="?v=decisions">`,
  not `next/link`.** A full navigation always lands correctly (`ModuleTabs`
  reads `?v=` from the URL on mount) and deliberately avoids §5.1's
  documented same-pathname client-router issue on what's meant to be this
  tile's primary action, rather than reaching for that section's
  verified-fallback pattern for a single secondary shortcut next to an
  always-visible tab pill.

## 9. Sidebar Flattening & Command Center Merge (v1.29.0)

- **`src/components/layout/Sidebar.tsx`'s three grouped sections**
  (`Portfolio` / `Engagement Governance` / `Reporting`, each with its own
  uppercase heading) collapsed into **one flat stack**, in delivery-
  workflow order: PS Control Tower, Commercial Baseline, Financial
  Realization, Schedule & Milestones, RAID Cockpit, Resource & Capacity,
  SteerCo Briefing, Executive Hub, Controls Audit. The per-item
  `colorGroup` icon tint (governance/delivery/commercial) is unchanged —
  it still signals which of the three functional zones an item belongs
  to, just without a wrapper label doing the same job twice. The pinned
  Setup footer (Admin & Org Setup, Compliance Ledger) and the
  staff-only A2R Ops Console item at the very bottom are unchanged.
- **The standalone Command Center (`/command`) is retired.** The route
  now unconditionally `redirect()`s to `/portfolio` (Next.js
  `next/navigation` `redirect`, not a client-side bounce) rather than
  404ing for an old bookmark. Its two capabilities that weren't already
  duplicated elsewhere moved to the PS Control Tower: the Impact-Aware
  Decision Cards feed (already identical to Decisions-tab content — see
  §7 — so nothing there actually changed) and the natural-language
  `CommandBar`, now rendered once on `/portfolio` above `ModuleTabs` so it
  stays visible regardless of which tab is active (preserving its
  original "pinned" positioning). Its venture-vitals `PulseStrip` and its
  multi-source `ActiveStream` feed were retired from that page outright,
  not merged — both components remain in active use elsewhere (`PulseStrip`
  on `/steerco` and `/ops/pulse`; `ActiveStream`'s `getActiveStream` query
  backs `/ops/pulse` and the SteerCo briefing composer) and were never
  deleted; `/command` itself simply stopped rendering them, since their
  ground was already covered within the viewer's real scope by the
  Overview tab's KPI strip and the Activity tab's feed.
- **4-Tier RBAC persona consolidation** (`src/lib/governance/rbacMatrix.ts`)
  — the six-persona `RbacPersona` layer collapsed to five: the old
  `EXECUTIVE_BOARD` persona is gone, and both `PRACTICE_DIRECTOR` and
  `VP_EXECUTIVE` (real `DeliveryAccessRole`s, unchanged) now resolve to one
  merged `ENGAGEMENT_MANAGER` persona ("Practice Director /
  VP-Professional Services") with identical `allowedModules`. Built by
  elevating `VP_EXECUTIVE` up to `PRACTICE_DIRECTOR`'s existing
  full-operational nav breadth, never by narrowing PD down — real edit
  authority (`src/lib/auth/rbac.ts`) is untouched either way. See
  `docs/ROLE_ACCESS_MATRIX.md` §2.3 for the full rationale and the "why
  elevate, not narrow" safety argument.

## 10. Naming & Layout Density Polish (v1.30.0)

- **"Control Tower" → "PS Control Tower"** everywhere it names the
  module (Sidebar link, `GOVERNABLE_MODULES`'s label, the Command Bar's
  route keywords, the 404 pages' "back to" links, the Auto Demo's VO
  captions and track blurbs) — aligning it with the page's own `h1`,
  which has read "PS Control Tower" since the module existed. Route
  (`/portfolio`), module key (`control-tower`), and every RBAC/governance
  check keyed off that string are untouched — this is a display-label
  rename only.
- **"Control Audit" → "Controls Audit"** everywhere it names the module
  (Sidebar link, `GOVERNABLE_MODULES`'s label, the per-project
  `ModuleNav` pill, the `/audit` page's `h1` ("Controls Audit Intake"),
  the HelpDrawer topic title, the Methodology Reference's "Back to"
  link, the Command Bar's route keywords). Same scope as above — route
  (`/audit`), module key (`audit`), and `CTRL_01`–`CTRL_10` system keys
  are frozen and untouched (`docs/` nomenclature history:
  `HelpDrawer.tsx`'s and `AuditChecklist.tsx`'s own comments on the
  "never invent a '10 Minimum Controls' framing" purge still hold — this
  rename changes the module's own name, not that separate numbering
  convention).
- **The main dashboard shell widened for high-density enterprise
  viewing.** `Container` (`src/components/ui/container.tsx`) gains a
  `full` size tier (`max-w-[1920px]`, tighter `px-4 sm:px-6 lg:px-8`
  gutters vs. the `default` tier's `px-5…lg:px-12`) — applied only to
  `(dashboard)/layout.tsx`, the client-facing app shell. The Ops Console
  (`(admin)/layout.tsx`) and the public prose pages (`/terms`,
  `/privacy`) keep their existing `default`/`prose` widths — this pass
  is scoped to the client dashboard specifically, not every `Container`
  consumer.

## 11. `GLOBAL_ADMIN` → `CLIENT_ADMIN` (v1.31.0)

The top tenant persona (`src/lib/governance/rbacMatrix.ts`) is relabeled
from `GLOBAL_ADMIN`/"Global Admin" to `CLIENT_ADMIN`/"Client Admin" — a
naming-clarity fix, no capability change. "Global" read as if the tier
reached across tenants; every `DeliveryAccessRole`, `ADMIN` included, is
strictly `organizationId`-scoped by the ORM's own tenant auto-scope, so
the old name was always a slight misnomer. The rename also makes explicit
what the old "Global Admin / A2R Staff" framing blurred: this persona is
completely independent of A2R staff status (`session.user.isA2rStaff`, a
separate boolean gating `/ops` — §9's confirmation that `/ops` stays
internal-only is unaffected). Full rationale:
`docs/ROLE_ACCESS_MATRIX.md` §2.5. Renamed everywhere the key/label
appeared: the Sidebar's route-visibility comment, the Persona Preview
banner, the Custom KPI Builder's target-persona picker, the SSO Identity
Federation panel's group-mapping labels
(`src/components/ops/IdentityFederationPanel.tsx`, also caught and fixed
two other stale persona labels there left over from the 4-Tier RBAC
pass — "Executive Board" and "Engagement / Practice Manager" — that had
drifted out of sync when that merge shipped).

## 12. Global rebrand — "PS Delivery OS" (v1.33.0)

The product's full name is **PS Delivery OS**; **PS-DOS** remains its
official shorthand — both names refer to the same product, and neither
retires the other. The split follows one consistent rule: **brand-identity
slots and full product-introduction sentences use the full name; compact,
space-constrained UI (browser tab titles, the footer copyright line,
single-line auth-screen headers) keeps the shorthand.**

- **Full name, rendered:** the Sidebar's own brand text
  (`src/components/layout/Sidebar.tsx`, next to `BrandMark`) and the
  marketing site's header brand text and hero paragraph
  (`src/app/page.tsx`) — the two places a viewer's eye actually lands on
  "what is this product," matching how a real product names itself in its
  own primary logo lockup.
- **Shorthand, kept:** every `<title>`/`Metadata.title` browser-tab string
  (`PS-DOS™`, unchanged — see the existing rationale in this file and in
  `README.md` about not putting a second, visually competing brand string
  in the tab bar), the global `Footer.tsx` copyright line, and every
  single-line auth-screen header (`"Sign in to PS-DOS™"`, etc.).
- **Meta descriptions and marketing prose** (`src/app/layout.tsx`,
  `src/app/page.tsx`) now formally introduce "PS Delivery OS (PS-DOS)" —
  the one sentence a reader who's never seen the product before actually
  needs the full name in.
- **Three stale copyright headers fixed in the same pass** —
  `src/lib/due-status.ts`, `src/components/portfolio/DecisionCenter.tsx`,
  `src/components/modules/audit/StatusBlurbEditor.tsx` still said "A2R
  Delivery OS™," a leftover from the *prior* A2R-DOS → PS-DOS rebrand
  (`scripts/rebrand-demo-org-name.ts`'s own doc comment) that the other
  117 files carrying the standard `PS-DOS™ — © 2026 A2R Ventures LLC.`
  header had already picked up. Brought in line with that established
  convention rather than introducing a third variant.
- **`docs/` is deliberately NOT swept wholesale.** Every doc already uses
  "PS-DOS" consistently as shorthand throughout — correct, and exactly
  the "where appropriate" case for keeping it. The naming relationship
  itself is now stated once, centrally, in the two most-read entry-point
  docs (`docs/EXECUTIVE_SUMMARY.md`, `docs/QUICK_REFERENCE.md`) rather
  than repeated as a caveat in every file.

## 13. The logo mark — "Concept B: Ascent Vector" (v1.34.0 – v1.39.0)

Six iterative passes on the one app-wide logo mark
(`src/components/ui/brand-mark.tsx`), converging on a pure-SVG navy
triangle + a wider red "ribbon" base, no gradient or raster artwork. Two
deliberately independent design tokens (`logo`, `logo-accent` in
`tailwind.config.ts`) keep the mark's own ink and accent color separate
from both `brand` (the one interactive accent — links, CTAs, focus rings)
and `critical` (the RAID/health severity red) — a re-theme of any one of
the three can never silently recolor another. `src/app/icon.svg` is a
hand-synced static copy for the browser-tab favicon (the app had none
before v1.34.0) and must be updated by hand whenever the mark's path data
changes — it has no access to Tailwind/CSS tokens as a static file.

## 14. Header — Ops Console status badge (v1.40.0)

For A2R staff viewing a tenant workspace, the header's identity chip now
shows a compact "Ops: `<role>`" badge beside the tenant persona label
(`Header.tsx`'s `UserMenu`) — e.g. "Client Admin" next to "Ops: Super
Admin." The two labels are deliberately never merged into one: the persona
label always describes tenant-scoped `DeliveryAccessRole` authority for
*this* workspace; the badge surfaces the completely independent
cross-tenant Operator axis (`docs/ROLE_ACCESS_MATRIX.md` §1), letting a
staff member confirm their `/ops` status at a glance without navigating
there. Renders nothing for a non-staff viewer.

## 15. Tabbed Multi-Tasking Workspaces + PS-DOS IQ (v1.41.0 – v1.43.0)

Three additions to the PS Control Tower's Overview tab, all **purely
client-side** (React state + `sessionStorage`/`localStorage` — no new
server routes, no backend writes):

- **Local triage actions** (v1.41.0, `TriageRowActions.tsx`) — a "•••"
  menu on each Decision Center alert row (Pending Decisions,
  High-Severity RAID): tag a row Under Review/Acknowledged
  (`localStorage`, persists across sessions), snooze it for the current
  session only (`sessionStorage`, always returns once the tab/session
  ends — deliberately never a standing dismissal), or export that one row
  as a CSV. Explicitly **not** the same thing as the Decision Card's own
  intervention flow, which still writes a real, audited
  `PortfolioIntervention` row — this is an ungated personal scratchpad for
  a reviewer's own pass, never a substitute for a governed action.
- **Tabbed Multi-Tasking Workspaces** (v1.43.0, `WorkspaceTabsBar.tsx` +
  `TrackedProjectLink.tsx`) — clicking into a project from the Control
  Tower opens a dismissible pill in a tab strip below the header, so a
  viewer can jump back to a recently-opened project without returning to
  the sidebar. Session-scoped (`sessionStorage`), capped at 8 open tabs.
  Scoped honestly: this is a navigational shortcut layer on top of
  Next.js's normal server-rendered routing, **not** an in-memory
  "kept-alive" multi-instance shell — switching tabs is a real page
  transition that re-fetches its own data, same as a normal navigation.
  The Control Tower itself is a pinned, non-closable home tab, never
  disturbed by opening/closing others — its own filter and search state
  (below) always survives a round trip through other tabs.
- **PS-DOS IQ** (v1.43.0, `src/lib/portfolio-nl-search.ts` +
  `ProjectsExplorer.tsx`) — a search bar above the Active Projects table
  recognizing a small, grounded set of real keywords (health status —
  `red`/`amber`/`green` + synonyms; `unassigned`; RAID-volume words —
  `clean`/`high-raid`; threshold expressions — `raid>2`) plus a plain
  substring fallback against name/client/PM/model/methodology, AND-combined
  across space-separated tokens. Named candidly in this doc so the gap is
  never papered over: despite the name, this is keyword/threshold
  matching, not natural-language understanding — a real free-form sentence
  will fall through to the plain-substring path and likely match nothing.
  Combines with the existing health-pill filter; an "Export CSV" button
  downloads whatever's currently visible under both filters.

## 16. A production bug this doc's own pattern should have caught (v1.44.0)

Worth recording as a cautionary note for future work in this file, not
just a changelog line: the Commercial Baseline tab's "Commercial Setup"
card rendered 8 label/value pairs as flat alternating `<dt>`/`<dd>`
siblings flowing directly into a `grid-cols-2 sm:grid-cols-3` container.
Sequential `dt,dd,dt,dd,…` flow only stays correctly paired when the
column count is a multiple of 2 — at 3 columns the pairing silently shifts
by one position after the first row and compounds down every row after
it, so a label rendered where a value should read. **The fix, and the
house rule going forward:** a label and its own value must always share
one wrapper element (a `<div>` holding both `<dt>` and `<dd>`) that the
grid arranges — never bare alternating `dt`/`dd` siblings handed straight
to a multi-column grid. The two other `<dl>` usages in the codebase
(`MarginModelerCard.tsx`, `OnboardingJourneyWizard.tsx`'s `SummaryRow`)
already followed this pattern correctly; this was an isolated miss, not a
systemic one — but it shipped to production before anyone caught it by
eye, which is the real lesson: a visual/alignment review of a finished
screen is not yet a standing step in how this app ships UI, and arguably
should be.

## 17. SteerCo/Executive Hub merge (v1.51.0)

The standalone SteerCo Briefing (`/steerco`) and the Executive Hub
(`/reports`) told largely the same portfolio-health story to largely the
same audience, as two separate sidebar items — a real UX overlap, not
just a styling inconsistency. Reading both components confirmed the
overlap was substantial (SteerCo's "Margin Health" ≈ Executive Hub's
"Financial Realization & Burn Health"; SteerCo's "Watchlist" ≈ Executive
Hub's "Critical Risk Register" — the same RAID query, two renderings) and
that both already read from the same underlying data: `composeSteerCoBriefing`
(`src/server/queries/steerco-briefing.ts`) was always a pure reshape of
`getExecutiveBriefing` plus the Active Stream, never an independent
query — so the two pages were never really two truths, just one truth
shown twice, differently.

- **Surviving route: `/reports`.** It was already the richer, better-
  structured page (`<ModuleTabs>`, the multi-section `ExecutiveBriefing`
  layout, a separate Engagement Reports tab for per-project SteerCo
  decks). `/steerco` now permanently `redirect()`s to `/reports` — same
  retirement pattern as the Command Center's v1.29.0 merge (§9): an old
  bookmark still resolves, it just lands somewhere else.
- **What moved onto the surviving page.** `ExecutiveBriefing.tsx` gained
  the two pieces that were genuinely unique to SteerCo and had no
  equivalent on the old `/reports`: the Pulse vitals strip (`PulseStrip`,
  reused as-is) rendered above the section tabs so it's visible
  regardless of which section a viewer has open, and a new fifth
  "Activity" tab carrying the "What Moved Since the Last Review" feed
  (ported from the now-deleted `SteerCoBriefingView.tsx`). Nothing new
  was built to produce either — both are the same `composeSteerCoBriefing`
  reshape, just consumed from the `/reports` page's own data-fetch instead
  of a separate route's.
- **The one real behavior change: the `WorkspaceLens` collapse.** Pre-merge,
  the `'executive'` lens landed on `/steerco` (gated by `steerco:view` —
  `ADMIN`/`VP_EXECUTIVE`/`VIEWER`) and a separate `'finance'` lens landed
  on `/reports` (gated by `canViewMargins` —
  `ADMIN`/`VP_EXECUTIVE`/`PRACTICE_DIRECTOR`). With one merged page, those
  are two names for the same destination — rather than fake a distinct
  route (`/reports?lens=finance`, no real difference) just to satisfy
  `tests/workspace-lens.test.ts`'s "every lens has a distinct landing
  route" invariant, the two collapsed into one `'executive'` lens
  (relabeled "Executive / Finance"), gated on the **union** of the two old
  checks (`steerco:view OR canViewMargins`) so every role that had a path
  onto *either* half before the merge keeps a path onto the combined page
  now — nobody lost reach. The lens switcher drops from four options to
  three. Page-level content masking (`canViewMargins`/`showFinancials`,
  already wired into the briefing independently of which lens got a
  viewer there) needed no change.
- **Untouched by this merge:** RBAC edit/approval authority
  (`src/lib/auth/rbac.ts`); the Engagement Reports tab (per-project
  SteerCo decks, margin rollups, compliance certificates — still exactly
  where and how it was, including its own `SteerCoReportView.tsx` HTML
  generator, §4); how financial figures get masked.
- **Removed as dead code:** `SteerCoBriefingView.tsx` (the standalone
  page's view component) — once `/steerco` only redirects, nothing
  imported it any more. `composeSteerCoBriefing` itself stayed exactly
  where it was (`src/server/queries/steerco-briefing.ts`), just re-consumed
  from `/reports`'s own server component instead of `/steerco`'s —
  `tests/steerco-briefing.test.ts`'s coverage of it needed no change.

## 18. Type-to-filter engagement combobox (v1.51.0)

Every "pick an engagement" picker in the app — the Executive Hub's
Engagement Reports tab (`reports-hub-client.tsx`) and the five module
landing pages (`/financials`, `/schedule`, `/raid`, `/commercial-baseline`,
`/audit`, via the shared `ProjectPicker`) — rendered **every** in-scope
engagement at once: a wrapped `<PillSelectorRow>` row on the first, a
plain scrollable `<ul>` of `<Link>` rows on the other five. Both degrade
badly once a tenant has 50–100+ active engagements — a wall of rows or
pills the viewer has to hunt through, costing real estate regardless of
whether anyone's actually scanning it.

**`<SearchableSelect>`** (`src/components/ui/searchable-select.tsx`) is
the replacement: a type-to-filter combobox that costs a few lines of
vertical space no matter how large the option set is. A small eyebrow
label ("Select Engagement") sits above it — deliberately a persistent
label, not just a placeholder, since the control shows the *current
selection's name* when idle and a placeholder alone would vanish the
moment something's chosen. The control itself is styled as a single pill
(`rounded-2xl`/`border-2`, the same treatment `<PillSelectorRow>` uses),
not a generic rectangular form input — it's standing in for a whole row
of those pills, so it keeps that visual language: brand-colored while
idle (reads like one "active" pill showing the current choice), dropping
to a neutral border while open/typing so it's visually clear you've moved
from *viewing* a selection to *picking* a new one.

**Two selection modes**, picked by whether the caller passes `getHref`:

- **`onSelect` only** — the Executive Hub's picker, which updates state
  on the *same* page (a `?project=` query param). Option rows render as
  buttons, true `role="option"` / `aria-selected` listbox semantics,
  since choosing one is genuinely "select a value," not a navigation.
- **`getHref`** — the five module landing pickers, which always navigate
  *away* to `/<module>/[id]`. Option rows render as real `<Link>`s
  instead of buttons — not `role="option"` (an explicit role would
  override the implicit, and here more honest, "link" role: choosing one
  leaves the page entirely, which listbox semantics don't fit) — so
  cmd/middle-click-to-open-in-a-new-tab keeps working and the result
  stays an `<a href>` a test (or a screen reader) can find as a link.
  `onSelect`, if also given, still fires alongside the navigation.

**A real bug worth recording the fix for:** the input's displayed text
must never be derived from the `selectedId` prop directly at render
time. After choosing a *new* option, that prop is still the *old* value
until the caller's own state or async navigation round-trip catches up
— for the Executive Hub's same-pathname query-param nav specifically,
that can take a couple of seconds (see `reports-hub-client.tsx`'s own
"Verified-fallback navigation" comment on a confirmed platform-level
quirk with that exact navigation shape). Reading `selectedId` directly
in the closed-state display showed the *stale* choice, faded, until the
round-trip landed — a visibly wrong "you picked the wrong thing" flash.
The fix: the displayed text is its own state (`query`), set optimistically
the instant a choice is made, and only ever resynced from the real
selection on an actual `selectedId` prop change — never on open/close
transitions. A second, related trap: calling `inputRef.current?.blur()`
right after that optimistic `setQuery()` synchronously fires `onBlur`
(which reverts the display to the real selection) *before* the prop
catches up, silently undoing the fix. Selecting an option closes the
panel via `setOpen(false)` alone; it doesn't need to blur the input too.
