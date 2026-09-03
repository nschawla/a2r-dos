/**
 * WP7 — the SteerCo Status Deck's render logic: a pure function building a
 * complete, self-contained HTML document (inline `<style>`, no external
 * stylesheet) rather than a normal JSX component. This mirrors the
 * pre-existing status-report route's own technique exactly, for a
 * structural reason: this page is opened via `window.open()` in a new tab
 * (see ProjectHeader.tsx's "Export Status Report" button and the Reports
 * Hub's launcher card) and printed straight from the browser's native
 * "Print to PDF" — it never passes through Next.js's page-rendering tree,
 * so none of the app's compiled Tailwind CSS is available to it. A real
 * `<SteerCoReportView />` JSX component built from Tailwind utility
 * classes would render as unstyled HTML the moment it's opened outside
 * the app shell. Keeping this as a `src/components/reports/` file (per
 * the WP7 spec's own path) while having it return a string, not JSX, is
 * this file's answer to that constraint — the API route
 * (src/app/api/projects/[projectId]/status-report/route.ts) is the thin
 * HTTP layer that fetches data and calls this.
 *
 * File extension is still `.tsx` (matching the spec's named path) even
 * though nothing here uses JSX — that's fine; TypeScript treats an empty
 * JSX surface as ordinary TS.
 */

export interface FlightPathViewData {
  soldMarginPct: number;
  baselineMarginPct: number | null;
  eacMarginPct: number;
  baselineToEacDriftPts: number | null;
  soldToEacDriftPts: number;
  status: 'no-baseline' | 'on-track' | 'erosion' | 'upside';
}

export interface OpenDemandViewData {
  openRRHours: number;
  openRRPctOfTotal: number;
  band: 'low' | 'medium' | 'high';
}

export interface ContractorExposureViewData {
  applicable: boolean;
  contractorEacCost: number;
  contractorPct: number;
}

export interface TopRaidRiskViewData {
  id: string;
  typeLabel: string;
  title: string;
  severity: 'CRITICAL' | 'HIGH' | 'MED' | 'LOW';
  mitigationPlan: string | null;
  targetDate: string | null; // ISO or null
}

export interface DecisionTrackerRowViewData {
  id: string;
  decisionRequired: string;
  decisionOwnerName: string | null;
  resolutionTargetDate: string | null; // ISO or null
  status: 'OPEN' | 'RESOLVED';
}

export interface SteerCoReportProps {
  organizationName: string;
  project: { name: string; client: string | null; locked: boolean; lockedAt: string | null };
  health: { code: 'G' | 'Y' | 'R'; label: string };
  contractValue: number;
  eac: { totalActualCost: number; totalEacCost: number; drift: number; status: 'erosion' | 'upside' | 'on-baseline' };
  flightPath: FlightPathViewData;
  openDemand: OpenDemandViewData;
  contractorExposure: ContractorExposureViewData;
  schedule: { worstPace: 'onTrack' | 'warning' | 'critical'; paceCriticalCount: number; paceWarningCount: number };
  topRaidRisks: TopRaidRiskViewData[];
  decisions: DecisionTrackerRowViewData[];
  generatedAt: string; // pre-formatted display string
}

const PALETTE = {
  bg: '#08090B',
  surface1: '#121316',
  surface2: '#191A1E',
  border: '#26262A',
  borderSoft: '#2F2F35',
  ink: '#F5F5F7',
  inkMuted: '#8E8E93',
  inkFaint: '#636369',
  accent1: '#0A84FF',
  accent2: '#0A84FF',
  success: '#30D158',
  warning: '#FF9F0A',
  critical: '#FF453A',
  na: '#8E8E93',
} as const;

