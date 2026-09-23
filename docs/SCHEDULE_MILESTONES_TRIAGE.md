# Schedule & Milestones Cockpit Executive Triage & Thematic Clustering

_Status: shipped in v1.23.0._
_Audience: engineering + delivery leadership._

## 1. Purpose

The third application of the pattern shipped for RAID
(`docs/RAID_EXECUTIVE_TRIAGE.md`) and Financial Realization
(`docs/FINANCIAL_REALIZATION_TRIAGE.md`): `/schedule` was a strictly
per-project tool — pick an engagement, see its phase burndown. There was
no portfolio-wide read on where the org's delivery timeline was actually
at risk. `/schedule` now opens on a macro "Executive Triage" summary
first, with the existing per-project picker still one click away.

## 2. What "thematic clustering" actually is here

**Deliberately not a live LLM call** — same reasoning as the other two.

Like Financial Realization's classifier, `src/lib/schedule-triage.ts`'s
`classifyScheduleTheme` is a **fixed-priority decision list over real,
already-computed structured signals** — a `SchedulePhase` row has no
free-text narrative to keyword-score, unlike a RAID item:

1. **Third-Party Dependency Cascades** — the project already has an open
   (non-CLOSED) RAID item of type `DEPENDENCY` at CRITICAL or HIGH
   severity. A real, already-logged blocker, never inferred from dates.
2. **UAT Sign-off Lags** — the Test (UAT, SIT) phase itself has slipped
   (warning or critical severity, via the existing
   `computePhaseSlipDays`).
3. **Resource Contention on Deployment Windows** — the Deploy (Cutover,
   Go-Live) phase has slipped **and** `Project.healthRes` is already
   Amber (the app's existing "delivery team stretched thin" proxy — an
   unassigned PM, or a PM covering 4+ projects). Slip alone on the Deploy
   phase isn't "contention" without that resource signal.
4. **Scope Expansion Slippage** — `Project.healthScope` is already Red
   (an escalated Critical RAID issue, or unscheduled backlog over 10% of
   BAC) — the same signal Financial Realization's Scope Creep Overrun
   theme reads, since it's the same underlying root cause read through a
   different lens.
5. **Other** — at risk by the slip/pace math, but none of the above
   fired.

The first rule that matches wins (fixed priority order), same mechanism
as Financial Realization's classifier.

## 3. One thing this module does differently from Financial Realization

Financial Realization deliberately reads **only** the denormalized EVM
snapshot columns (`Project.bac/actualsCost/vac/healthCost`) rather than
re-running the Decimal-heavy EAC engine across the whole scoped portfolio
on every page load.

This module **does** call the existing schedule calc engine
(`src/lib/calculations/schedule.ts`'s `computePhaseSlipDays` /
`computePhasePace` / `computeScheduleSummary`) live, per scoped project.
That engine is a handful of date-arithmetic comparisons over at most 6
phases per project — cheap enough to run fresh every time — and it's the
same engine `src/lib/executive-triage.ts` already calls for its own
"Behind Schedule" narrative, so every surface in the app agrees on what
counts as slipped.

A second, related design point: a project's Tile 2 membership and RAG
come from the **same per-phase health computation** Tile 1's split uses
(`phaseHealthRag` — the worst of its active phases), not from
`computeScheduleSummary`'s own narrower "worst" field (which only looks
at date-based slip, missing an explicit `DELAYED` status flag or a
pace-only warning on a phase with no `actualEnd` set yet). Gating Tile 2
on the narrower definition would let Tile 1 show Red milestones for a
project Tile 2 calls on-track — the two tiles would visibly disagree.
`computeScheduleSummary` is still used for the `worstSlipDays` figure
shown per cluster item (a real, already-computed number that reconciles
with the per-project schedule view), just never as the at-risk gate
itself.

## 4. The population

**Tile 1's milestone counts and health split span every active (non-
`complete`) `SchedulePhase` row across every scoped project** — a
finished milestone isn't an ongoing risk regardless of how late it
landed, so it's excluded from both the "active milestones" denominator
and the split. **Tile 2's clusters draw only from projects with at least
one active phase at Amber or Red** (`phaseHealthRag`) — a project
tracking clean on every phase has no root cause to surface.

| phaseHealthRag | Meaning |
| --- | --- |
| Red | Explicitly marked `DELAYED`, or a critical-band date slip, or pace-critical (burning >75% of the planned window with <50% complete) |
| Amber | A warning-band date slip, or pace-warning (>50% elapsed, <25% complete) |
| Green | Everything else — on track, not yet started with no dates set, or complete |

## 5. The two tiles

- **Tile 1 — Portfolio Schedule & Milestone Triage**
  (`src/components/modules/schedule/ScheduleTriageHeader.tsx`'s
  `TriageTile`): active-milestone count, upcoming Deploy-phase (Cutover/
  Go-Live) go-lives within the next 30 and 60 calendar days, and a Red/
  Amber/on-track milestone-health split.
- **Tile 2 — Schedule Bottleneck & Risk Clusters** (`ClustersTile`): one
  card per non-empty theme, sorted by **distinct project count first,
  then total slip days** — a theme touching 3 projects outranks a bigger
  single-project slip, the systemic read leadership actually wants. A
  click on a cluster's header expands it inline to the contributing
  projects (every row a real `<Link>` to that project's schedule view —
  fully keyboard/screen-reader accessible); double-clicking a row is a
  power-user shortcut to the identical destination, layered on top via
  `onDoubleClick` + `preventDefault`, never the only way to reach it.

## 6. Data flow

```
src/lib/schedule-triage.ts                    buildScheduleTriage(projects) → ScheduleTriageResult  (pure)
src/server/queries/schedule-triage.ts          loadScheduleTriage(context) — the two queries + adapter
src/app/(dashboard)/schedule/page.tsx          streams ScheduleTriageHeader behind <Suspense>,
                                                the ProjectPicker micro-view stays outside it
src/components/modules/schedule/ScheduleTriageHeader.tsx   the two tiles + expand/drill-down
```

## 7. What was deliberately not built

- **No caching/materialization** — cheap enough (two bounded queries +
  an in-memory pass over ≤6 phases per scoped project) to run fresh on
  every request.
- **No org-policy slip tolerances fetch** — uses the engine's own default
  tolerances (5-day warn / 15-day crit), matching
  `src/lib/executive-triage.ts`'s existing convention rather than
  threading `GovernanceConfig` through for this view specifically.
- **No new theme-editing UI or threshold config** — the theme vocabulary
  is a code-level constant, not a tenant setting.
- **No modal drill-down** — both single- and double-click land on the
  real `/schedule/[projectId]` route, not a modal overlay.
