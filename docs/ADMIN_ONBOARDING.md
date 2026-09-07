<!--
A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
Proprietary and confidential. Licensed, not sold, under the A2R Delivery OS
Terms of Service & EULA (/terms).
-->

# Admin Onboarding Package

The setup runbook for the first administrator of a new A2R Delivery OS™
organization — from signup to the first locked baseline, plus the access
model every admin should understand before a real rollout.

**Current as of v1.16.0.** Written for whoever holds the `OWNER` / `ADMIN`
membership role (`src/lib/auth/rbac.ts`) on a freshly created tenant.
Related reading: `docs/ROLE_ACCESS_MATRIX.md` (the full access model),
`docs/SECURITY.md` (security posture), `docs/USER_MANUAL.md` (day-to-day
module use).

Two paths are described:

- **The Onboarding Journey Wizard** (`/admin/onboarding`) — a guided,
  five-phase walkthrough. Use this first.
- **The Admin & Org Setup panels** (`/admin`) — the full, always-available
  reference for everything the wizard touches and more.

Two known gaps (a tenant-wide rate-card CSV importer, and a self-serve
teammate-invite flow) are called out explicitly at the end — read
**Known gaps** before you plan a rollout around either.

---

## 0. The access model (read this first)

A2R Delivery OS has **two independent authorization axes**. As a tenant
admin you own the first; A2R operates the second.

### Tenant axis — your people, your workspace

| Layer | What it controls | Where you set it |
| --- | --- | --- |
| `MembershipRole` | Org / billing tier (`OWNER`, `ADMIN`, `MEMBER`, `VIEWER`) | Seeded on signup / hand-provisioned |
| `DeliveryAccessRole` | Portfolio scope + edit authority (`ADMIN`, `VP_EXECUTIVE`, `PRACTICE_DIRECTOR`, `DELIVERY_MANAGER`, `PROJECT_MANAGER`, `VIEWER`) | Derived from each person's rate-card role; reviewed in the wizard's Role Mapping step |
| RBAC persona | Which navigation / modules render | Automatic, from `DeliveryAccessRole` |
| Row-level scope | Which projects / resources a person can even see | Automatic: global for `ADMIN` / `VP_EXECUTIVE` / `VIEWER`; practice- or assignment-scoped otherwise |

**The `VIEWER` tier (v1.16.0)** is strict read-only: whole-org read of the
portfolio and the SteerCo board, **zero** edit authority anywhere, and
every financial figure scrubbed (cost rates, margins, variance). Use it for
clients, guests, and stakeholders who should observe but never touch.

### Operator axis — A2R's control plane

The `/ops` console is **A2R-internal only**. It is not reachable with any
tenant membership — it needs an explicit, attributed, revocable
`staff_grants` entitlement, and since v1.16.0 that grant carries one of six
least-privilege operator roles. Every privileged operator action also
requires a live, time-boxed Just-In-Time elevation with a second factor
(TOTP). You never manage this axis; it is listed here so you know what
A2R support can and cannot do on your tenant — see
`docs/ROLE_ACCESS_MATRIX.md` § 1 for the full matrix.

---

## 1. Sign up and land in your workspace

1. Go to `/register` and create your organization: **organization name,
   your name, email, password**. The password must be ≥ 12 characters with
   an upper- and lower-case letter and a digit (enforced here and at
   `/change-password`). The sign-in field has a show/hide toggle if you
   want to confirm what you typed.
