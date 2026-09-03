/**
 * Domain reference data ported 1:1 from the Phase 1/2 static prototype
 * (a2r/index.html — CONTROL_DEFS, PHASES, DEFAULT_PRACTICES, DEFAULT_ROLES,
 * INDUSTRY_ROSTER_PRESETS, DEFAULT_SCOPE). This is reference/catalog data,
 * not tenant data — it seeds new organizations and drives labels in the UI,
 * but organizations may override display labels (see ControlLabel) and
 * fully replace their practice/role roster.
 */

export const PHASES = [
  { key: 'initiate', name: 'Initiate' },
  { key: 'design', name: 'Design' },
  { key: 'build', name: 'Build' },
  { key: 'test', name: 'Test (UAT, SIT)' },
  { key: 'deploy', name: 'Deploy (Cutover, Go-Live)' },
  { key: 'sustain', name: 'Sustain (Hypercare, Warranty)' },
] as const;

export type PhaseKey = (typeof PHASES)[number]['key'];

export type MethodologyKey = 'waterfall' | 'agile' | 'hybrid';

export interface ControlDef {
  id: string;
  labels: Record<MethodologyKey, string>;
  why: string;
  evidence: string;
}

export const CONTROL_DEFS: ControlDef[] = [
  {
    id: 'CTRL_01',
    labels: {
      waterfall: 'Commercial & Change Order Baseline',
      agile: 'Commercial & Backlog Change Baseline',
      hybrid: 'Commercial & Change Order Baseline',
    },
    why: 'Establishes the contractual baseline everything else is measured against. Without it, scope and margin conversations have no anchor.',
    evidence: 'Fully executed SOW plus a running log of every approved change order with value and date.',
  },
  {
    id: 'CTRL_02',
    labels: {
      waterfall: 'Scope & Requirements Baseline',
      agile: 'Product Backlog & Definition of Ready',
      hybrid: 'Scope & Backlog Baseline',
    },
    why: 'Locks down what "done" means before delivery starts, preventing silent scope creep from eroding margin.',
    evidence: 'Approved requirements/scope document or backlog snapshot, version-controlled from kickoff.',
  },
  {
    id: 'CTRL_03',
    labels: {
      waterfall: 'Work Breakdown & Effort Estimate',
      agile: 'Sized Backlog & Velocity Baseline',
      hybrid: 'Work Breakdown & Effort Estimate',
    },
    why: 'Ties the sold price back to an auditable estimate, so realized margin can be explained.',
    evidence: 'Phase-effort matrix or sized backlog used to build the deal economics, retained as the estimate baseline.',
  },
  {
    id: 'CTRL_04',
    labels: {
      waterfall: 'Resource & Capacity Plan',
      agile: 'Team Capacity & Staffing Plan',
      hybrid: 'Resource & Capacity Plan',
    },
    why: 'Confirms the engagement is staffed to the sold effort model. Under-staffing silently converts into missed dates or unbilled overtime.',
    evidence: 'Staffing plan mapped to roles, allocation %, and start/end dates, reconciled monthly against the sold effort model.',
  },
  {
    id: 'CTRL_05',
    labels: {
      waterfall: 'Milestone Schedule & Baseline',
      agile: 'Sprint & Release Burndown',
      hybrid: 'Milestone & Iteration Schedule',
    },
    why: 'Gives leadership an early warning system for slip before it cascades into go-live risk.',
    evidence: 'Current schedule or burndown artifact showing baseline vs. actual dates, refreshed within the policy window.',
  },
  {
    id: 'CTRL_06',
    labels: {
      waterfall: 'Budget & Margin Control',
      agile: 'Velocity-to-Margin Control',
      hybrid: 'Financial & Margin Control',
    },
    why: 'Connects delivery burn to commercial health so margin erosion is caught while it is still recoverable.',
    evidence: 'Actuals-vs-plan cost tracker showing burn rate, forecast-at-completion, and current margin percentage.',
  },
  {
    id: 'CTRL_07',
    labels: {
      waterfall: 'Governance & Steering Cadence',
      agile: 'Sprint Review & Steering Cadence',
      hybrid: 'Governance & Steering Cadence',
    },
    why: 'Keeps executive sponsors informed and decision-ready, preventing surprises at the client relationship level.',
    evidence: 'Steering deck archive and meeting minutes evidencing a consistent cadence with named attendees.',
  },
  {
    id: 'CTRL_08',
    labels: {
      waterfall: 'Quality Assurance & UAT Sign-off',
      agile: 'Definition of Done & UAT Tracker',
      hybrid: 'Quality & UAT Assurance',
    },
    why: 'Confirms the solution is verifiably fit for purpose before cutover, reducing warranty-period defect volume.',
    evidence: 'Test plan with coverage summary and UAT sign-off log by scenario and business owner.',
  },
  {
    id: 'CTRL_09',
    labels: {
      waterfall: 'Deliverable Acceptance Record',
      agile: 'Sprint & Release Acceptance Record',
      hybrid: 'Deliverable Acceptance Record',
    },
    why: "Creates a defensible, dated record that the client formally accepted each deliverable — critical for invoicing and dispute protection.",
    evidence: 'Acceptance log with deliverable name, client signatory, and acceptance date for each milestone.',
  },
  {
    id: 'CTRL_10',
    labels: {
      waterfall: 'Engagement Closure & Lessons Learned',
      agile: 'Retrospective & Closure Record',
      hybrid: 'Closure & Lessons Learned',
    },
    why: 'Captures lessons learned and confirms clean financial and contractual closure, feeding future deal-sizing accuracy.',
    evidence: 'Closure report with final financials, lessons learned, and client sign-off on engagement completion.',
  },
];

