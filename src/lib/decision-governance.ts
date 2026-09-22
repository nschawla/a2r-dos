/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * The PS Orchestration & Decision Engine's guardrail check
 * (docs/PORTFOLIO_ORCHESTRATION.md) — run twice for every Decision Card
 * option: once client-side in InterventionDrawer for an instant preview
 * (zero network — same pure function), and again, authoritatively, inside
 * src/server/actions/portfolio-interventions.ts before it ever writes a row.
 * The server call never trusts the client's guardrail result.
 *
 * `passed` is a soft signal (a caution the UI shows but doesn't block on);
 * `canExecute` is the hard gate the governance button actually obeys.
 */
import { hasPermission, type DeliveryRole } from './auth/rbac';
import type { DecisionOption } from './decision-options';

export interface GuardrailContext {
  option: DecisionOption;
  /** Project.commercialModel raw value, e.g. 'FF' | 'TM'. */
  commercialModel: string;
  locked: boolean;
  /** The acting user's real, server-verified DeliveryRole. */
  deliveryRole: DeliveryRole;
  approvalThresholdUsd: number;
}

export interface GuardrailResult {
  passed: boolean;
  canExecute: boolean;
  notes: string[];
}

export function checkGuardrail(ctx: GuardrailContext): GuardrailResult {
  const notes: string[] = [];
  let passed = true;
  let canExecute = true;

  if (ctx.option.key === 'change_order') {
    if (!ctx.locked) {
      passed = false;
      canExecute = false;
      notes.push('Baseline must be locked before a Change Order can be drafted against it.');
    } else if (ctx.commercialModel === 'TM') {
      notes.push('T&M engagements bill overages directly — confirm a Change Order is still the right instrument here rather than Margin Absorption.');
    }
  }

  if (ctx.option.domino.requiresApproval && !hasPermission(ctx.deliveryRole, 'project:approve')) {
    passed = false;
    canExecute = false;
    notes.push(ctx.option.domino.approvalReason ?? 'This option requires higher approval authority than your role holds.');
  }

  return { passed, canExecute, notes };
}
