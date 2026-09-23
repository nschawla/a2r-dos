# Commercial Baseline Cockpit Executive Triage & Thematic Clustering

_Status: shipped in v1.25.0._
_Audience: engineering + delivery leadership._

## 1. Purpose

The fifth application of the pattern shipped for RAID
(`docs/RAID_EXECUTIVE_TRIAGE.md`), Financial Realization
(`docs/FINANCIAL_REALIZATION_TRIAGE.md`), Schedule
(`docs/SCHEDULE_MILESTONES_TRIAGE.md`), and Resource & Capacity
(`docs/RESOURCE_CAPACITY_TRIAGE.md`): `/commercial-baseline` was a
strictly per-project tool — pick an engagement, see its commercial setup.
There was no portfolio-wide read on where contract and margin risk
actually sat. `/commercial-baseline` now opens on a macro "Executive
Triage" summary first, with the existing per-project picker still one
click away.

## 2. Two things this module does NOT implement as literally specified

The feature spec asked for capabilities PS-DOS's schema doesn't back with
real data. Consistent with every triage module shipped so far, this one
does not fabricate them:

- **"Milestone-based" as a third Commercial Model.** `Project.commercialModel`
  is a two-value enum — `FF` (Fixed Fee) / `TM` (Time & Materials); there
  is no third value in the schema. Tile 1 shows the real 2-way split.
  (A milestone-based billing *schedule* is arguably a payment-timing
  detail within a Fixed Fee contract, not a distinct commercial model in
  this data model — worth a real schema addition if the business
  genuinely needs to track it as its own axis.)
- **"Unsigned Change Orders" / "Contract Status: Fully Executed / Pending
  Change Order / Under Review."** PS-DOS has no e-signature or contract-
  amendment-approval tracking anywhere in the schema (confirmed by
  search — the only certification/signature-adjacent field in the app is
  an unrelated SAML identity-federation signing certificate). The real,
  closest signals this schema actually has:
  - **Change Order activity**: a `PortfolioIntervention` row with
    `optionKey: 'change_order'` — a governed, already-executed decision
    (`src/lib/decision-options.ts`) that a Change Order is the response
    to this engagement's flagged driver. Real and already-computed, but
    it is activity on file, not a signed/unsigned status this app
    tracks — the **Change Order Exposure** theme (§3) is named and
    scoped to that distinction honestly.
  - **Contract status**: `Project.locked` (baseline finalized) vs. not.
    Tile 1 shows this real 2-state split — "Baseline locked" /
    "Draft / under review" — rather than the three fabricated labels the
    spec asked for.

## 3. What "thematic clustering" actually is here

**Deliberately not a live LLM call** — same reasoning as the other four.

Like Financial Realization, Schedule, and Resource & Capacity's
classifiers, `src/lib/commercial-triage.ts`'s `classifyCommercialTheme`
is a **fixed-priority decision list over real, already-computed
structured signals**:

1. **Change Order Exposure** — real Change Order activity is already on
   file for this engagement (§2) — the most concrete, already-logged
   evidence, checked first.
2. **Margin Squeeze on Fixed-Fee Deliverables** — Fixed Fee, and
   `healthCost` isn't Green. Fixed Fee revenue is locked at signing, so
   any cost overrun eats margin directly — there's no re-billing
   recourse the way there is on T&M, which is exactly what makes erosion
   here read as a genuine "squeeze."
3. **Blended Rate Erosion** — T&M, and `healthCost` isn't Green. T&M
   revenue already scales with hours billed, so margin erosion that
   still shows up despite that built-in protection more often reflects
   resource-mix or rate-card drift than a scope problem — a distinct
   commercial story from the Fixed Fee case above, even though both read
   the same underlying `healthCost` signal Financial Realization's own
   triage already surfaces (this module's lens is specifically the
   commercial-model angle on it, not a competing recomputation).
4. **Exceeded Baseline Scope Caps** — `Project.healthScope` is already
   Red (an escalated Critical RAID issue, or unscheduled backlog over
   10% of BAC) — the same real signal Financial Realization's Scope
   Creep Overrun and Schedule's Scope Expansion Slippage themes already
   read, here through the commercial-baseline lens.
5. **Other** — at risk, but none of the above fired.

## 4. The population

**Tile 1's totals (contracted value, active-contract count, locked/draft
split, commercial-model split) span every scoped project.** **Tile 2's
clusters draw only from the at-risk subset**, gated by
`commercialRagFor` — one function driving both the Red/Amber counts and
cluster membership, same discipline every prior triage module has held
to:

| Signal | RAG |
| --- | --- |
| `healthCost` Red | Red |
| `healthCost` Amber, **or** `healthScope` Red, **or** real Change Order activity on file | Amber |
| None of the above | excluded — Green |

A project can be Amber purely on a scope-cap breach or a Change Order
with an otherwise-healthy cost picture — each is a legitimate reason a
commercial reviewer would open the project, even without acute margin
erosion.

Both tiles read the same denormalized EVM snapshot
(`Project.bac`/`actualsCost`/`healthCost`/`healthScope`) Financial
Realization's Tile 1 already reads, rather than re-running the
Decimal-heavy sizing/EAC engine (`computeEacSummary`) across the whole
scoped portfolio on every page load — the same reasoning, applied
consistently.

## 5. The two tiles

- **Tile 1 — Portfolio Commercial & Contract Triage**
  (`src/components/modules/commercial-baseline/CommercialTriageHeader.tsx`'s
  `TriageTile`): total contracted value (BAC) and active-contract count,
  the locked/draft baseline split, a Red/Amber count, and a by-
  commercial-model (Fixed Fee vs. T&M) breakdown with count + BAC each.
- **Tile 2 — Commercial Risk & Margin Leakage Clusters** (`ClustersTile`):
  one card per non-empty theme, sorted by **distinct project count
  first, then total $ variance** — the same tie-break reasoning as every
  prior triage module. A click on a cluster's header expands it inline
  to the contributing projects (every row a real `<Link>` to that
  project's Commercial Baseline — fully keyboard/screen-reader
  accessible); double-clicking a row is a power-user shortcut to the
  identical destination.

## 6. Data flow

```
src/lib/commercial-triage.ts                    buildCommercialTriage(projects) → CommercialTriageResult  (pure)
src/server/queries/commercial-triage.ts         loadCommercialTriage(context) — the two queries + adapter
src/app/(dashboard)/commercial-baseline/page.tsx  streams CommercialTriageHeader behind <Suspense>,
                                                   the ProjectPicker micro-view stays outside it
src/components/modules/commercial-baseline/CommercialTriageHeader.tsx   the two tiles + expand/drill-down
```

## 7. What was deliberately not built

- **No fabricated commercial model or contract-status data** — see §2.
- **No caching/materialization** — cheap enough (two bounded queries + an
  in-memory pass over the scoped project set) to run fresh on every
  request.
- **No new theme-editing UI or threshold config** — the theme vocabulary
  is a code-level constant, not a tenant setting.
- **No modal drill-down** — both single- and double-click land on the
  real `/commercial-baseline/[projectId]` route, not a modal overlay.
