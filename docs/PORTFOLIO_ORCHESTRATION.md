# PS Orchestration & Decision Engine

_Status: shipped in v1.20.0._
_Audience: engineering + delivery leadership._

## 1. Purpose

PS-DOS's Command Center and Portfolio pages already told a viewer *what* was
wrong with a Red/over-budget engagement (the Executive Action Triage feed,
`src/lib/executive-triage.ts`). This work package makes the system take the
next step: for every flagged engagement, it proposes 2-3 real, PS-grounded
response options, shows the trade-off each one costs elsewhere in the
portfolio, and lets an authorized person execute one through a governed,
audit-logged action — turning the app from a passive dashboard into an
orchestration surface.

Three pillars:

1. **Impact-Aware Decision Cards** — the triage narrative, plus a Client
   Strategic Context badge and 2-3 commercially viable options.
2. **Multi-Factor Simulation & Governance Workflow** — a drawer that runs a
   compliance/guardrail check and executes a chosen option in one governed
   step.
3. **Post-Decision Tracking & Orchestration Co-Pilot** — an "Intervention
   Applied" record per project, and an AI assistant that proactively briefs
   a viewer on pending decisions.

## 2. Everything is computed from real data, never fabricated

- **Client Strategic Context** (`Project.clientTier`, `ClientTier` enum
  `STRATEGIC | STANDARD`) — an explicit business classification, the same
  kind of admin-set flag `govProfile` already is (default `STANDARD`; no
  dedicated edit UI exists for `govProfile` either, so none was added here —
  set at creation / directly in `prisma/seed.ts`, consistent with that
  precedent).
