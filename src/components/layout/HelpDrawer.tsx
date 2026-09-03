'use client';

import { usePathname } from 'next/navigation';
import { useDashboardUI } from './dashboard-ui-context';

interface HelpSection {
  title: string;
  eyebrow: string;
  body: { heading: string; text: string }[];
}

// Keyed by route prefix — checked in order, first match wins. Content is
// the same governance language used in the module pages themselves (and,
// for the formulas, the calculation engine's own doc comments), so this
// drawer never drifts from what the app actually computes.
const HELP_CONTENT: { prefix: string; section: HelpSection }[] = [
  {
    prefix: '/capacity',
    section: {
      eyebrow: 'Portfolio',
      title: 'Resource & Capacity',
      body: [
        {
          heading: 'Concurrency',
          text: 'Each resource’s concurrency count is how many active (non-parent) engagements they are the Practice Director, Delivery Manager, Project Manager, or a named contributor on. Four or more concurrent engagements flags the resource lens amber on those projects.',
        },
        {
          heading: 'Utilisation',
          text: 'This week’s logged actual hours over the resource’s billable capacity (FTE × 40 × target utilisation %). Over 100% is over-allocation; a run of weeks well under target is available bench.',
        },
        {
          heading: 'Where the numbers come from',
          text: 'The weekly forecast/actual hours are the same WeeklyAssignmentSlot rows that drive each engagement’s Planned vs. Actual burn curve on its Financial Realization page — one source, two views.',
        },
      ],
    },
  },
  {
    prefix: '/audit',
    section: {
      eyebrow: 'Engagement Governance',
      title: 'Control Audit Intake',
      body: [
        {
          heading: 'What the controls cover',
          text: 'Every engagement is governed against the same set of delivery controls, from the commercial & change order baseline through engagement closure — the display label for each adapts to the project’s methodology (waterfall/agile/hybrid), but the underlying control never changes.',
        },
        {
          heading: 'Status and evidence',
          text: 'Each control is Yes (fully evidenced), Partial, No, or N/A. Record an owner and an evidence link for anything other than N/A — the compliance score only credits a control once it has both a status and, ideally, a link a reviewer can actually open.',
        },
        {
          heading: 'How compliance is scored',
          text: 'Weighted: Yes = 1.0, Partial = 0.5, No = 0, N/A is excluded from the denominator entirely. A project locked with ≥80% weighted compliance is Green; locked-but-under-80%, or unlocked-but-≥50%, is Yellow; anything else is Red.',
        },
        {
          heading: 'Governance: Audit Trail',
          text: 'Changing a control’s status (not just its owner or evidence link) writes an AUDIT_SCORE_CHANGED entry to this project’s immutable Audit Trail — open it from the “Audit Trail” button in the header to see who changed what, and when, with a before/after diff.',
        },
      ],
    },
  },
  {
    prefix: '/financials',
    section: {
      eyebrow: 'Engagement Governance',
      title: 'Financial Realization — EAC Engine',
      body: [
        {
          heading: 'True EAC Cost',
          text: 'Actual Cost to Date + (Assigned Forecast Hours × Cost Rate) + (Open Resource Request Hours × Baseline Cost Rate). Forecast hours default to a role’s baseline sold hours until you override them, so an un-forecast role is assumed to still land on its original sizing — not zero.',
        },
        {
          heading: 'Why Open RR hours matter',
          text: 'Open RR (unassigned, not-yet-staffed) hours still cost money at the role’s baseline rate even though no one is charging time to them yet — leaving demand unstaffed doesn’t make it free, it just makes the eventual bill invisible until you account for it here.',
        },
        {
          heading: 'Margin drift',
          text: 'Drift = baseline sold margin % − true EAC margin %. A drift over 0.05pt is classified as erosion, under −0.05pt as upside, and anything in between as on baseline.',
        },
        {
          heading: 'Contractor / 3rd-Party Cost Exposure',
          text: 'The fifth KPI card shows what share of True EAC Cost sits on rate-card roles tagged Contractor/Vendor rather than Employee (FTE) — set per role under Admin & Org Setup → Roles & Rate Card Matrix. Not applicable to Direct Intake–mode projects, which have no per-role breakdown to attribute cost to.',
        },
        {
          heading: 'Importing actuals',
          text: 'Use “Import CSV…” above the table to bulk-load Actual Hours/Cost, Forecast Hours, and Open RR Hours from a spreadsheet export — every row is dry-run validated before anything is written, and a successful import is logged to the Audit Trail as one CSV_IMPORT_COMMITTED entry.',
        },
      ],
    },
  },
  {
    prefix: '/raid',
    section: {
      eyebrow: 'Engagement Governance',
      title: 'RAID Cockpit',
      body: [
        {
          heading: 'Risks, Assumptions, Issues, Dependencies',
          text: 'One board, filterable by type. Each item carries a severity, an impact statement, and a mitigation plan — the mitigation plan is what a reviewer looks for first on anything flagged Critical or High.',
        },
        {
          heading: 'SteerCo escalation',
          text: 'Flag an item for steering-committee visibility to surface it in the header’s notification bell and the command palette’s search results. Escalating or un-escalating an item is logged to the Audit Trail (RAID_ESCALATED / RAID_UNESCALATED) — routine status or detail edits are not.',
        },
        {
          heading: 'Bulk import',
          text: '“Import CSV…” loads a RAID log in bulk — Type, Title, Description, Severity, Impact, Mitigation Plan, Owner (matched by name against the resource directory), Target Date, and Escalate. Rows with an unrecognized owner or an invalid severity are flagged in the preview and skipped, never guessed at.',
        },
      ],
    },
  },
  {
    prefix: '/schedule',
    section: {
      eyebrow: 'Engagement Governance',
      title: 'Schedule & Milestone Burndown',
      body: [
        {
          heading: 'Slip',
          text: 'Slip is the exact calendar-day difference between a phase’s planned end date and its actual end date. It’s classified against the org’s configured warning/critical day thresholds — change those thresholds under Admin & Org Setup, not per-project.',
        },
        {
          heading: 'Pace Risk Detector',
          text: 'Independent of slip: a phase can still be within its planned end date while burning calendar time faster than the logged work is progressing. More than 75% of the planned window elapsed with under 50% complete is Critical Pace Risk; over 50% elapsed with under 25% complete is a Pace Warning.',
        },
        {
          heading: 'Why both checks exist',
          text: 'Slip only fires once a phase actually finishes late. Pace risk is the early-warning signal — it can flag a phase as at-risk weeks before its planned end date arrives.',
        },
      ],
    },
  },
  {
    prefix: '/commercial-baseline',
    section: {
      eyebrow: 'Engagement Governance',
      title: 'Commercial Baseline',
      body: [
        {
          heading: 'Target Margin Modeling',
          text: 'Given the current cost base, the modeler back-solves the services revenue and blended bill rate required to hit an arbitrary target margin: requiredRevenue = cost / (1 − target%). The gap between that and your rate-card-derived baseline revenue shows as a recommended discount (you have headroom) or premium (you need more) versus the sold rate.',
        },
        {
          heading: 'Blended bill rate',
          text: 'Total services revenue ÷ total sold hours, across every role in the Phase-Effort Matrix. It moves with your role mix — more senior-heavy staffing raises it even at unchanged individual rates.',
        },
        {
          heading: 'Baseline locking',
          text: 'Locking a project snapshots its current sizing as the baseline everything else (EAC drift, schedule slip framing) gets compared against. Unlocking clears that snapshot — only Admins, Practice Directors, and Delivery Managers can lock or unlock (checked against your real org role, not the persona switcher). Either direction is logged to the Audit Trail (BASELINE_LOCKED / BASELINE_UNLOCKED).',
        },
        {
          heading: 'Employee (FTE) vs. Contractor / Vendor',
          text: 'Each role header in the Phase-Effort Matrix carries an FTE or Contractor tag, set per role under Admin & Org Setup → Roles & Rate Card Matrix — the same tag drives the Contractor / 3rd-Party Cost Exposure KPI on the Financials tab.',
        },
        {
          heading: 'Bulk import',
          text: '“Import CSV…” above the matrix loads Phase/Role/Hours in bulk from a spreadsheet — every row is validated (recognized phase, a role that exists on this org’s rate card, a non-negative hour value) in a preview before anything is committed.',
        },
      ],
    },
  },
];

