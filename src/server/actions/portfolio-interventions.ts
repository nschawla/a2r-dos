'use server';

/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * PS Orchestration & Decision Engine — the single-step governance action
 * behind a Decision Card's [ Submit for Governance Approval & Execute ]
 * button (docs/PORTFOLIO_ORCHESTRATION.md). Follows the same convention as
 * src/server/actions/raid.ts's `toggleRaidEscalation`: z.strictObject input,
 * `authorizeProjectEdit` for base project-edit authority, `withAction`.
 *
 * There is no separate "pending approval" queue — the guardrail check
 * (src/lib/decision-governance.ts) IS the approval: it re-derives, from the
 * project's own real state and the caller's real DeliveryRole, whether this
 * option is executable right now. The client's own guardrail preview
 * (shown in InterventionDrawer) is never trusted — this action reruns it
 * from scratch against freshly-loaded data, and writes nothing at all if it
 * fails.
 */
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { withAction } from '@/lib/observability/action-wrapper';
import { withTenantTx } from '@/lib/db/with-tenant-tx';
import { authorizeProjectEdit } from '@/server/authz';
import { logAuditEvent } from '@/lib/audit/logger';
import { recordLedgerEvent } from '@/lib/audit-ledger';
import { checkGuardrail } from '@/lib/decision-governance';
import type { DecisionOption, OptionKey } from '@/lib/decision-options';
import type { ActionResult } from './auth';

const dominoSchema = z.object({
  marginDeltaPct: z.number().nullable(),
  affectedProjectName: z.string().nullable(),
  affectedProjectNote: z.string().nullable(),
  teamVelocityRisk: z.enum(['Low', 'Medium', 'High']).nullable(),
  requiresApproval: z.boolean(),
  approvalReason: z.string().nullable(),
});

const submitSchema = z.strictObject({
  projectId: z.string().min(1),
  driver: z.string().min(1).max(200),
  optionKey: z.enum([
    'change_order',
    'resource_releveling',
    'margin_absorption',
    'timeline_extension',
    'scope_descope',
    'governance_remediation',
    'escalate_governance',
  ]),
  optionLabel: z.string().min(1).max(200),
  /** The option's own summary, optionally followed by the user's free-text
   * note — kept as one field so the record reads as a single rationale. */
  rationale: z.string().min(1).max(2000),
  domino: dominoSchema,
  financialImpactUsd: z.number().nullable(),
});

export const submitPortfolioIntervention = withAction(
  'submitPortfolioIntervention',
  async (input: unknown): Promise<ActionResult> => {
    const parsed = submitSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
    const { projectId, driver, optionKey, optionLabel, rationale, domino, financialImpactUsd } = parsed.data;

    const auth = await authorizeProjectEdit(projectId);
    if (!auth.ok) return { ok: false, error: auth.error };
    const { context } = auth;

    const project = await db.project.findFirst({
      where: { id: projectId, organizationId: context.organizationId },
      select: { name: true, commercialModel: true, locked: true },
    });
    if (!project) return { ok: false, error: 'Project not found.' };

    // Server re-derives the guardrail from freshly-loaded state and the
    // caller's real role — the client's own preview is informational only.
    const option: DecisionOption = { key: optionKey as OptionKey, label: optionLabel, summary: rationale, domino };
    const guardrail = checkGuardrail({
      option,
      commercialModel: project.commercialModel,
      locked: project.locked,
      deliveryRole: context.deliveryRole,
      approvalThresholdUsd: context.governance.interventionApprovalThresholdUsd,
    });
    if (!guardrail.canExecute) {
      return { ok: false, error: guardrail.notes.join(' ') || 'This option cannot be executed right now.' };
    }

    const decidedByName = context.session.user.name ?? context.session.user.email ?? 'Unknown';

    await withTenantTx(async (tx) => {
      const created = await tx.portfolioIntervention.create({
        data: {
          organizationId: context.organizationId,
          projectId,
          driver,
          optionKey,
          optionLabel,
          rationale,
          domino,
          guardrailPassed: guardrail.passed,
          guardrailNotes: guardrail.notes.join(' '),
          financialImpactUsd,
          decidedById: context.resourceId ?? null,
          decidedByName,
        },
      });

      await logAuditEvent(tx, {
        organizationId: context.organizationId,
        projectId,
        userId: context.userId,
        action: 'INTERVENTION_EXECUTED',
        entityType: 'PROJECT',
        entityId: projectId,
        previousState: null,
        newState: { optionKey, optionLabel, driver },
      });

      await recordLedgerEvent(tx, {
        organizationId: context.organizationId,
        actorId: context.userId,
        actionType: 'PORTFOLIO_INTERVENTION_EXECUTED',
        targetResource: `Project:${projectId}`,
        metadata: {
          projectName: project.name,
          driver,
          optionKey,
          optionLabel,
          financialImpactUsd,
          guardrailPassed: guardrail.passed,
          guardrailNotes: guardrail.notes,
          domino,
          interventionId: created.id,
        },
      });
    });

    revalidatePath('/command');
    revalidatePath('/portfolio');
    revalidatePath(`/raid/${projectId}`);
    revalidatePath(`/audit/${projectId}`);
    revalidatePath(`/financials/${projectId}`);
    revalidatePath(`/schedule/${projectId}`);
    revalidatePath(`/commercial-baseline/${projectId}`);
    return { ok: true };
  }
);
