# Resource & Capacity Cockpit Executive Triage & Thematic Clustering

_Status: shipped in v1.24.0._
_Audience: engineering + delivery leadership._

## 1. Purpose

The fourth and final application of the pattern shipped for RAID
(`docs/RAID_EXECUTIVE_TRIAGE.md`), Financial Realization
(`docs/FINANCIAL_REALIZATION_TRIAGE.md`), and Schedule
(`docs/SCHEDULE_MILESTONES_TRIAGE.md`): `/capacity` already had a
portfolio-wide utilization headline (the Utilization tab's own summary
row), but no macro triage read on *where* the org's staffing risk
actually sits — who's burning out, who's spread too thin across
engagements, who's sitting idle. `/capacity` now opens on a dual-tile
Executive Triage banner above its existing four tabs (Utilization &
Attainment, Concurrency Radar, 52-Week Forecast, Policy & Holiday
Controls), which are otherwise unchanged.

## 2. A requested theme that isn't real — read this first

The feature spec asked for a **"Pending Skillset Certification Gaps"**
cluster. PS-DOS has no certification, credential, or skills-tracking data
model anywhere in the schema (`prisma/schema.prisma` — confirmed by
search: the only "certification"-adjacent field in the whole app is an
identity-federation SAML signing certificate, an unrelated concept). Every
other cluster in every triage module this app has shipped buckets data
that's already real and already computed; inventing a plausible-sounding
certification-gap signal here would break that rule for the first time.

**In its place: Bench / Unassigned Capacity** — billable heads carrying
zero active engagements. It's a real, already-computed signal (the exact
one behind Tile 1's own "unassigned headcount" figure), and it reads the
same underlying business story the requested theme was reaching for:
capacity sitting idle while other people are stretched thin elsewhere. If
a real certification/skills model gets added to the schema later, this
theme is a natural candidate to replace or split.

## 3. What "thematic clustering" actually is here

**Deliberately not a live LLM call** — same reasoning as the other three.

Like Financial Realization and Schedule's classifiers,
`src/lib/resource-triage.ts`'s `classifyResourceTheme` is a **fixed-
priority decision list over real, already-computed structured signals** —
a Resource row has no free-text narrative to keyword-score:

1. **Senior / Architect Over-allocation** — the resource is Red (see §4)
   and its rate-card role name (`Resource.role.name` — the same "what kind
   of capacity is this" field `decision-context.ts` already reads for its
   own skill matching) reads senior-tier: Architect, Principal, Director,
   VP, Head of.
2. **Cross-Project Contention for Lead PMs** — Red, and the role name
   reads PM/delivery-management-tier: Project Manager, Program Manager,
   Delivery Manager, Engagement Manager.
3. **Junior / Analyst Under-utilization** — Amber, and the role name reads
   junior-tier: Analyst, Associate, Junior, Coordinator.
4. **Bench / Unassigned Capacity** — Amber, and carrying zero active
   engagements, regardless of role (see §2).
5. **Other** — at risk, but none of the above fired.

## 4. The population — one health check drives both tiles

Same discipline Schedule's `phaseHealthRag` established: Tile 1's 3-way
split and Tile 2's population gate both come from the **same**
`resourceHealthRag` function, so the two tiles can never visibly disagree.
Only billable heads are considered at all — a non-billable role (Director,
Engagement Coordinator) has `utilizationPct` forced to 0 regardless of
real work (see `capacity-engine.ts`), so including them here would read as
universally, falsely "under-utilized."

| resourceHealthRag | Real signal |
| --- | --- |
| Red | `utilizationPct` > 110% of available hours (the spec's literal "severely over-allocated" threshold), **or** already flagged `overloaded` by `capacity-engine.ts`'s own concurrency check (>5 simultaneous engagements) |
| Amber | Neither of the above, and `attainmentPct` (utilization ÷ target) is under 70% |
| Green | Everything else — the optimal band |

## 5. The two tiles

- **Tile 1 — Portfolio Resource & Capacity Triage**
  (`src/components/modules/capacity/ResourceTriageHeader.tsx`'s
  `TriageTile`): blended utilization (computed with the exact same
  hours-weighted formula as `capacity-engine.ts`'s `blendedSummary` — see
  §6 — so it never disagrees with the page's own numbers), unassigned
  headcount, the severely-over-allocated (>110%) count, and a Red/Amber/
  Optimal split.
- **Tile 2 — Allocation Bottleneck & Skill Risk Clusters** (`ClustersTile`):
  one card per non-empty theme, sorted by **distinct project count first,
  then resource count** — a theme touching 3 projects outranks a bigger
  single-project headcount pile, the systemic read leadership actually
  wants. A click on a cluster's header expands it inline to the
  contributing resources.

## 6. Drill-down is a same-page anchor, not a route

Unlike RAID/Financial/Schedule (each cluster member is a project, with its
own `/[module]/[projectId]` route to drill into), a cluster member here is
a **resource**, and `/capacity` has no dedicated per-resource route — the
whole roster already lives in one table, on this same page (the
Utilization tab). So each cluster row is a plain `<a href="#resource-{id}">`
landing on the matching `<tr id="resource-{id}">` `CapacityCockpit.tsx`
already renders — no custom double-click handler needed either, since a
browser's native anchor click already performs that same jump on its own.
This intentionally sidesteps this session's documented same-pathname
client-navigation issue (`docs/UI_DESIGN_SYSTEM.md §5.1`) by using a real
browser anchor instead of a Next.js router transition for what is,
underneath, a pure in-page scroll.

## 7. Data flow

```
src/lib/resource-triage.ts                    buildResourceTriage(resources) → ResourceTriageResult  (pure)
src/server/queries/resource-triage.ts          loadResourceTriage(context) — the queries + adapter
src/app/(dashboard)/capacity/page.tsx          Promise.all's the triage load alongside the existing
                                                heavier Cockpit-data load (concurrent, not serial —
                                                see the file's own comment for why this isn't a
                                                Suspense boundary like the other three)
src/components/modules/capacity/ResourceTriageHeader.tsx   the two tiles
src/components/modules/capacity/CapacityCockpit.tsx        gained `id="resource-{id}"` + `scroll-mt-20`
                                                             on each Utilization-tab row, the anchor target
```

## 8. What was deliberately not built

- **No caching/materialization** — cheap enough (a handful of bounded
  queries + an in-memory pass over the scoped roster) to run fresh on
  every request.
- **No new theme-editing UI or threshold config** — the theme vocabulary
  and the 110%/70% thresholds are code-level constants, not tenant
  settings.
- **No fabricated certification/skills data** — see §2.
- **No per-resource route** — the drill-down is a same-page anchor into
  the existing roster table, not a new page (see §6).
