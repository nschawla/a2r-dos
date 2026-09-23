# Financial Realization Cockpit Executive Triage & Thematic Clustering

_Status: shipped in v1.22.0._
_Audience: engineering + delivery leadership._

## 1. Purpose

Same problem the RAID Cockpit solved (`docs/RAID_EXECUTIVE_TRIAGE.md`), applied
to the EAC engine: `/financials` was a strictly per-project tool — pick an
engagement, see its BAC/Actuals/EAC. There was no portfolio-wide read on
where the org's money was actually at risk. `/financials` now opens on a
macro "Executive Triage" summary first, with the existing per-project picker
still one click away for the micro view.

## 2. What "thematic clustering" actually is here

**Deliberately not a live LLM call** — same reasoning as RAID's: this renders
on every `/financials` visit and needs to stay instant regardless of
`ANTHROPIC_API_KEY` configuration.

One real difference from RAID's classifier: a RAID item carries a free-text
title/description/impact to keyword-score against. A project's financial
snapshot has no narrative field. So `src/lib/financial-triage.ts`'s
`classifyFinancialTheme` is a **fixed-priority decision list over real,
already-computed structured signals**, not a keyword scorer — a different
mechanism, the same governing rule (deterministic, transparent, never
invents a cause):

1. **Unbilled Milestone Delays** — any `SchedulePhase` on the project is
   `DELAYED`, and the project is Fixed Price. (T&M bills on hours logged,
   not milestones, so a delayed phase isn't a stalled billing trigger there.)
2. **Scope Creep Overruns** — `Project.healthScope` is already `Red` (an
   escalated Critical RAID issue, or unscheduled backlog over 10% of BAC —
   both computed by the seed/health-vector engine, not invented here).
3. **Subcontractor Rate Variances** — Contractor/Vendor rate-card roles
   account for ≥40% of the project's logged actual spend.
4. **Labor Burn Accelerations** — actuals have outpaced BAC with none of the
   three more specific causes above on record; the honest catch-all for
   "burn is ahead of plan, no other flagged driver."
5. **Other** — at-risk (Amber/Red) by EAC/margin math, but none of the above
   fired. Not a failure state — the honest answer when nothing matches.

The first rule that matches wins (fixed priority order), mirroring how RAID's
keyword scorer breaks ties by `RAID_THEME_ORDER`.

## 3. The population

**Tile 1's totals (BAC, Actuals, EAC Variance, billing-type split) span every
scoped project**, not just the at-risk ones — a portfolio rollup needs the
whole denominator. **Tile 2's clusters draw only from the Amber/Red subset**
(`Project.healthCost`) — a project tracking to baseline has no root cause to
surface. Green is excluded from clustering entirely, mirroring RAID's
LOW-severity exclusion.

| healthCost | RAG |
| --- | --- |
| Red | Red |
| Amber | Amber |
| Green | excluded from Tile 2 |

Both tiles read the same denormalized EVM snapshot (`Project.bac` /
`actualsCost` / `vac` / `healthCost` / `healthScope`) that
`src/lib/executive-triage.ts` already treats as the portfolio-view source of
truth, rather than re-running the full per-project EAC engine
(`computeEacSummary`) across the whole scoped portfolio on every page load —
consistent with that existing convention, and the reason this stays
genuinely instant.

## 4. The two tiles

- **Tile 1 — Portfolio Financial Health Triage**
  (`src/components/modules/financials/FinancialTriageHeader.tsx`'s
  `TriageTile`): total BAC / Actuals / EAC Variance across the whole scoped
  portfolio, a Red/Amber project-count split, and a by-billing-type
  (Fixed Price vs. T&M) breakdown with count + BAC each.
- **Tile 2 — Financial Variance & Risk Clusters** (`ClustersTile`): one card
  per non-empty theme, sorted by **distinct project count first, then total
  $ variance** — a theme touching 3 projects outranks a bigger single-project
  overrun, the systemic read leadership actually wants. A click on a
  cluster's header expands it inline to the contributing projects (every row
  a real `<Link>` to that project's Financial Realization view — fully
  keyboard/screen-reader accessible); double-clicking a row is a power-user
  shortcut to the identical destination, layered on top via `onDoubleClick`
  + `preventDefault`, never the only way to reach it.

## 5. Data flow

```
src/lib/financial-triage.ts                    buildFinancialTriage(projects) → FinancialTriageResult  (pure)
src/server/queries/financial-triage.ts          loadFinancialTriage(context) — the one query + adapter
src/app/(dashboard)/financials/page.tsx         streams FinancialTriageHeader behind <Suspense>,
                                                 the ProjectPicker micro-view stays outside it
src/components/modules/financials/FinancialTriageHeader.tsx   the two tiles + expand/drill-down
```

## 6. What was deliberately not built

- **No caching/materialization of the classification** — cheap enough (one
  bounded query + in-memory reduce over the scoped project set) to run fresh
  on every request.
- **No new theme-editing UI or threshold config** — the theme vocabulary and
  the 40% contractor-share threshold are code-level constants, not tenant
  settings. Revisit if a tenant needs a custom taxonomy or threshold.
- **No modal drill-down** — both single- and double-click land on the real
  `/financials/[projectId]` route, not a modal overlay.
- **No re-run of the full EAC engine for the rollup** — Tile 1's totals come
  from the denormalized snapshot columns, not a live `computeEacSummary`
  pass over every scoped project's roles/actuals; that engine remains the
  source of truth for the per-project view it already powers.
