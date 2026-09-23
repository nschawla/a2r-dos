# RAID Cockpit Executive Triage & Thematic Clustering

_Status: shipped in v1.20.x._
_Audience: engineering + delivery leadership._

## 1. Purpose

The RAID Cockpit was a strictly per-project tool: pick an engagement, see its
log. There was no portfolio-wide view of risk at all — a leader had to open
every project's RAID board in turn to know whether the org had a systemic
problem or a handful of isolated ones. `/raid` now opens on a macro
"Executive Triage" summary first, with the existing per-project picker still
one click away for the micro view.

## 2. What "thematic clustering" actually is

**Deliberately not a live LLM call.** `/raid` renders for every RAID-scoped
viewer on every visit, and needs to stay instant regardless of
`ANTHROPIC_API_KEY` configuration — the same reasoning that keeps every other
computed engine in this app (`src/lib/calculations/**`, `executive-triage.ts`)
a pure function, with the Executive Agent (`executive-agent.ts`) as the one
deliberate exception, used only for an on-demand chat interaction, never a
page-load-blocking computation.

`src/lib/raid-triage.ts`'s `classifyRaidTheme` is a deterministic keyword
scorer: it lowercases an item's `title + description + impact`, counts hits
against each theme's known vocabulary (e.g. Resource Bottlenecks:
"understaffed", "overallocated", "backfill", "headcount", …), and assigns the
item to whichever theme scores highest — ties broken by a fixed theme order,
zero matches falling to "Other." This is a real, transparent classification
of real text, not a fabricated grouping — but it is pattern-matching, not
semantic understanding, and it will misclassify or miss a paraphrase a human
reader (or an LLM) would catch. "Other" is not a failure state; it's the
honest answer when nothing matches.

## 3. The population

Both tiles draw from the same set: every **open** (`status != CLOSED`) RAID
item at **CRITICAL, HIGH, or MED** severity, across the viewer's own scoped
projects (`getScopedProjectWhere` — the identical row-level scoping every
other portfolio view in the app already enforces). LOW-severity and closed
items never enter this view at all. Severity maps to RAG as:

| Severity | RAG |
| --- | --- |
| CRITICAL, HIGH | Red |
| MED | Amber |

## 4. The two tiles

- **Tile 1 — Portfolio-Wide Critical Triage** (`src/components/modules/raid/RaidTriageHeader.tsx`'s
  `TriageTile`): total count, a Red/Amber split, and a breakdown by RAID type
  (Risk/Assumption/Issue/Dependency).
- **Tile 2 — Thematic Risk Clusters** (`ClustersTile`): one card per
  non-empty theme, sorted by **distinct project count first, then raw item
  count** — a theme touching 4 projects outranks a bigger pile on a single
  noisy project, since the former is the systemic read leadership actually
  wants. A click on a cluster's header expands it inline to the contributing
  items (every row a real `<Link>` to that project's RAID board — fully
  keyboard/screen-reader accessible); double-clicking a row is a power-user
  shortcut to the identical destination, layered on top via `onDoubleClick`
  + `preventDefault`, never the only way to reach it.

## 5. Data flow

```
src/lib/raid-triage.ts                    buildRaidTriage(items) → RaidTriageResult  (pure)
src/server/queries/raid-triage.ts         loadRaidTriage(context) — the one query + adapter
src/app/(dashboard)/raid/page.tsx         streams RaidTriageHeader behind <Suspense>,
                                           the ProjectPicker micro-view stays outside it
                                           (fast, scoped project list — no reason to wait
                                           on the triage aggregation)
src/components/modules/raid/RaidTriageHeader.tsx   the two tiles + expand/drill-down
```

## 6. What was deliberately not built

- **No caching/materialization of the classification** — it's cheap enough
  (in-memory keyword scoring over however many open Red/Amber items the
  viewer's scope has, typically a few dozen at most) to run fresh on every
  request; a stale cache would be a worse trade than the near-zero compute
  cost.
- **No new theme-editing UI** — the theme vocabulary is a code-level
  constant (`THEME_KEYWORDS`), not a tenant setting. Revisit if a tenant
  needs a custom taxonomy.
- **No modal drill-down** — both single- and double-click land on the real
  `/raid/[projectId]` route (consistent with every other "evidence" link in
  the app), not a modal overlay.
