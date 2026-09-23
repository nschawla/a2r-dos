# Demo Walkthrough Guide — PS-DOS™

_Introduced v1.29.0, alongside the Sidebar Flattening & Command Center
Merge. A presenter-facing, manual click-through script — distinct from
`docs/AUTO_DEMO_SCRIPT.md`, which is the hands-free Auto Demo's voiceover
and production cue sheet for the same underlying tour. Use this document
when **you** are driving the mouse live, in front of a client or
prospect; use the Auto Demo (Ops Console header, `AutoDemoLaunchModal`)
when you want the app to drive itself._

This script mirrors the **current, flattened** UI exactly — no group
headers in the sidebar, no standalone Command Center. If you've given this
demo before v1.29.0, the one thing to unlearn: **don't route to
`/command`** — it now redirects to the PS Control Tower, which is where that
content lives now.

---

## 0. Before you start

- Sign in as `admin@a2rventures-demo.test` (or whichever Client Admin
  account the audience should see) — every module and every write control
  is visible from this seat, which keeps the walkthrough from stalling on
  a permission wall.
- The flagship demo tenant is **Apex Global Services** — if you land on a
  different organization, switch tenants from the header's org switcher
  first.
- Have a second, narrower login ready (e.g. `pm@a2rventures-demo.test`)
  if the audience asks "what does a Project Manager see?" — the Persona
  Preview banner (step 3 below) usually answers this without a re-login.

---

## 1. Landing — the PS Control Tower (`/portfolio`)

This is where everyone lands, always — the sidebar's first item, and
where `/` and every role's default landing route both forward to.

1. **Point out the Command Bar**, pinned above the tabs. Type
   `financials for Global ERP` and hit Enter — it's a live, natural-
   language jump, not a static shortcut list. Come back to `/portfolio`
   afterward.
2. **Overview tab** (the default) — the whole portfolio, above the fold,
   no scrolling: the 4-up KPI strip (engagements in scope, total contract
   value, average baseline margin, high-risk count), the Decision Center
   summary tile, the Blended Billable Utilization card, and — if the
   tenant has any — Program Rollups.
3. **Decisions tab** — click it, or click straight through the Decision
   Center summary tile's "View all →". This is the Impact-Aware Decision
   Cards feed: one card per Red or over-budget engagement, each with a
   real Cause/Impact/Owner & Deadline/Required Action narrative and 2-3
   commercially real response options. Open one option to show the
   governance drawer — the guardrail check, the trade-off preview, the
   single-step "Submit for Governance Approval & Execute" action. This is
   the single best "we're not just a dashboard" moment in the whole demo.
4. **Engagements tab** — the full project registry. Click into any row's
   "Open →" to start the module tour below.
5. **Activity tab** — recent governance actions, for when someone asks
   "how do I know what changed since last week."

---

## 2. The five governance modules, in sidebar order

Reachable from any project via `ProjectHeader`'s module pills — you never
need to bounce back to the sidebar between them.

1. **Commercial Baseline** (`/commercial-baseline/<id>`) — the deal as
   sold: scope, baseline hours, sold margin, rate card, the Lock Baseline
   control. Point out the dual-tile executive triage header at the top —
   portfolio-wide commercial health, then the thematic risk clusters
   (Change Order Exposure, Margin Squeeze, Rate Erosion) below it.
2. **Financial Realization** (`/financials/<id>`) — actuals vs. baseline:
   EAC, margin drift, the burn curve. Same dual-tile pattern at the top.
3. **Schedule & Milestones** (`/schedule/<id>`) — phases, milestone dates,
   pace risk. Same pattern.
4. **RAID Cockpit** (`/raid/<id>`) — the original reference
   implementation of the dual-tile triage pattern every other module now
   shares. Flag an item for SteerCo escalation here to set up the SteerCo
   Briefing demo below.
5. **Resource & Capacity** (`/capacity`) — utilization, the
   concurrency-overload radar, the 52-week staffing forecast. Same
   pattern, plus the "Bench/Unassigned Capacity" theme.

Every one of these five shares the same dual-tile macro-triage + thematic-
cluster header (`docs/EXECUTIVE_TRIAGE_STANDARD.md`) — say so explicitly
once, on the first module, and the audience will recognize the pattern
on every module after without you repeating it.

---

## 3. Reporting & audit

1. **SteerCo Briefing** (`/steerco`) — the lean, board-ready, print-to-PDF
   view. If you escalated a RAID item in step 2.4, it shows up on the
   Watchlist here — a good "nothing is duplicated, everything is live"
   beat.
2. **Executive Hub** (`/reports`) — the full portfolio briefing plus
   per-engagement SteerCo decks and compliance certificates.
3. **Controls Audit** (`/audit/<id>`) — the delivery-controls checklist and
   weighted governance score.

---

## 4. Client Admin controls (pinned footer)

Scroll to the bottom of the sidebar — these two are always reachable,
separate from the day-to-day modules above:

1. **Admin & Org Setup** (`/admin`) — practices, roles & rate card, the
   resource directory, the Enterprise Governance framework (compliance
   templates, module visibility, financial masking), SSO/Identity
   Federation, workspace backup/restore, and the ingestion template hub.
2. **Compliance Ledger** (`/admin/audit-log`) — the tamper-evident,
   hash-chained record of every high-consequence governance action, with
   a live integrity badge. Worth a 10-second pause if the audience
   includes anyone from security/compliance.

**Optional — Persona Preview.** From `/admin` or the banner at the top of
any page, open the Persona Preview switcher and pick a narrower role
(Project Manager, or Practice Director / VP-Professional Services) to
show the sidebar and every write control reshape live, without a
re-login. This is the fastest way to answer "what does role X actually
see" mid-demo.

---

## 5. What NOT to route to

- **`/command`** — retired. It still resolves (redirects to
  `/portfolio`), so a stray click or an old bookmark won't 404 on you,
  but there's nothing to show there anymore — don't navigate to it on
  purpose.
- The three old sidebar group headers (**Portfolio** / **Engagement
  Governance** / **Reporting**) are gone — don't narrate them ("now let's
  move into the Engagement Governance section…"); the sidebar is one flat
  list now, and the workflow story carries itself in the item order.

---

## 6. See also

- `docs/AUTO_DEMO_SCRIPT.md` — the hands-free version of this same tour,
  with exact VO copy and timing, for the Auto Demo player.
- `docs/EXECUTIVE_TRIAGE_STANDARD.md` — the dual-tile pattern referenced
  throughout §2.
- `docs/PORTFOLIO_ORCHESTRATION.md` — the Decision Cards mechanics
  referenced in §1.3.
- `docs/UI_DESIGN_SYSTEM.md` §9 — the Sidebar Flattening & Command Center
  Merge this walkthrough reflects.
