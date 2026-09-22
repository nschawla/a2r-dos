/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * The PS Orchestration & Decision Engine's option generator
 * (docs/PORTFOLIO_ORCHESTRATION.md) — turns one flagged engagement
 * (src/lib/executive-triage.ts's `TriageItem`/drivers) into 2-3 commercially
 * viable response options, each with a Portfolio Domino & Trade-off preview.
 *
 * Pure — no Prisma, no React. The caller (src/server/queries/decision-context.ts)
 * assembles every real input (client tier, commercial model, a candidate
 * resource swap with real headroom/hours) before calling this; where a real
 * number genuinely isn't computable (e.g. no resource with matching role and
 * spare capacity exists anywhere in the org), the corresponding field is
 * `null` and the option is simply not offered — never fabricated.
 */
import type { TriageDriver } from './executive-triage';

export type OptionKey =
  | 'change_order'
  | 'resource_releveling'
  | 'margin_absorption'
  | 'timeline_extension'
  | 'scope_descope'
  | 'governance_remediation'
  | 'escalate_governance';

/** A real, headroom-having candidate for a Resource Re-leveling / Skill Swap
 * option — assembled by the caller from src/server/queries/capacity.ts's
 * `loadCapacityRows` + a `WeeklyAssignmentSlot` lookup. `roleName` is the
 * `DeliveryRole.name` job-title/rank ("Senior Architect"), the app's real
 * skill-match proxy — there is no separate skills/certification field. */
export interface SwapCandidate {
  resourceId: string;
  resourceName: string;
  roleName: string;
  /** availableHours - billableHours for the resource this period; always > 0. */
  headroomHours: number;
  /** The project that would lose this person's time, if they're currently
   * committed anywhere — null if they're fully on the bench. */
  donorProjectName: string | null;
  /** Real committed hours/week on the donor project, from a
   * WeeklyAssignmentSlot groupBy — null if there is no donor project or the
   * figure genuinely isn't available. */
  donorProjectCommittedHoursPerWeek: number | null;
}

export interface DominoImpact {
  /** Percentage-point effect on this project's margin; null when the option
   * has no margin dimension (e.g. Timeline Extension). */
  marginDeltaPct: number | null;
  affectedProjectName: string | null;
  /** Plain-language note built only from real figures above — never a
   * fabricated precise outcome. */
  affectedProjectNote: string | null;
  /** A heuristic, disclosed as such in the UI — not a precise simulation.
   * Derived from real headroom for a resource-swap option; null when there's
   * no staffing dimension to the option at all. */
  teamVelocityRisk: 'Low' | 'Medium' | 'High' | null;
  requiresApproval: boolean;
  approvalReason: string | null;
}

export interface DecisionOption {
  key: OptionKey;
  label: string;
  summary: string;
  domino: DominoImpact;
}

export interface DecisionOptionsContext {
  drivers: TriageDriver[];
  clientTier: 'STRATEGIC' | 'STANDARD';
  /** Project.commercialModel raw value, e.g. 'FF' | 'TM' | ... */
  commercialModel: string;
  locked: boolean;
  /** Parsed from the TriageItem's own computed financialImpact, e.g. 45000
   * from "$45,000 over budget" — null when the driver carried no $ figure. */
  financialImpactUsd: number | null;
  /** The engagement's Budget at Completion — its overall budgeted size,
   * used as the denominator for a margin-delta %. (The sizing engine's
   * precise contractValue isn't loaded at the triage stage this runs at;
   * BAC is the real figure already in hand and a fair stand-in.) */
  tcv: number;
  /** GovernanceConfig.interventionApprovalThresholdUsd for this tenant. */
  approvalThresholdUsd: number;
  swapCandidate: SwapCandidate | null;
}

const APPROVAL_REASON = (threshold: number) =>
  `Financial impact exceeds $${threshold.toLocaleString('en-US')} — requires Practice Director, Delivery Manager, or Admin approval authority.`;

function requiresApproval(financialImpactUsd: number | null, threshold: number): boolean {
  return financialImpactUsd !== null && Math.abs(financialImpactUsd) > threshold;
}

function velocityRiskFor(candidate: SwapCandidate): 'Low' | 'Medium' | 'High' {
  if (candidate.headroomHours >= 8) return 'Low';
  if (candidate.headroomHours >= 4) return 'Medium';
  return 'High';
}

function changeOrderOption(ctx: DecisionOptionsContext): DecisionOption {
  const approve = requiresApproval(ctx.financialImpactUsd, ctx.approvalThresholdUsd);
  const amount = ctx.financialImpactUsd !== null ? `$${Math.round(Math.abs(ctx.financialImpactUsd)).toLocaleString('en-US')}` : 'the overrun';
  return {
    key: 'change_order',
    label: 'Generate Change Order Draft',
    summary: `Draft a change order to recover ${amount} from the client — pending countersignature, not an immediate cost.`,
    domino: {
      marginDeltaPct: 0,
      affectedProjectName: null,
      affectedProjectNote: 'No other engagement is touched — this is a client-facing commercial instrument, not a staffing move.',
      teamVelocityRisk: null,
      requiresApproval: approve,
      approvalReason: approve ? APPROVAL_REASON(ctx.approvalThresholdUsd) : null,
    },
  };
}

