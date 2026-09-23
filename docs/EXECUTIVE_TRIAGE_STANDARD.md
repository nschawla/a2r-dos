# Executive Triage & Thematic Clustering — the cross-cutting standard

_Status: shipped v1.21.0–v1.26.0 (RAID, Financial Realization, Schedule,
Resource & Capacity, Commercial Baseline, then the Control Tower Bento
Grid). Audience: engineering + delivery leadership. This is the
architectural overview; each module's own doc is the detailed reference
— see the table in §2._

## 1. The pattern, in one paragraph

Five delivery modules — RAID, Financial Realization, Schedule,
Resource & Capacity, Commercial Baseline — were each a strictly
per-project tool: pick an engagement from a picker, see its log/EAC/
timeline/roster/baseline. None had a portfolio-wide read on where risk
actually sat, so a leader had to open every project in turn to know
whether the org had a systemic problem or a handful of isolated ones.
Each module now opens on a **dual-tile Executive Triage banner** — a
macro rollup, then a thematic breakdown of what's driving it — with the
existing per-project picker still one click below, completely unchanged.
The Control Tower (`/portfolio`) then applied the same "macro pulse
before micro detail" idea at the page-layout level: see §6.

## 2. The five modules, side by side

| Module | Route | Tile 1 (macro rollup) | Tile 2 themes | Classification mechanism | Full doc |
| --- | --- | --- | --- | --- | --- |
| RAID | `/raid` | Total open Critical/High/Medium items, Red/Amber split, by-type breakdown | Resource Bottlenecks, Integration/Data Failures, Scope Creep, Vendor Delays | **Keyword scoring** against each item's own title/description/impact text | `docs/RAID_EXECUTIVE_TRIAGE.md` |
| Financial Realization | `/financials` | Total BAC, Actuals, EAC Variance, over/on-budget split, FF/T&M breakdown | Unbilled Milestone Delays, Scope Creep Overruns, Subcontractor Rate Variances, Labor Burn Accelerations | **Fixed-priority rule list** over structured signals (schedule status, `healthScope`, contractor cost share, `commercialModel`) | `docs/FINANCIAL_REALIZATION_TRIAGE.md` |
| Schedule & Milestones | `/schedule` | Active-milestone count, upcoming go-lives (30/60d), Red/Amber/on-track split | Third-Party Dependency Cascades, UAT Sign-off Lags, Resource Contention on Deployment Windows, Scope Expansion Slippage | **Fixed-priority rule list**, the one module that calls the live schedule calc engine (`computePhaseSlipDays`/`computePhasePace`) instead of a denormalized snapshot — see §4 | `docs/SCHEDULE_MILESTONES_TRIAGE.md` |
| Resource & Capacity | `/capacity` | Blended utilization, unassigned headcount, severely-over-allocated (>110%) count, Red/Amber/Optimal split | Senior/Architect Over-allocation, Cross-Project Contention for Lead PMs, Junior/Analyst Under-utilization, Bench/Unassigned Capacity | **Fixed-priority rule list** over role-name keyword matching + utilization/attainment/concurrency signals | `docs/RESOURCE_CAPACITY_TRIAGE.md` |
| Commercial Baseline | `/commercial-baseline` | Total contracted value, active-contract count, locked/draft split, Red/Amber count, FF/T&M breakdown | Change Order Exposure, Margin Squeeze on Fixed-Fee Deliverables, Blended Rate Erosion, Exceeded Baseline Scope Caps | **Fixed-priority rule list** over `Project.locked` / `PortfolioIntervention` / `healthCost` / `commercialModel` | `docs/COMMERCIAL_BASELINE_TRIAGE.md` |

## 3. Shared design principles

- **Deliberately not a live LLM call, anywhere.** Every classifier is a
  pure, synchronous function — no `ANTHROPIC_API_KEY` dependency, no
  per-request latency or cost, correct and instant regardless of
  configuration. The Executive Agent (`src/lib/executive-agent.ts`)
  remains the one deliberate exception in this app, used only for an
  on-demand chat interaction, never a page-load-blocking computation.