export const DEFAULT_PRACTICES = [
  { id: 'tech-integration', name: 'Technical Integration' },
  { id: 'solution-arch', name: 'Solution Architecture' },
  { id: 'core-delivery', name: 'Core Delivery' },
  { id: 'advisory', name: 'Advisory' },
] as const;

export const DEFAULT_ROLES = [
  { id: 'role-pd', name: 'Practice Director', billRate: 310, costRate: 190, practiceId: 'core-delivery' },
  { id: 'role-dm', name: 'Delivery Manager', billRate: 245, costRate: 150, practiceId: 'core-delivery' },
  { id: 'role-pm', name: 'Project Manager', billRate: 210, costRate: 130, practiceId: 'core-delivery' },
  { id: 'role-la', name: 'Lead Architect', billRate: 275, costRate: 170, practiceId: 'solution-arch' },
  { id: 'role-sc', name: 'Senior Consultant', billRate: 195, costRate: 120, practiceId: 'advisory' },
] as const;

export const DEFAULT_SCOPE = [
  { id: 'arch', name: 'Technical Architecture' },
  { id: 'integ', name: 'Integration & Data Migration' },
  { id: 'config', name: 'Core Application Configuration' },
  { id: 'bpr', name: 'Business Process Reengineering' },
  { id: 'cmt', name: 'Change Management & Training' },
] as const;

export const INDUSTRY_ROSTER_PRESETS = {
  si: {
    label: 'Systems Integration / Enterprise IT',
    roles: [
      { name: 'Technical Integration', practice: 'Technical Integration', billRate: 120, costRate: 75 },
      { name: 'Delivery Lead', practice: 'Delivery', billRate: 175, costRate: 108 },
      { name: 'Solution Architect', practice: 'Solution Architecture', billRate: 245, costRate: 150 },
      { name: 'Advisory Principal', practice: 'Advisory', billRate: 310, costRate: 190 },
    ],
  },
  strategy: {
    label: 'Strategy & Management Consulting',
    roles: [
      { name: 'Analyst', practice: 'Business Analysis', billRate: 150, costRate: 95 },
      { name: 'Senior Associate', practice: 'Change Management', billRate: 230, costRate: 145 },
      { name: 'Engagement Lead', practice: 'Operations Consulting', billRate: 340, costRate: 210 },
      { name: 'Principal', practice: 'Corporate Strategy', billRate: 450, costRate: 270 },
    ],
  },
  boutique: {
    label: 'Boutique Software Implementation',
    roles: [
      { name: 'Consultant', practice: 'Client Delivery', billRate: 90, costRate: 56 },
      { name: 'QA Lead', practice: 'Quality Assurance', billRate: 130, costRate: 81 },
      { name: 'Senior Full-Stack Engineer', practice: 'Software Engineering', billRate: 185, costRate: 115 },
      { name: 'Lead Architect', practice: 'Solution Architecture', billRate: 250, costRate: 155 },
    ],
  },
} as const;

export const WORKSTREAM_PHASE_HOURS: Record<string, Record<PhaseKey, number>> = {
  arch: { initiate: 32, design: 80, build: 36, test: 8, deploy: 8, sustain: 4 },
  integ: { initiate: 8, design: 40, build: 160, test: 64, deploy: 24, sustain: 8 },
  config: { initiate: 8, design: 40, build: 160, test: 48, deploy: 8, sustain: 8 },
  bpr: { initiate: 20, design: 76, build: 24, test: 8, deploy: 16, sustain: 4 },
  cmt: { initiate: 8, design: 24, build: 16, test: 8, deploy: 48, sustain: 16 },
};

export const COMPLEXITY_MULT = { low: 0.65, medium: 1, high: 1.5 } as const;

export function getControlDef(controlKey: string): ControlDef | undefined {
  return CONTROL_DEFS.find((c) => c.id === controlKey);
}