const HEALTH_COLOR: Record<'G' | 'Y' | 'R', string> = { G: PALETTE.success, Y: PALETTE.warning, R: PALETTE.critical };
const SEVERITY_COLOR: Record<TopRaidRiskViewData['severity'], string> = {
  CRITICAL: PALETTE.critical,
  HIGH: PALETTE.warning,
  MED: PALETTE.na,
  LOW: PALETTE.na,
};
const PACE_COLOR: Record<'onTrack' | 'warning' | 'critical', string> = {
  onTrack: PALETTE.success,
  warning: PALETTE.warning,
  critical: PALETTE.critical,
};
const PACE_LABEL: Record<'onTrack' | 'warning' | 'critical', string> = {
  onTrack: 'On Pace',
  warning: 'Pace Warning',
  critical: 'Critical Pace Risk',
};
const DEMAND_COLOR: Record<'low' | 'medium' | 'high', string> = { low: PALETTE.success, medium: PALETTE.warning, high: PALETTE.critical };
const FLIGHT_STATUS_LABEL: Record<FlightPathViewData['status'], string> = {
  'no-baseline': 'Not Yet Baselined',
  'on-track': 'On Baseline',
  erosion: 'Margin Erosion',
  upside: 'Margin Upside',
};
const FLIGHT_STATUS_COLOR: Record<FlightPathViewData['status'], string> = {
  'no-baseline': PALETTE.na,
  'on-track': PALETTE.inkMuted,
  erosion: PALETTE.critical,
  upside: PALETTE.success,
};

function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}
function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}
function signedPts(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}pt`;
}
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
function dateOrDash(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

function flightPathBarHtml(fp: FlightPathViewData): string {
  const baselineLabel = fp.baselineMarginPct === null ? 'Not Locked' : pct(fp.baselineMarginPct);
  const driftLabel = fp.baselineToEacDriftPts === null ? 'no baseline to compare' : `${signedPts(-fp.baselineToEacDriftPts)} vs. baseline`;
  return `
  <div class="flightpath">
    <div class="fp-step">
      <div class="fp-label">Sold Margin</div>
      <div class="fp-value">${pct(fp.soldMarginPct)}</div>
    </div>
    <div class="fp-arrow">&rarr;</div>
    <div class="fp-step">
      <div class="fp-label">Approved Baseline</div>
      <div class="fp-value ${fp.baselineMarginPct === null ? 'fp-value-dim' : ''}">${baselineLabel}</div>
    </div>
    <div class="fp-arrow">&rarr;</div>
    <div class="fp-step">
      <div class="fp-label">True EAC Margin</div>
      <div class="fp-value">${pct(fp.eacMarginPct)}</div>
    </div>
    <div class="fp-status" style="color:${FLIGHT_STATUS_COLOR[fp.status]}">
      <span class="fp-status-dot" style="background:${FLIGHT_STATUS_COLOR[fp.status]}"></span>
      ${FLIGHT_STATUS_LABEL[fp.status]} &middot; ${esc(driftLabel)}
    </div>
  </div>`;
}

function openDemandAlertHtml(demand: OpenDemandViewData, contractor: ContractorExposureViewData): string {
  const color = DEMAND_COLOR[demand.band];
  const contractorLine = contractor.applicable
    ? `Contractor / 3rd-party spend currently represents <strong>${pct(contractor.contractorPct)}</strong> of True EAC Cost (${money(contractor.contractorEacCost)}).`
    : `Contractor / 3rd-party exposure is not applicable — this project is in Direct Intake mode.`;
  return `
  <div class="alert-band" style="border-color:${color}55;background:${color}14;">
    <div class="alert-title" style="color:${color}">Open Demand &amp; Contractor Burn Exposure</div>
    <div class="alert-body">
      <strong>${demand.openRRHours.toLocaleString('en-US')} open RR hours</strong> (${pct(demand.openRRPctOfTotal)} of total demand) are sized
      but not yet staffed — unstaffed demand still costs money at baseline rate the moment it's assigned. ${contractorLine}
    </div>
  </div>`;
}

function raidRisksHtml(risks: TopRaidRiskViewData[]): string {
  if (risks.length === 0) {
    return `<p class="empty-note">No SteerCo-escalated RAID items open.</p>`;
  }
  return risks
    .map(
      (r) => `
    <div class="raid-item">
      <div class="raid-item-head">
        <span class="badge" style="background:${SEVERITY_COLOR[r.severity]}22;color:${SEVERITY_COLOR[r.severity]};border-color:${SEVERITY_COLOR[r.severity]}55;">${r.severity}</span>
        <span class="raid-item-type">${esc(r.typeLabel)}</span>
        <span class="raid-item-title">${esc(r.title)}</span>
        ${r.targetDate ? `<span class="raid-item-date">Target ${dateOrDash(r.targetDate)}</span>` : ''}
      </div>
      <div class="raid-item-mit"><span class="raid-item-mit-label">Mitigation:</span> ${r.mitigationPlan ? esc(r.mitigationPlan) : '<em>Not yet documented.</em>'}</div>
    </div>`
    )
    .join('');
}

function decisionTrackerHtml(decisions: DecisionTrackerRowViewData[]): string {
  if (decisions.length === 0) {
    return `<p class="empty-note">No decisions logged for this steering committee cycle.</p>`;
  }
  const rows = decisions
    .map(
      (d) => `
    <tr>
      <td>${esc(d.decisionRequired)}</td>
      <td>${d.decisionOwnerName ? esc(d.decisionOwnerName) : '<span class="dim">Unassigned</span>'}</td>
      <td>${dateOrDash(d.resolutionTargetDate)}</td>
      <td><span class="badge" style="${
        d.status === 'RESOLVED'
          ? `background:${PALETTE.success}22;color:${PALETTE.success};border-color:${PALETTE.success}55;`
          : `background:${PALETTE.warning}22;color:${PALETTE.warning};border-color:${PALETTE.warning}55;`
      }">${d.status === 'RESOLVED' ? 'Resolved' : 'Open'}</span></td>
    </tr>`
    )
    .join('');
  return `
  <table class="decision-table">
    <thead><tr><th>Decision Required</th><th>Decision Owner</th><th>Resolution Target Date</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/**
 * Builds the full HTML document for one project's SteerCo Status Deck.
 * Named `SteerCoReportView` (rather than e.g. `renderSteerCoReportHtml`)
 * to match the WP7 spec's own naming for this deliverable — see the file
 * doc comment above for why it returns a string rather than JSX.
 */