- **Two real classification mechanisms, chosen per module's own data
  shape, not one mechanism forced onto all five.** RAID items carry
  free text (title/description/impact) worth keyword-scoring; a
  financial/schedule/resource/commercial "row" doesn't — those four use
  a fixed-priority decision list over real, already-computed structured
  fields instead. Both mechanisms share the same governing rule:
  deterministic, transparent, and a theme only ever buckets data that's
  already real. Ties/multi-match cases resolve by a fixed module-level
  order (documented in each module's own doc), never arbitrarily.
- **Never fabricate a theme the schema can't back.** Two requested
  themes had no real data behind them anywhere in the schema —
  Resource & Capacity's "Pending Skillset Certification Gaps" (no
  certification/skills model exists at all) and Commercial Baseline's
  "Unsigned Change Orders" / three-state contract status (no
  e-signature or amendment-approval tracking exists). Both were
  substituted with a real, adjacent signal instead of invented data —
  Bench/Unassigned Capacity, and Change Order Exposure +
  `Project.locked`'s real 2-state split, respectively — each documented
  transparently in the module's own doc (§2 of both) rather than
  silently passed off as the literal request.
- **Every theme's exclusion criterion is honest, not padded.** A
  project/item/resource that's genuinely clean (RAID: LOW severity or
  closed; the other four: the "Green" health band) never enters Tile 2
  at all — "Other" is the honest zero-match fallback for something
  that IS at risk but doesn't fit a named pattern, never a dumping
  ground for everything.
