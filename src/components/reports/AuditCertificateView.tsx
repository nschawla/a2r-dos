/**
 * WP7 — the Audit Verification Certificate's render logic. Same
 * string-builder-not-JSX design as SteerCoReportView.tsx, and for the
 * identical reason: this document is opened via `window.open()` outside
 * Next's page-rendering tree and printed straight from the browser, so it
 * needs to be a fully self-contained HTML document with its own inline
 * `<style>` rather than a Tailwind-dependent component. See
 * SteerCoReportView.tsx's doc comment for the full reasoning — this file
 * deliberately duplicates rather than shares that file's small
 * money/esc/date formatting helpers and color palette, because sharing
 * them would couple two documents whose whole point is to each stand
 * alone as a complete, printable artifact.
 */

export interface AuditCertificateControlRow {
  controlKey: string;
  label: string;
  status: 'YES' | 'PARTIAL' | 'NO' | 'NA';
  owner: string | null;
  repoLink: string | null;
  /** AuditEntry.updatedAt — doubles as the "verified at" timestamp per the
   * same WP5 convention AuditChecklist.tsx displays. Null for a control
   * with no logged entry at all yet. */
  verifiedAt: string | null;
}

export interface AuditCertificateProgress {
  pct: number;
  score: number;
  applicable: number;
  counts: { yes: number; partial: number; no: number; na: number };
}

export interface AuditCertificateProps {
  organizationName: string;
  project: { name: string; client: string | null };
  methodologyLabel: string;
  controls: AuditCertificateControlRow[];
  progress: AuditCertificateProgress;
  health: { code: 'G' | 'Y' | 'R'; label: string };
  locked: boolean;
  lockedAt: string | null;
  certificateId: string;
  generatedAt: string;
}

const PALETTE = {
  bg: '#FFFFFF',
  surface1: '#FFFFFF',
  surface2: '#F1F3F6',
  border: '#E1E4EA',
  borderSoft: '#CDD2DB',
  ink: '#18181B',
  inkMuted: '#3F3F46',
  inkFaint: '#52525B',
  accent1: '#0B5FD1',
  accent2: '#0B5FD1',
  success: '#15803D',
  warning: '#B45309',
  critical: '#C81E1E',
  na: '#52525B',
} as const;