- **Skill/role matching** for a Resource Re-leveling option uses
  `Resource.roleId → DeliveryRole.name` (a job title/rank like "Senior
  Architect") — the app's real, existing proxy; there is no separate skills
  or certification catalog. The flagged project's own Delivery Manager's
  role stands in for "the kind of capacity this engagement is short on."
- **Headroom** comes from `loadCapacityRows` (`src/server/queries/capacity.ts`)
  — the same engine the Resource & Capacity Cockpit uses.
- **Donor-project hours** come from a real `WeeklyAssignmentSlot` groupBy —
  the candidate's actual committed hours/week on whichever other project
  they're currently on.
- Where no real substitute with spare capacity exists anywhere in the org,
  the Resource Re-leveling option is simply **not offered** — never
  invented to round out the option count.
- **Margin-delta %** is computed from the real `$` impact already on the
  triage item and the project's Budget at Completion (the sizing engine's
  precise `contractValue` isn't loaded at the triage stage this runs at;
  BAC is the real figure already in hand and a fair stand-in — see the
  `tcv` field's doc comment in `src/lib/decision-options.ts`).
- Disclosed heuristics (team velocity risk, a day estimate) are always
  labeled as such in the UI copy, never presented as a precise simulation.

## 3. The engines

```
src/lib/decision-options.ts       buildDecisionOptions(ctx) → DecisionOption[]  (pure)
src/lib/decision-governance.ts    checkGuardrail(option, ctx) → GuardrailResult (pure)
src/server/queries/decision-context.ts   loadDecisionContext(...) — assembles the real ctx
```

`buildDecisionOptions` picks 2-3 options by driver, priority Over Budget >
Behind Schedule > Governance Red when an engagement carries more than one
driver at once:

| Driver | Options offered |
| --- | --- |
| Over Budget | Generate Change Order Draft, [Resource Re-leveling if a real candidate exists], Internal Margin Absorption |
| Behind Schedule | Request Timeline Extension, [Resource Re-leveling if a real candidate exists], Scope Descope |
| Governance Red (no $ / schedule driver) | Governance Remediation Plan, Escalate to Practice Director |

Every option's `domino.requiresApproval` is `financialImpactUsd >
GovernanceConfig.interventionApprovalThresholdUsd` — tenant-configurable
from the Admin Governance panel (`/admin`, "Decision Card approval
threshold"; default $25,000), not a hardcoded constant.

`checkGuardrail` is run **twice** for every option: once client-side in
`InterventionDrawer` (the same pure function, zero network, an instant
preview) and again, authoritatively, inside
`src/server/actions/portfolio-interventions.ts` before it ever writes a row
— the server never trusts the client's guardrail result. Rules:

- `change_order` is blocked outright if the project's baseline isn't
  locked (`Project.locked`) — you can't amend a baseline that was never
  finalized.
- `change_order` on a Time & Materials engagement gets a **caution**, not a
  block — T&M bills overages directly, so a Change Order may not be the
  right instrument, but the tool doesn't assume that's always true.
- Any option whose `requiresApproval` is true is blocked unless the acting
  user's real `DeliveryRole` holds `project:approve`
  (`src/lib/auth/rbac.ts` — ADMIN, PRACTICE_DIRECTOR, and DELIVERY_MANAGER
  hold it; VP_EXECUTIVE is deliberately read-only in this app's RBAC model
  and does **not**, matching its existing "no edit/admin authority at all"
  design).

## 4. Governance is single-step, not a queue

`[ Submit for Governance Approval & Execute ]` is one action: the server
re-derives the guardrail from freshly-loaded project state and the caller's
real role, and if it passes, executes immediately — no separate
"pending approval" record a different person has to act on later. A
`PortfolioIntervention` row is only ever written once the guardrail has
already passed; there is no status enum on the model because every row
that exists **is** an executed intervention. This was a deliberate scope
decision (confirmed with the product owner before implementation) — a real
multi-person approval inbox would be a materially larger, separate feature.

Every execution:

- writes one `portfolio_interventions` row (composite tenant FK, matching
  every WP1-era model),
- calls `logAuditEvent(..., action: 'INTERVENTION_EXECUTED')` (the classic
  per-project Audit Trail), and
- calls `recordLedgerEvent(..., actionType: 'PORTFOLIO_INTERVENTION_EXECUTED')`
  (the hash-chained Immutable Audit Ledger — `docs/SOC2` / `/admin/audit-log`).

"Was an intervention applied" is always **derived live** from
`PortfolioIntervention` row existence for a project — never a denormalized
boolean on `Project` that could drift out of sync.

## 5. UI

`DecisionCard` (`src/components/command-center/DecisionCard.tsx`) is the
one card component the Portfolio's `DecisionCenter` renders for every
flagged engagement, in both the Overview tab's compact summary and the
Decisions tab's full list (the standalone Command Center that originally
shared this component via its own `ActionTriageFeed` wrapper was retired
in v1.29.0 — see `docs/UI_DESIGN_SYSTEM.md` §9 — the component and its
underlying engine are unchanged). It keeps the existing Cause/Impact/Owner
& Deadline/Required Action grid and evidence link, and adds the Client
Strategic Context badge, the options row, and (once one exists) the
"Intervention Applied" line.

`InterventionDrawer` (`src/components/command-center/InterventionDrawer.tsx`)
is a controlled slide-over drawer matching the app's existing
`AuditTrailDrawer` pattern exactly (`fixed inset-0 z-[100]` backdrop + a
right-hand `aside`) — no fetch-on-open, since the `DecisionOption` is
already server-computed and passed down as a prop.

## 6. The Orchestration Co-Pilot

`src/lib/executive-agent.ts`'s context gains, per flagged engagement, its
real option labels/summaries and whether an intervention has already been
applied (`AgentDecisionSummary`, threaded in by
`src/app/api/assistant/ask/route.ts` via `loadDecisionContext`). The system
prompt instructs the model to lead with how many decisions need the
reader's authority when relevant, and to name real options by label — but
the agent **never** calls `submitPortfolioIntervention` itself or claims to
have executed anything. It only surfaces and guides toward the Decision
Card, preserving the existing "never let the model touch the DB" boundary
and keeping the guardrail-drawer confirmation as the only path to a real
state change. A restricted (non-margin-viewing) user's context omits the
two dollar-bearing options (Change Order, Margin Absorption) the same way
their triage narrative already masks `financialImpact`.

## 7. What was deliberately not built (and why)

- **No separate approval-inbox / pending-approval queue** — see §4.
- **No tenant-configurable per-option rules beyond the $ threshold** — the
  option catalog and its guardrail rules are code, not tenant config;
  revisit if a tenant needs to disable a specific option type.
- **No dedicated `Project.clientTier` edit UI** — mirrors `govProfile`,
  which also has no edit UI in this codebase today (see §2).
- **No per-action DB-integration vitest suite** for
  `submitPortfolioIntervention` — matching this codebase's own existing
  convention for project-scoped mutation actions (e.g. the RAID actions in
  `src/server/actions/raid.ts` have no dedicated vitest DB test either);
  coverage is the pure engines (fully unit-tested) plus e2e Suite L
  (`e2e/enterprise-verification.spec.ts` — renamed from "K" during the
  executive-triage documentation sync to remove a collision with
  `e2e/enterprise-scoping-kpi.spec.ts`'s unrelated Suite K1–K3), which
  exercises the real click-through-execute-verify flow end to end.
