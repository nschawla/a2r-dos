/**
 * Methodology Playbook — structured guidance for every delivery control.
 *
 * Keyed by the frozen system key (`CTRL_01`…`CTRL_10`, same ids as
 * `CONTROL_DEFS` in src/lib/constants.ts). This is the "what good looks
 * like" reference behind the audit views' info drawer and the standalone
 * `/methodology` reference — the display *label* for a control is
 * org-overridable (see ControlLabel), but this guidance is the fixed A2R
 * delivery standard and never changes per tenant.
 */
import { CONTROL_DEFS } from '@/lib/constants';

/** Where in the engagement lifecycle a control is primarily established / evidenced. */
export type LifecycleGate =
  | 'Phase 0 — Initiation'
  | 'Mobilization'
  | 'In-Flight'
  | 'Deployment Gate'
  | 'Closure';

export interface ControlGuidance {
  /** system key — CTRL_01 … CTRL_10 */
  key: string;
  /** what this control exists to achieve */
  objective: string;
  /** the concrete artifacts a reviewer expects to see linked as evidence */
  requiredArtifacts: string[];
  /** primary lifecycle gate, plus any secondary window it stays live in */
  lifecycleGate: LifecycleGate;
  lifecycleNote: string;
  /** standard pass criteria — a reviewer ticks each of these */
  verificationCriteria: string[];
  /** the most common way this control is marked Partial rather than Yes */
  commonGap: string;
}