const HEALTH_COLOR: Record<'G' | 'Y' | 'R', string> = { G: PALETTE.success, Y: PALETTE.warning, R: PALETTE.critical };
const STATUS_COLOR: Record<AuditCertificateControlRow['status'], string> = {
  YES: PALETTE.success,
  PARTIAL: PALETTE.warning,
  NO: PALETTE.critical,
  NA: PALETTE.na,
};
const STATUS_LABEL: Record<AuditCertificateControlRow['status'], string> = {
  YES: 'Verified',
  PARTIAL: 'Partial',
  NO: 'Not Verified',
  NA: 'N/A',
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
function dateOrDash(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

function scoreRingColor(pct: number): string {
  if (pct >= 80) return PALETTE.success;
  if (pct >= 50) return PALETTE.warning;
  return PALETTE.critical;
}

function controlRowsHtml(controls: AuditCertificateControlRow[]): string {
  return controls
    .map(
      (c) => `
    <tr>
      <td class="ctrl-key">${esc(c.controlKey)}</td>
      <td>${esc(c.label)}</td>
      <td><span class="badge" style="background:${STATUS_COLOR[c.status]}22;color:${STATUS_COLOR[c.status]};border-color:${STATUS_COLOR[c.status]}55;">${STATUS_LABEL[c.status]}</span></td>
      <td>${c.owner ? esc(c.owner) : '<span class="dim">Unassigned</span>'}</td>
      <td>${c.repoLink ? `<span class="evidence">Evidence on file</span>` : '<span class="dim">No evidence link</span>'}</td>
      <td class="dim">${dateOrDash(c.verifiedAt)}</td>
    </tr>`
    )
    .join('');
}

/**
 * Builds the full HTML document for one project's Stage-Gate Audit
 * Verification Certificate — a compliance-review artifact, distinct in
 * tone from the SteerCo Status Deck (a bordered "certificate" frame and a
 * compliance-score seal rather than an executive KPI dashboard), but
 * sharing the same dark brand palette and the same formal confidentiality
 * footer band, since both are documents this app hands to people outside
 * the live delivery team.
 */
export function AuditCertificateView(props: AuditCertificateProps): string {
  const { project, progress, health } = props;
  const healthColor = HEALTH_COLOR[health.code];
  const ringColor = scoreRingColor(progress.pct);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(project.name)} — Audit Verification Certificate</title>
<style>
  @page { size: 1280px 720px; margin: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0; width: 1280px; min-height: 720px; background: ${PALETTE.bg}; color: ${PALETTE.ink};
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif;
    padding: 36px 56px 92px;
    position: relative;
  }
  .frame { position: absolute; inset: 18px; border: 1px solid ${PALETTE.borderSoft}; border-radius: 14px; pointer-events: none; }
  .eyebrow { font-size: 11.5px; letter-spacing: 0.1em; text-transform: uppercase; color: ${PALETTE.accent2}; font-weight: 700; margin-bottom: 6px; text-align: center; }
  h1 { font-size: 25px; margin: 0 0 4px; font-weight: 800; text-align: center; }
  .sub { color: ${PALETTE.inkMuted}; font-size: 13px; margin-bottom: 4px; text-align: center; }
  .cert-id { color: ${PALETTE.inkFaint}; font-size: 10.5px; text-align: center; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; margin-bottom: 20px; }
  .accent-line { height: 3px; width: 72px; border-radius: 2px; background: linear-gradient(90deg, ${PALETTE.accent1}, ${PALETTE.accent2}); margin: 0 auto 16px; }

  .seal-row { display: flex; align-items: center; justify-content: center; gap: 40px; margin: 20px 0 26px; }
  .seal { width: 118px; height: 118px; border-radius: 50%; border: 6px solid ${ringColor}55; display: flex; flex-direction: column; align-items: center; justify-content: center; background: ${ringColor}12; }
  .seal .score { font-size: 30px; font-weight: 800; color: ${ringColor}; line-height: 1; }
  .seal .label { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.04em; color: ${PALETTE.inkFaint}; margin-top: 4px; }
  .seal-meta { font-size: 12.5px; color: ${PALETTE.inkMuted}; line-height: 1.8; }
  .seal-meta strong { color: ${PALETTE.ink}; }
  .health-inline { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; background: ${healthColor}22; color: ${healthColor}; border: 1px solid ${healthColor}55; }
  .health-dot { width: 7px; height: 7px; border-radius: 50%; background: ${healthColor}; }

  table.controls { width: 100%; border-collapse: collapse; font-size: 11.5px; margin-top: 6px; }
  table.controls th { text-align: left; color: ${PALETTE.inkFaint}; text-transform: uppercase; font-size: 9.5px; letter-spacing: 0.04em; font-weight: 700; padding: 6px 10px; border-bottom: 1px solid ${PALETTE.border}; }
  table.controls td { padding: 6.5px 10px; border-bottom: 1px solid ${PALETTE.borderSoft}; color: ${PALETTE.ink}; }
  table.controls td.ctrl-key { color: ${PALETTE.inkFaint}; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10.5px; }
  table.controls td.dim, .dim { color: ${PALETTE.inkFaint}; }
  .evidence { color: ${PALETTE.accent2}; }
  .badge { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; border: 1px solid; border-radius: 999px; padding: 2px 8px; }

  .attest { text-align: center; font-size: 11.5px; color: ${PALETTE.inkMuted}; margin-top: 22px; line-height: 1.6; max-width: 760px; margin-left: auto; margin-right: auto; }

  .footer {
    position: absolute; bottom: 26px; left: 56px; right: 56px; display: flex; justify-content: space-between;
    align-items: center; font-size: 10.5px; color: ${PALETTE.inkFaint}; border-top: 1px solid ${PALETTE.border}; padding-top: 10px;
  }
  .footer .conf { font-weight: 700; color: ${PALETTE.inkMuted}; }
</style>
</head>
<body>
  <div class="frame"></div>
  <div class="accent-line"></div>
  <div class="eyebrow">${esc(props.organizationName)} &middot; Stage-Gate Audit Verification Certificate</div>
  <h1>${esc(project.name)}</h1>
  <div class="sub">${project.client ? esc(project.client) + ' &middot; ' : ''}${esc(props.methodologyLabel)} Methodology &middot; Generated ${esc(props.generatedAt)}</div>
  <div class="cert-id">Certificate ${esc(props.certificateId)}</div>

  <div class="seal-row">
    <div class="seal">
      <div class="score">${progress.pct}%</div>
      <div class="label">Compliant</div>
    </div>
    <div class="seal-meta">
      <div><strong>${progress.counts.yes}</strong> of ${progress.applicable} applicable controls fully verified &middot; <strong>${progress.counts.partial}</strong> partial &middot; <strong>${progress.counts.no}</strong> not verified</div>
      <div>Baseline: <strong>${props.locked ? `Locked ${dateOrDash(props.lockedAt)}` : 'Not locked'}</strong></div>
      <div>Overall Project Health: <span class="health-inline"><span class="health-dot"></span>${esc(health.label)}</span></div>
    </div>
  </div>

  <table class="controls">
    <thead><tr><th>Control</th><th>Requirement</th><th>Status</th><th>Owner</th><th>Evidence</th><th>Verified At</th></tr></thead>
    <tbody>${controlRowsHtml(props.controls)}</tbody>
  </table>

  <p class="attest">
    This certificate reflects the delivery-controls compliance state recorded in A2R Delivery OS for the engagement named
    above as of the generation timestamp below. Weighted compliance credits Verified controls in full, Partial controls at
    half weight, and excludes controls marked N/A from the denominator entirely. It is not a substitute for the underlying
    evidence linked from each control.
  </p>

  <div class="footer">
    <span>A2R Delivery OS &middot; Executive Reporting Hub</span>
    <span class="conf">Confidential &amp; Proprietary &mdash; &copy; 2026 A2R Ventures LLC</span>
  </div>
</body>
</html>`;
}