2. This provisions your tenant and seeds it with a starter roster — the
   same defaults the product ships with:
   - Default **Practices** (e.g. "Strategy & Advisory", "Technology
     Delivery").
   - A default **Rate Card** (`DeliveryRole` roster) with baseline
     bill / cost rates.
   - Default **Org Policy** (schedule slip warning / critical thresholds,
     margin-critical threshold, default methodology).
   - The 10 minimum controls' default **display labels**.
3. You are signed in and taken to `/launch`, which routes you to your
   role's home. Open **Admin & Org Setup** (`/admin`) from the sidebar.

> If you are ever signed in without a membership (e.g. an SSO account that
> hasn't been attached yet), `/onboarding` prompts you to create an
> organization before anything else loads.

---

## 2. Run the Onboarding Journey Wizard (`/admin/onboarding`)

**Admin & Org Setup → Onboarding.** A five-phase guided walkthrough.
Session-local by design — reloading the page starts a fresh run, so it is
safe to re-run for a live walkthrough or a repeated demo.

| # | Phase | What happens | Writes data? |
| --- | --- | --- | --- |
| 1 | **Workspace Provisioning** | Confirms your org is live and shows its tier + creation date. | No |
| 2 | **Governance Template** | Pick a compliance posture — **Standard**, **Strict Financial**, **Agile**, or **Board-Only**. This really calls `applyGovernanceTemplate()` and changes your live configuration (route visibility + financial masking). | **Yes** |
| 3 | **Base Data Ingestion** | Drop in your existing projects / work-orders / resourcing exports. This step runs the same schema-shape check the real Batch Import Engine does but **never writes** — it is a preview of what a migration will look like. | No (preview only) |
| 4 | **Role Mapping** | Review how your roster maps onto A2R Delivery OS access tiers (read-only). Every person's `DeliveryAccessRole` is derived from their rate-card role; change it from **Admin & Org Setup → Roster**. Confirm the mapping — including anyone who should be a **Viewer** — before continuing. | No |
| 5 | **Go-Live Verification** | Confirms every step is complete and drops you into the live workspace. | No |

The wizard is the fastest path to a configured tenant. Step 3's real,
committing counterpart is **Admin & Org Setup → Data Ingestion → Batch
Import**; do the actual data load there once the preview looks right.

---

## 3. Finish setup in Admin & Org Setup (`/admin`)

Everything the wizard touched, plus the rest. Panels:

| Panel | Use it to |
| --- | --- |
| **Functional Practices** | Rename / add / remove practices to match your firm's structure. |
| **Roles & Rate Card Matrix** | Add each real billable role (name, bill rate, cost rate, home practice, FTE vs. Contractor tag). Remove seeded defaults you don't use. |
| **Resources** | Add a roster entry per delivery-team member (name, email, rate-card role, practice). This is what lets someone be a project PM/DM/PD, appear in owner pickers, and be counted under a Delivery Manager's scope. **A roster entry is not a login** — see Known gaps. |
| **Governance Tolerances** (Policy) | Set `slipWarnDays` / `slipCritDays`, `marginCritPct`, and your default methodology. |
| **Delivery Controls & Governance Standards** | Override any of the 10 controls' display label per methodology. The underlying control and its weighted scoring never change — only the label. |
| **Enterprise Governance** | The template from wizard Step 2, plus fine-grained toggles: hide specific modules, and `maskFinancialsForDelivery` (force financial masking for delivery roles tenant-wide). |
| **Workspace Backup & Restore** | Export a full JSON snapshot; restore is additive / upsert, safe against a live tenant. This is also the practical way to bulk-load a rate card today (see Known gaps). |
| **Data Ingestion** | The Self-Service Batch Import Engine (Weekly Actuals, Milestones, Forecast & EAC, Status & RAID) + the canonical intake CSV templates, including a **Delivery Roster** template that matches people to rate-card roles. |

---

## 4. Create your first locked baseline

1. From the **PS Control Tower** (`/portfolio`), create your first project
   (name, client, methodology, commercial model).
2. Open **Module 1 — Deal Crafting & Sizing** (`/deal/[projectId]`) and
   size it: build the Phase-Effort Matrix role-by-role, or use **Direct
   Baseline Intake** (sold hours, target revenue, blended margin) to
   back-fill an already-sold deal. `computeTotalsFor` shows the live Sold
   Margin % as you go — all currency and rate maths are exact-decimal, so
   the number you see is the number that is stored.
3. When the sizing reflects what was actually sold, click **Lock Baseline**
   in the project header. This snapshots `SizingTotals` into
   `Project.baselineSnapshot` — the fixed reference every future comparison
   measures against (EAC margin-drift, the Green/Yellow/Red health rollup,
   the Flight Path Variance bar).
4. From there the team works the project day to day (Audit evidence, RAID,
   financial actuals & forecast, schedule), and you can generate a SteerCo
   Status Deck, Portfolio Margin Rollup, or Audit Verification Certificate
   from the **Executive Reporting Hub** (`/reports`) at any time.

---

## 5. Security posture — what an admin should know

For an enterprise / security review, the points a tenant admin is
responsible for or should be able to speak to:

- **Password policy** is enforced on registration and every change
  (≥ 12 chars, mixed case + digit). A password change is an **atomic
  all-device logout** for that account.
- **SSO** (SAML / OIDC) is available per tenant with metadata verification,
  JIT provisioning, and security-group → role mapping. Once configured for
  a domain, password login is refused for that domain. SSO is set up with
  A2R (Ops Console → Identity Federation).
- **Financial masking** — set `maskFinancialsForDelivery`, or assign the
  **Viewer** tier, and cost / margin / variance figures are scrubbed
  server-side before they ever reach the browser. It is not a CSS hide.
- **Audit log** — `/admin/audit-log` is your tenant's hash-chained,
  tamper-evident ledger of governance-relevant activity. It is immutable
  at the database engine; even A2R's platform role cannot alter a row.
- **Tenant isolation** — your data is separated from every other tenant at
  four independent layers, including database row-level security. A2R
  support can only reach your workspace through a reason-logged,
  time-boxed, read-only impersonation session that is recorded on your
  audit trail.
- **A2R operator access** is least-privilege and second-factor gated (see
  § 0). No A2R operator has standing access to your tenant's data.

---

## Known gaps (as of v1.16.0)

- **No tenant-wide rate-card CSV importer.** The Batch Import Engine and
  the intake templates cover per-project data and a **Delivery Roster**
  (people → roles), but not the tenant-wide rate-card roster itself. To
  migrate a rate card today: enter rows manually via **Roles & Rate Card
  Matrix** (fine for a few dozen roles), or hand-build a Workspace Backup
  JSON with your full roster under `deliveryRoles` and restore it (additive
  / upsert, safe on a live tenant). Tracked in `README.md` → *What's next*.

- **No self-serve teammate-invitation flow for full members.** `/register`
  always creates a **new** organization — there is no "join an existing
  organization" signup path. A second full login against your existing
  tenant is added either by that person registering separately (a different
  tenant — not what you want) or by A2R provisioning the `User` +
  `Membership` directly. This is the single most-cited roadmap item.
  - **Guest / Viewer accounts** *can* be provisioned by A2R quickly via the
    `guests:seed` / `guests:access` tools (roster in
    `scripts/lib/family-guests.ts`) — read-only `VIEWER` memberships against
    an org under a shared password. Ask A2R support if you need stakeholder
    logins before the full invite flow ships.

- Both gaps are tracked in the delivered app's own `README.md` under
  **What's next (Phase 3b+)** — check that section for the current status
  once either ships.

---

Questions about this guide, or anything else, can be raised through the
in-app Support & Ticket Submission feature (Help → Contact Support) once
you're signed in.