- **Consistent RAG hierarchy and card language across all five.** Red /
  Amber (never a third color in Tile 2's badges), `bg-critical-soft` /
  `bg-warning-soft` chips, a `!border-l-[6px]` accent on Tile 1, `card
  !p-4` density throughout, `compactMoney`/`tabular-nums` for figures.
  A viewer moving between modules never has to re-learn the visual
  grammar.
- **Consistent interaction: single-click expands, a second action
  drills in.** Tile 2's cluster cards expand inline on click
  (`aria-expanded`, a rotating chevron) to show contributing rows —
  every row a real, keyboard/screen-reader-accessible link. Four
  modules use `onDoubleClick` + `preventDefault()` as a power-user
  shortcut to the identical destination a single click already reaches
  (never the *only* way to reach it). Resource & Capacity is the one
  exception — see §5.
- **Sort clusters by systemic reach, not raw pile size.** Every module
  sorts Tile 2's clusters by **distinct-project-count first**, then a
  module-appropriate secondary metric (raw item count for RAID, $
  variance for Financial/Commercial, slip-days for Schedule,
  headcount for Resource). A theme touching 4 projects outranks a
  bigger single-project pile in every module — the systemic read is
  what leadership actually needs first.

## 4. Where the five modules deliberately diverge, and why

Not every module makes the same engineering trade-off, and that's a
recorded decision in each case, not an inconsistency:

- **Financial Realization and Commercial Baseline read only the
  denormalized EVM snapshot** (`Project.bac`/`actualsCost`/`vac`/
  `healthCost`/`healthScope`) rather than re-running the Decimal-heavy
  sizing/EAC engine (`computeEacSummary`) across the whole scoped
  portfolio on every page load — the same source `executive-triage.ts`'s
  own "Over Budget" driver already treats as authoritative.
- **Schedule calls its own calc engine live**, per scoped project
  (`computePhaseSlipDays`/`computePhasePace`/`computeScheduleSummary`) —
  a deliberate exception, because that math is a handful of cheap
  date-arithmetic comparisons over at most 6 phases, not a
  Decimal-accumulation pass, and it's the same engine
  `executive-triage.ts` already calls for its "Behind Schedule"
  narrative, so every surface in the app agrees on what counts as
  slipped.
- **Schedule's Tile 2 gate is a unified per-phase health check**
  (`phaseHealthRag`), not `computeScheduleSummary`'s own narrower
  "worst" (which only reads date-based slip, missing an explicit
  `DELAYED` status flag or a pace-only warning on a phase with no
  `actualEnd` yet). Gating on the narrower definition would have let
  Tile 1 show Red milestones for a project Tile 2 called on-track —
  caught and fixed before shipping, not after.
- **Resource & Capacity's blended-utilization figure is
  hours-weighted, not a naive average of per-resource percentages** —
  the exact formula `capacity-engine.ts`'s `blendedSummary` already
  uses (Σ billable ÷ Σ available, every row's hours counting toward the
  numerator, only billable heads' hours toward the denominator), so
  Tile 1's headline number can never quietly disagree with the
  Capacity Cockpit page it sits above.

## 5. Drill-down: a route for four modules, a same-page anchor for one

RAID, Financial Realization, Schedule, and Commercial Baseline each
double-click (or single-click) straight to a real `/[module]/[projectId]`
route — every cluster member in those four modules **is** a project.

Resource & Capacity is different: a cluster member is a **resource**,
which can itself touch several projects, and `/capacity` has no
dedicated per-resource page — the whole roster already lives in one
table, on the same page (the Utilization tab). So its drill-down is a
plain `<a href="#resource-{id}">` landing on a matching `<tr
id="resource-{id}">` the Utilization tab already renders — no custom
double-click handler needed, since a browser's native anchor click
already performs that same jump on its own. This also deliberately
sidesteps the same-pathname client-router issue documented in
`docs/UI_DESIGN_SYSTEM.md` §5.1: a pure in-page anchor jump has no route
to transition, so there's nothing for that platform issue to affect.

## 6. The Control Tower Bento Grid — the same idea, one level up

`/portfolio` applied the identical "macro before micro, heavy content
tucked behind one click" philosophy to its own layout, not just to a
new triage banner: the previously single-column page (stat cards →
Decision Center → utilization → program rollups → roster counts, one
long scroll) became a responsive multi-column grid on a default
"Overview" tab, with the heaviest content (the full Decision Center —
up to 6 tall Impact-Aware Decision Cards) moved into a dedicated
"Decisions" tab reached in one click from a compact summary tile. Full
detail: `docs/UI_DESIGN_SYSTEM.md` §8.

## 7. Schema footprint: zero new tables across all six releases

Every module above, and the Bento Grid refactor, reads existing
tenant-owned models already in `docs/TENANT_MODEL_INVENTORY.md` and
`docs/ERD.md` — `Project`'s denormalized snapshot columns, `RaidEntry`,
`SchedulePhase`, `Resource`/`DeliveryRole`, `PortfolioIntervention`.
No migration, no new column, no breaking change shipped with any of
v1.21.0 through v1.26.0. (The one real schema/RLS gap this rollout's own
documentation-accuracy pass surfaced — `PortfolioIntervention` missing
its tenant-isolation policy since v1.20.0 — predates all five triage
modules and is unrelated to them; see `docs/TENANT_MODEL_INVENTORY.md`'s
top note and migration 29.)

## 8. Test coverage

Each module's classifier and aggregator is unit-tested in isolation —
no DB, pure functions — one file per module:
`tests/raid-triage.test.ts` (15), `tests/financial-triage.test.ts` (16),
`tests/schedule-triage.test.ts` (18), `tests/resource-triage.test.ts`
(19), `tests/commercial-triage.test.ts` (17) — 85 tests total, every
theme's positive case, the OTHER fallback, priority-order tie-breaks,
and cluster aggregation (Red/Amber counts, distinct-project-count,
sort order). See `docs/TEST_COVERAGE.md` and `docs/RTM.md`'s
"Executive governance & triage modules" section for full traceability.