// WP6 — explicit '/' entry (previously folded into the generic fallback
// below). Home is common enough, and now carries enough of its own
// governance guidance (Workspace Backup, the Audit Trail), that it earns a
// dedicated section rather than sharing one with "everything unmatched."
const HOME_SECTION: HelpSection = {
  eyebrow: 'A2R Delivery OS',
  title: 'PS Control Tower',
  body: [
    {
      heading: 'Portfolio overview',
      text: 'The portfolio-wide view across every registered engagement in your organization — contract value, sold margin, resource roster, and recent governance activity. Register a new engagement here to seed its scope, schedule, and audit rows automatically.',
    },
    {
      heading: 'Audit Trail',
      text: 'Every project carries its own immutable Audit Trail — open it from the “Audit Trail” button on any Commercial Baseline, Audit, RAID, or Financials page to see baseline locks, EAC actual updates, RAID escalations, and audit score changes, each with a full before/after diff and who made it.',
    },
    {
      heading: 'Workspace Backup & Restore',
      text: 'Under Admin & Org Setup, an org administrator can export this entire tenant — every project, the rate card, the resource directory, and every RAID register — as one JSON file, and restore it back in later. Restoring only ever adds or overwrites what the file describes; it never deletes anything the file doesn’t mention.',
    },
  ],
};