export const CONTROL_GUIDANCE: Record<string, ControlGuidance> = {
  CTRL_01: {
    key: 'CTRL_01',
    objective:
      'Establish the single contractual baseline — price, scope of services, and commercial terms — that every downstream margin, scope, and change conversation is measured against.',
    requiredArtifacts: [
      'Fully executed SOW / MSA (signed PDF)',
      'Running change-order log with value, description, and approval date per entry',
      'Signed copies of every executed change order',
    ],
    lifecycleGate: 'Phase 0 — Initiation',
    lifecycleNote: 'Set before mobilization; the change-order log stays live for the whole engagement.',
    verificationCriteria: [
      'Executed SOW is countersigned by both parties and dated',
      'Contract value in the tool matches the executed SOW plus approved change orders',
      'Every change order in the log has a value, a date, and a named approver',
      'No delivery work is being performed against verbal or email-only scope changes',
    ],
    commonGap: 'Work has started against a change that is agreed in principle but not yet countersigned.',
  },
  CTRL_02: {
    key: 'CTRL_02',
    objective:
      'Lock down what "done" means before delivery begins, so scope creep is visible as a deliberate change rather than silent margin erosion.',
    requiredArtifacts: [
      'Approved requirements / scope specification, or a dated product-backlog snapshot',
      'Version history or a change log showing the baseline and each revision',
      'Sign-off record from the client scope owner',
    ],
    lifecycleGate: 'Phase 0 — Initiation',
    lifecycleNote: 'Baselined at kickoff; re-baselined only through a change order.',
    verificationCriteria: [
      'A scope/requirements artifact exists and is version-controlled',
      'The client scope owner has formally accepted the baseline',
      'In-scope vs. out-of-scope boundaries are explicit, not implied',
      'For agile engagements, a Definition of Ready governs backlog entry',
    ],
    commonGap: 'The scope doc exists but was never formally accepted by the client, so its authority is disputable.',
  },
  CTRL_03: {
    key: 'CTRL_03',
    objective:
      'Tie the sold price back to an auditable bottom-up estimate so realized margin can always be explained against a plan.',
    requiredArtifacts: [
      'Phase-effort matrix or sized backlog used to build the deal economics',
      'Estimate baseline retained as sold (rates, hours, contingency, blended margin)',
      'Assumptions register the estimate depends on',
    ],
    lifecycleGate: 'Phase 0 — Initiation',
    lifecycleNote: 'Frozen at baseline lock; the live estimate diverges from it and the delta is the story.',
    verificationCriteria: [
      'A sizing artifact exists and reconciles to the sold contract value',
      'The estimate baseline is locked (baselineSnapshot present) once the deal is signed',
      'Contingency and blended-margin assumptions are documented',
      'Estimate assumptions are tracked and revisited at each stage gate',
    ],
    commonGap: 'The baseline was never locked, so margin-drift and EAC comparisons have nothing to measure against.',
  },
  CTRL_04: {
    key: 'CTRL_04',
    objective:
      'Confirm the engagement is actually staffed to the sold effort model — under-staffing silently converts into missed dates or unbilled overtime.',
    requiredArtifacts: [
      'Staffing plan mapped to roles, allocation %, and start/end dates',
      'Named-resource assignments against the plan',
      'Monthly reconciliation of planned vs. actual staffing',
    ],
    lifecycleGate: 'Mobilization',
    lifecycleNote: 'Established during mobilization; reconciled monthly against the sold effort model.',
    verificationCriteria: [
      'Every planned role has a named resource or a dated open requisition',
      'Total planned allocation matches the sold effort model within tolerance',
      'Key roles have identified backups for continuity',
      'The plan has been reconciled to actuals within the last month',
    ],
    commonGap: 'Open roles are carried as "TBD" for weeks with no requisition date, quietly pushing the schedule.',
  },
  CTRL_05: {
    key: 'CTRL_05',
    objective:
      'Give leadership an early-warning system for slip before it cascades into go-live risk.',
    requiredArtifacts: [
      'Current milestone schedule or sprint/release burndown',
      'Baseline vs. actual/forecast dates per phase',
      'Slip and pace-risk commentary refreshed within the policy window',
    ],
    lifecycleGate: 'In-Flight',
    lifecycleNote: 'Baselined at planning; refreshed on the org’s configured cadence for the whole delivery.',
    verificationCriteria: [
      'A schedule/burndown artifact exists with baseline and actual/forecast dates',
      'It was refreshed within the org’s configured staleness window',
      'Each phase has a status and a % complete',
      'Any critical pace-risk or slip has a documented recovery action',
    ],
    commonGap: 'The schedule is maintained but hasn’t been refreshed since the last steering meeting.',
  },
  CTRL_06: {
    key: 'CTRL_06',
    objective:
      'Connect delivery burn to commercial health so margin erosion is caught while it is still recoverable.',
    requiredArtifacts: [
      'Actuals-vs-plan cost tracker (burn rate, forecast-at-completion)',
      'Current EAC and margin % against the baseline',
      'Margin-drift commentary and, where below floor, a recovery plan',
    ],
    lifecycleGate: 'In-Flight',
    lifecycleNote: 'Updated every reporting period once actuals begin to accrue.',
    verificationCriteria: [
      'Actual cost to date is captured against the plan',
      'A forecast-at-completion (EAC) is maintained, not just actuals',
      'Current margin is compared to the sold baseline margin',
      'Margin below the org’s critical threshold has an owned recovery plan',
    ],
    commonGap: 'Actuals are tracked but no forward EAC is maintained, so erosion is only seen after the fact.',
  },
  CTRL_07: {
    key: 'CTRL_07',
    objective:
      'Keep executive sponsors informed and decision-ready, preventing surprises at the client-relationship level.',
    requiredArtifacts: [
      'Steering deck archive (one per session)',
      'Meeting minutes with attendees, decisions, and actions',
      'Decision & action log tracked to closure',
    ],
    lifecycleGate: 'In-Flight',
    lifecycleNote: 'Runs on a fixed cadence from mobilization through closeout.',
    verificationCriteria: [
      'Steering sessions are occurring on the agreed cadence',
      'Each session has an archived deck and minutes',
      'Named executive sponsors from both sides are attending',
      'Decisions and actions are logged and tracked to closure',
    ],
    commonGap: 'Sessions happen but decisions aren’t captured in a durable log, so they get re-litigated later.',
  },
  CTRL_08: {
    key: 'CTRL_08',
    objective:
      'Confirm the solution is verifiably fit for purpose before cutover, reducing warranty-period defect volume.',
    requiredArtifacts: [
      'Test plan with coverage summary (or an agreed Definition of Done)',
      'UAT execution log by scenario and business owner',
      'Formal UAT sign-off record',
    ],
    lifecycleGate: 'Deployment Gate',
    lifecycleNote: 'Executed in the run-up to cutover; sign-off is a hard gate for go-live.',
    verificationCriteria: [
      'A test plan or Definition of Done exists and maps to the scope baseline',
      'UAT scenarios are executed and results recorded',
      'Open defects are triaged with a severity and a go/no-go call',
      'Business owners have signed off on UAT completion',
    ],
    commonGap: 'UAT is “complete” but sign-off is verbal, and a handful of medium defects were never formally accepted.',
  },
  CTRL_09: {
    key: 'CTRL_09',
    objective:
      'Create a defensible, dated record that the client formally accepted each deliverable — critical for invoicing and dispute protection.',
    requiredArtifacts: [
      'Acceptance log with deliverable name, client signatory, and acceptance date',
      'Signed acceptance certificates per milestone',
      'Link from each acceptance to its billing event',
    ],
    lifecycleGate: 'In-Flight',
    lifecycleNote: 'Populated at each milestone; the last entries fall in closure.',
    verificationCriteria: [
      'Every billable milestone has a dated acceptance entry',
      'Each acceptance names a client signatory with authority',
      'Acceptances reconcile to what was actually invoiced',
      'No deliverable has been invoiced without a corresponding acceptance',
    ],
    commonGap: 'Deliverables were emailed and "assumed accepted" after silence, with no explicit sign-off on file.',
  },
  CTRL_10: {
    key: 'CTRL_10',
    objective:
      'Capture lessons learned and confirm clean financial and contractual closure, feeding future deal-sizing accuracy.',
    requiredArtifacts: [
      'Closure report with final financials vs. baseline',
      'Lessons-learned / retrospective record',
      'Client sign-off on engagement completion',
    ],
    lifecycleGate: 'Closure',
    lifecycleNote: 'Completed within the closure window after the last deliverable is accepted.',
    verificationCriteria: [
      'Final actuals, EAC, and realized margin are reconciled and recorded',
      'All change orders and acceptances are closed out',
      'A lessons-learned session was held and documented',
      'The client has signed off that the engagement is complete',
    ],
    commonGap: 'The engagement wound down operationally but was never formally closed, leaving financials open for months.',
  },
};