function marginAbsorptionOption(ctx: DecisionOptionsContext): DecisionOption {
  const approve = requiresApproval(ctx.financialImpactUsd, ctx.approvalThresholdUsd);
  const marginDeltaPct =
    ctx.financialImpactUsd !== null && ctx.tcv > 0 ? -Math.round((Math.abs(ctx.financialImpactUsd) / ctx.tcv) * 1000) / 10 : null;
  const amount = ctx.financialImpactUsd !== null ? `$${Math.round(Math.abs(ctx.financialImpactUsd)).toLocaleString('en-US')}` : 'the overrun';
  return {
    key: 'margin_absorption',
    label: 'Internal Margin Absorption',
    summary: `Absorb ${amount} into delivery margin — no client conversation, but the engagement's own profitability takes the hit.`,
    domino: {
      marginDeltaPct,
      affectedProjectName: null,
      affectedProjectNote: null,
      teamVelocityRisk: null,
      requiresApproval: approve,
      approvalReason: approve ? APPROVAL_REASON(ctx.approvalThresholdUsd) : null,
    },
  };
}

function resourceRelevelingOption(ctx: DecisionOptionsContext, candidate: SwapCandidate): DecisionOption {
  const approve = requiresApproval(ctx.financialImpactUsd, ctx.approvalThresholdUsd);
  const note =
    candidate.donorProjectName && candidate.donorProjectCommittedHoursPerWeek !== null
      ? `Pulling ${candidate.resourceName} reduces their availability on ${candidate.donorProjectName}, where they're currently committed ${candidate.donorProjectCommittedHoursPerWeek} hrs/wk.`
      : candidate.donorProjectName
        ? `Pulling ${candidate.resourceName} reduces their availability on ${candidate.donorProjectName}.`
        : `${candidate.resourceName} has ${candidate.headroomHours.toFixed(1)} hrs/wk of headroom this period and isn't currently committed elsewhere.`;
  return {
    key: 'resource_releveling',
    label: 'Resource Re-leveling / Skill Swap',
    summary: `Bring in ${candidate.resourceName} (${candidate.roleName}, ${candidate.headroomHours.toFixed(1)} hrs/wk headroom) to re-level staffing.`,
    domino: {
      marginDeltaPct: null,
      affectedProjectName: candidate.donorProjectName,
      affectedProjectNote: note,
      teamVelocityRisk: velocityRiskFor(candidate),
      requiresApproval: approve,
      approvalReason: approve ? APPROVAL_REASON(ctx.approvalThresholdUsd) : null,
    },
  };
}

function timelineExtensionOption(ctx: DecisionOptionsContext): DecisionOption {
  return {
    key: 'timeline_extension',
    label: 'Request Timeline Extension',
    summary: 'Ask the client for more calendar time rather than compressing scope or adding cost.',
    domino: {
      marginDeltaPct: null,
      affectedProjectName: null,
      affectedProjectNote: 'A client conversation, not a portfolio move — no other engagement is touched.',
      teamVelocityRisk: null,
      requiresApproval: false,
      approvalReason: null,
    },
  };
}

function scopeDescopeOption(): DecisionOption {
  return {
    key: 'scope_descope',
    label: 'Scope Descope',
    summary: 'Trim remaining scope to hit the original date — protects the timeline, costs client goodwill.',
    domino: {
      marginDeltaPct: null,
      affectedProjectName: null,
      affectedProjectNote: 'Reduces remaining cost, but the client relationship — not another project — absorbs the trade-off.',
      teamVelocityRisk: null,
      requiresApproval: false,
      approvalReason: null,
    },
  };
}

function governanceRemediationOption(): DecisionOption {
  return {
    key: 'governance_remediation',
    label: 'Governance Remediation Plan',
    summary: 'Close the outstanding control-audit gaps driving Red status.',
    domino: {
      marginDeltaPct: null,
      affectedProjectName: null,
      affectedProjectNote: null,
      teamVelocityRisk: null,
      requiresApproval: false,
      approvalReason: null,
    },
  };
}

function escalateGovernanceOption(): DecisionOption {
  return {
    key: 'escalate_governance',
    label: 'Escalate to Practice Director',
    summary: 'Flag the compliance gap for Practice Director oversight rather than closing it directly.',
    domino: {
      marginDeltaPct: null,
      affectedProjectName: null,
      affectedProjectNote: null,
      teamVelocityRisk: null,
      requiresApproval: false,
      approvalReason: null,
    },
  };
}

/**
 * 2-3 options, priority Over Budget > Behind Schedule > Governance Red when
 * an engagement carries more than one driver at once — a Resource
 * Re-leveling option only appears when the caller found a real
 * `swapCandidate`; it is never invented to round out the count.
 */
export function buildDecisionOptions(ctx: DecisionOptionsContext): DecisionOption[] {
  const options: DecisionOption[] = [];

  if (ctx.drivers.includes('Over Budget')) {
    options.push(changeOrderOption(ctx));
    if (ctx.swapCandidate) options.push(resourceRelevelingOption(ctx, ctx.swapCandidate));
    options.push(marginAbsorptionOption(ctx));
  } else if (ctx.drivers.includes('Behind Schedule')) {
    options.push(timelineExtensionOption(ctx));
    if (ctx.swapCandidate) options.push(resourceRelevelingOption(ctx, ctx.swapCandidate));
    options.push(scopeDescopeOption());
  } else if (ctx.drivers.includes('Governance Red')) {
    options.push(governanceRemediationOption());
    options.push(escalateGovernanceOption());
  }

  return options.slice(0, 3);
}