const DEFAULT_SECTION: HelpSection = {
  eyebrow: 'A2R Delivery OS',
  title: 'Guidance',
  body: [
    {
      heading: 'Admin & Org Setup',
      text: 'The enterprise roster every project draws from: functional practices, the rate-card roster (which becomes every project’s Phase-Effort Matrix rows, each tagged Employee/Contractor), the resource directory, governance tolerances, the delivery controls’ display labels, and tenant-wide Workspace Backup & Restore.',
    },
    {
      heading: 'Governance, end to end',
      text: 'CSV ingestion, the Audit Trail, and Workspace Backup & Restore work together as this app’s data-governance layer: bulk changes go through a validated dry-run before they commit, every critical state change is logged immutably, and the whole tenant can be snapshotted and restored on demand.',
    },
  ],
};

function sectionForPath(pathname: string | null): HelpSection {
  if (!pathname) return DEFAULT_SECTION;
  if (pathname === '/') return HOME_SECTION;
  const match = HELP_CONTENT.find((h) => pathname.startsWith(h.prefix));
  return match?.section ?? DEFAULT_SECTION;
}

export function HelpDrawer() {
  const { helpDrawerOpen, closeHelpDrawer, openSupportModal } = useDashboardUI();
  const pathname = usePathname();
  const section = sectionForPath(pathname);

  if (!helpDrawerOpen) return null;

  // WP8 — hand off from "guidance about this page" to "talk to a human":
  // closes this drawer before opening the Support modal rather than
  // stacking the two overlays, since both are full-attention surfaces.
  function handleContactSupport() {
    closeHelpDrawer();
    openSupportModal();
  }

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={closeHelpDrawer} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-surface-1 border-l border-border-soft shadow-elevated overflow-y-auto">
        <div className="sticky top-0 bg-surface-1 border-b border-border px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">{section.eyebrow}</div>
            <h2 className="text-lg font-display font-bold">{section.title}</h2>
          </div>
          <button
            onClick={closeHelpDrawer}
            aria-label="Close help"
            className="w-7 h-7 flex-none rounded-sm border border-border-soft text-ink-muted hover:text-ink hover:border-ink-faint flex items-center justify-center"
            type="button"
          >
            &times;
          </button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-5">
          {section.body.map((b) => (
            <div key={b.heading}>
              <h3 className="text-sm font-semibold mb-1.5">{b.heading}</h3>
              <p className="text-[13px] text-ink-muted leading-relaxed">{b.text}</p>
            </div>
          ))}
        </div>
        <div className="sticky bottom-0 bg-surface-1 border-t border-border px-6 py-4 flex items-center justify-between gap-3">
          <p className="text-[11.5px] text-ink-faint">Didn&rsquo;t find what you needed?</p>
          <button
            type="button"
            onClick={handleContactSupport}
            className="btn-secondary !w-auto px-4 text-xs whitespace-nowrap"
          >
            Contact Support &rarr;
          </button>
        </div>
      </aside>
    </div>
  );
}