export function SteerCoReportView(props: SteerCoReportProps): string {
  const { project, health, eac } = props;
  const healthColor = HEALTH_COLOR[health.code];
  const paceColor = PACE_COLOR[props.schedule.worstPace];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(project.name)} — SteerCo Status Deck</title>
<style>
  @page { size: 1280px 720px; margin: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0; width: 1280px; min-height: 720px; background: ${PALETTE.bg}; color: ${PALETTE.ink};
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif;
    padding: 40px 56px 96px;
    position: relative;
  }
  .eyebrow { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: ${PALETTE.accent2}; font-weight: 700; margin-bottom: 6px; }
  h1 { font-size: 27px; margin: 0 0 4px; font-weight: 800; }
  .sub { color: ${PALETTE.inkMuted}; font-size: 13px; margin-bottom: 16px; }
  .health {
    display: inline-flex; align-items: center; gap: 8px; padding: 4px 12px; border-radius: 999px;
    font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
    background: ${healthColor}22; color: ${healthColor}; border: 1px solid ${healthColor}55;
  }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: ${healthColor}; }
  .accent-line { height: 4px; width: 56px; border-radius: 2px; background: linear-gradient(90deg, ${PALETTE.accent1}, ${PALETTE.accent2}); margin-bottom: 16px; }
  .section-title { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: ${PALETTE.inkMuted}; font-weight: 700; margin: 18px 0 8px; }

  .flightpath {
    display: flex; align-items: center; gap: 14px; background: ${PALETTE.surface1}; border: 1px solid ${PALETTE.border};
    border-radius: 10px; padding: 16px 20px; margin-top: 6px; flex-wrap: wrap;
  }
  .fp-step { min-width: 128px; }
  .fp-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: ${PALETTE.inkFaint}; font-weight: 700; margin-bottom: 3px; }
  .fp-value { font-size: 21px; font-weight: 800; }
  .fp-value-dim { color: ${PALETTE.inkFaint}; font-size: 15px; }
  .fp-arrow { color: ${PALETTE.inkFaint}; font-size: 18px; }
  .fp-status { margin-left: auto; font-size: 12px; font-weight: 700; display: flex; align-items: center; gap: 6px; }
  .fp-status-dot { width: 7px; height: 7px; border-radius: 50%; }

  .alert-band { border: 1px solid; border-radius: 10px; padding: 12px 18px; margin-top: 10px; }
  .alert-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 800; margin-bottom: 4px; }
  .alert-body { font-size: 12.5px; color: ${PALETTE.ink}; line-height: 1.5; }

  .two-col { display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 18px; margin-top: 4px; }
  .badge { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; border: 1px solid; border-radius: 999px; padding: 2px 8px; }

  .raid-item { background: ${PALETTE.surface1}; border: 1px solid ${PALETTE.border}; border-radius: 8px; padding: 9px 12px; margin-bottom: 7px; }
  .raid-item-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
  .raid-item-type { font-size: 10.5px; color: ${PALETTE.inkFaint}; text-transform: uppercase; letter-spacing: 0.03em; }
  .raid-item-title { font-size: 12.5px; font-weight: 700; }
  .raid-item-date { margin-left: auto; font-size: 10.5px; color: ${PALETTE.inkFaint}; }
  .raid-item-mit { font-size: 11.5px; color: ${PALETTE.inkMuted}; line-height: 1.4; }
  .raid-item-mit-label { color: ${PALETTE.inkFaint}; font-weight: 700; }

  .pace-badge {
    display: inline-flex; align-items: center; gap: 8px; padding: 5px 14px; border-radius: 999px;
    font-size: 12px; font-weight: 700; margin-bottom: 8px;
    background: ${paceColor}22; color: ${paceColor}; border: 1px solid ${paceColor}55;
  }
  .pace-note { font-size: 11.5px; color: ${PALETTE.inkMuted}; }

  .decision-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 4px; }
  .decision-table th { text-align: left; color: ${PALETTE.inkFaint}; text-transform: uppercase; font-size: 10px; letter-spacing: 0.04em; font-weight: 700; padding: 6px 10px; border-bottom: 1px solid ${PALETTE.border}; }
  .decision-table td { padding: 7px 10px; border-bottom: 1px solid ${PALETTE.borderSoft}; color: ${PALETTE.ink}; }
  .decision-table td .dim { color: ${PALETTE.inkFaint}; }

  .empty-note { font-size: 12px; color: ${PALETTE.inkFaint}; font-style: italic; }

  .footer {
    position: absolute; bottom: 26px; left: 56px; right: 56px; display: flex; justify-content: space-between;
    align-items: center; font-size: 10.5px; color: ${PALETTE.inkFaint}; border-top: 1px solid ${PALETTE.border}; padding-top: 10px;
  }
  .footer .conf { font-weight: 700; color: ${PALETTE.inkMuted}; }