export interface ControlGuidanceView extends ControlGuidance {
  /** the default methodology label (waterfall) from CONTROL_DEFS */
  defaultLabel: string;
  /** short "why it matters" line from CONTROL_DEFS */
  why: string;
  /** evidence one-liner from CONTROL_DEFS */
  evidenceSummary: string;
}

/** Guidance for one control, merged with its CONTROL_DEFS metadata. */
export function getControlGuidance(key: string): ControlGuidanceView | undefined {
  const g = CONTROL_GUIDANCE[key];
  const def = CONTROL_DEFS.find((c) => c.id === key);
  if (!g || !def) return undefined;
  return {
    ...g,
    defaultLabel: def.labels.waterfall,
    why: def.why,
    evidenceSummary: def.evidence,
  };
}

/** The full playbook, in CTRL_01…CTRL_10 order. */
export function getMethodologyPlaybook(): ControlGuidanceView[] {
  return CONTROL_DEFS.map((c) => getControlGuidance(c.id)).filter(
    (g): g is ControlGuidanceView => g !== undefined
  );
}

export const LIFECYCLE_GATE_ORDER: LifecycleGate[] = [
  'Phase 0 — Initiation',
  'Mobilization',
  'In-Flight',
  'Deployment Gate',
  'Closure',
];
