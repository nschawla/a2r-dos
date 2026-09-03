<!--
A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
Proprietary and confidential. Licensed, not sold, under the A2R Delivery OS
Terms of Service & EULA (/terms).
-->

# Admin Self-Serve Quickstart

A 4-step runbook for the first administrator setting up a new A2R Delivery OS™ organization — from signup to the first locked baseline. Written for whoever holds the `OWNER`/`ADMIN` membership role (see `src/lib/auth/rbac.ts`) on a freshly created tenant.

Each step below reflects what the app actually does today, including two known gaps (rate-card bulk import and teammate invitations) called out explicitly rather than glossed over — see **Known gaps** at the end before you plan a real rollout around either.

## Step 1 — Workspace Profile Setup

1. Go to `/register` and create your organization (organization name, your name, email, password). This provisions your tenant and seeds it automatically with a starter roster — the same defaults the original prototype shipped with:
   - Default **Practices** (functional groupings, e.g. "Strategy & Advisory," "Technology Delivery").
   - A default **Rate Card** (`DeliveryRole` roster) with baseline bill/cost rates per role.
   - Default **Org Policy** (schedule slip warning/critical day thresholds, margin-critical threshold, default methodology).
   - The 10 minimum controls' default **display labels** (Waterfall wording).
2. Sign in and open **Admin & Org Setup** (`/admin`) from the sidebar. Review and adjust what the seed gave you:
   - **Practices panel** — rename, add, or remove practices to match your firm's actual structure.
   - **Policy panel** — set `slipWarnDays`/`slipCritDays` (schedule pace-risk thresholds), `marginCritPct`, and your organization's default project methodology (Waterfall/Agile/Hybrid).
   - **Control Labels panel** — override any of the 10 controls' display label per methodology if your firm uses different internal terminology (the underlying control and its weighted-compliance scoring never change, only the label — see the Audit module's Help Drawer section for the full scoring rules).

This step has no gap — it's fully self-serve and takes a few minutes.

## Step 2 — Rate Card Setup

Your rate card (the `DeliveryRole` roster — the rows that populate every project's Phase-Effort Matrix and EAC editor) already has the default roster from Step 1. To make it match your firm's real roles and rates:

1. Open **Admin & Org Setup → Roles & Rate Card Matrix** (`RolesPanel`).
2. For each real role your firm bills (e.g. "Senior Architect," "Delivery Lead," "QA Analyst"), add a row with its name, bill rate, cost rate, home practice, and Employee (FTE) vs. Contractor/Vendor tag (WP6). Remove any seeded default roles you don't use.

> **Known gap — no rate-card CSV importer.** The spec for this guide calls this step "rate card CSV upload," but as of WP8 there isn't one: WP6's CSV ingestion pipeline (`src/lib/ingestion/csv-parsers.ts`) covers three *per-project* imports — the Phase-Effort Matrix, RAID log, and Financial Actuals — not the tenant-wide rate-card roster itself, which has no CSV shape defined anywhere in the schema or parsers. If you're migrating a rate card from an existing spreadsheet today, your two real options are: (a) enter rows manually via the Roles & Rate Card Matrix above (fine for a roster of a few dozen roles), or (b) hand-build a Workspace Backup JSON snapshot (`src/lib/backup/workspace-io.ts`'s schema) with your full roster under `deliveryRoles` and restore it via **Admin & Org Setup → Workspace Backup & Restore** — restore is additive/upsert, so this is safe to run against a live tenant. A dedicated rate-card CSV importer is a reasonable, scoped addition for a future work package; see the README's "What's next."

## Step 3 — Add Team Members

1. Open **Admin & Org Setup → Resources** (`ResourcesPanel`) and add a roster entry for each person on your delivery team: name, email, home rate-card role, and practice. This is what lets someone be assigned as a project's PM/DM/PD, appear in RAID/SteerCo-decision owner pickers, and be counted as a direct report under WP4's Delivery Manager scoping (`Resource.managerId`).

> **Known gap — this is a roster entry, not a login invitation.** Adding someone here (a `Resource` row) does *not* by itself give them a way to sign in. As of WP8, A2R Delivery OS has no self-serve "invite a teammate by email" flow, and `/register` always creates a **brand-new organization** — there is currently no "join an existing organization" signup path at all. The only ways a second real login gets added to your existing tenant today are: (a) that person registers their own separate organization and you accept that they're a different tenant (not what you want for one firm's team), or (b) someone with direct database access creates the `User` + `Membership` rows against your organization by hand — this is exactly how `prisma/seed.ts`'s demo dataset provisions its 5 role-based demo logins. Building a real invite flow (an emailed signup link that creates a `Membership` against a specific, already-existing `Organization`) is the single most-cited gap across this project's own README "What's next" sections since WP4 — plan around it for a real multi-person rollout until it ships.
> Once a person does have a login, link their `Resource` roster entry to it (`Resource.userId`) so `requireOrgContext()` resolves their delivery-role scoping correctly — there's no admin-UI button for this link yet either; it's a direct field on the `Resource` row.

## Step 4 — Initial Baseline Creation

1. From the **PS Control Tower** (`/`), create your first project (name, client, methodology, commercial model).
2. Open it in **Module 1 — Deal Crafting & Sizing** (`/deal/[projectId]`) and size it: either build out the Phase-Effort Matrix role-by-role, or use Direct Baseline Intake (sold hours, target revenue, blended margin) if you're back-filling an already-sold deal. `computeTotalsFor` gives you the live Sold Margin % as you go.
3. Once the sizing reflects what was actually sold/approved, click **Lock Baseline** in the project header (`ProjectHeader.tsx` → `toggleProjectLock`). This snapshots the current `SizingTotals` (including margin %) into `Project.baselineSnapshot` — the fixed reference point every future comparison measures against: the EAC engine's margin-drift classification (Module 4), the project's Green/Yellow/Red health rollup (which requires a locked baseline to ever reach Green), and WP7's Flight Path Variance bar (Sold → **Approved Baseline** → True EAC margin) on the SteerCo Status Deck.
4. From here, the team works the project day to day — Audit control evidence (Module 2), RAID log (Module 3), financial actuals and forecast (Module 4), schedule updates (Module 5) — and you can generate a SteerCo Status Deck, Portfolio Margin Rollup CSV, or Audit Verification Certificate at any time from the **Executive Reporting Hub** (`/reports`, WP7).

This step has no gap — baseline locking has been fully built and working since WP5.

## Known gaps (as of WP8)

- **No rate-card CSV importer** — see Step 2. Manual entry or a Workspace Backup JSON restore are the real paths today.
- **No self-serve teammate invitation flow** — see Step 3. Every login today is either its own separate organization or hand-seeded directly against the database.
- Both gaps are also tracked in the delivered app's own `README.md`, under **What's next (Phase 3b+)** — that section always has the current, authoritative list; check it rather than this doc for the latest status once either ships.

---

Questions about this guide, or anything else, can be raised through the in-app Support &amp; Ticket Submission feature (Help → Contact Support) once you're signed in.