</style>
</head>
<body>
  <div class="accent-line"></div>
  <div class="eyebrow">SteerCo Status Deck &middot; ${esc(props.organizationName)}</div>
  <h1>${esc(project.name)}</h1>
  <div class="sub">${project.client ? esc(project.client) + ' &middot; ' : ''}Generated ${esc(props.generatedAt)}</div>
  <span class="health"><span class="dot"></span>${esc(health.label)} Health</span>

  <div class="section-title">Flight Path Variance</div>
  ${flightPathBarHtml(props.flightPath)}

  ${openDemandAlertHtml(props.openDemand, props.contractorExposure)}

  <div class="two-col">
    <div>
      <div class="section-title">Top SteerCo-Escalated RAID Risks</div>
      ${raidRisksHtml(props.topRaidRisks)}
    </div>
    <div>
      <div class="section-title">Schedule Pace Risk</div>
      <span class="pace-badge">${PACE_LABEL[props.schedule.worstPace]}</span>
      <div class="pace-note">${props.schedule.paceCriticalCount} phase(s) at critical pace risk, ${props.schedule.paceWarningCount} at warning &mdash;
      independent of milestone slip, this flags a phase burning calendar time faster than logged progress.</div>
      <div class="section-title">Financial Snapshot</div>
      <div class="pace-note">Actual Cost to Date: <strong style="color:${PALETTE.ink}">${money(eac.totalActualCost)}</strong> &middot;
      True EAC Cost: <strong style="color:${PALETTE.ink}">${money(eac.totalEacCost)}</strong> &middot;
      Contract Value: <strong style="color:${PALETTE.ink}">${money(props.contractValue)}</strong></div>
    </div>
  </div>

  <div class="section-title">SteerCo Decision &amp; Action Tracker</div>
  ${decisionTrackerHtml(props.decisions)}

  <div class="footer">
    <span>A2R Delivery OS &middot; Executive Reporting Hub</span>
    <span class="conf">Confidential &amp; Proprietary &mdash; &copy; 2026 A2R Ventures LLC</span>
  </div>
</body>
</html>`;
}
