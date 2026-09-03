'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { requireOrgContext } from '@/lib/session';
import { recordLedgerEvent } from '@/lib/audit-ledger';
import {
  GOVERNANCE_TEMPLATES,
  HIDEABLE_MODULES,
  applyTemplate,
  isGovernanceTemplateKey,
  resolveStoredGovernance,
  withOverrides,
  type GovernanceTemplateKey,
} from '@/lib/governance/config';
import type { ActionResult } from './auth';

async function requireAdmin() {
  const ctx = await requireOrgContext();
  if (ctx.role !== 'OWNER' && ctx.role !== 'ADMIN') {
    throw new Error('Only org owners/admins can change org setup.');
  }
  return ctx;
}

// ---------------------------------------------------------------- Practices

const practiceSchema = z.object({ name: z.string().min(1).max(120) });

export async function createPractice(input: unknown): Promise<ActionResult> {
  const { organizationId } = await requireAdmin();
  const parsed = practiceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  await db.practice.create({ data: { organizationId, name: parsed.data.name } });
  revalidatePath('/admin');
  return { ok: true };
}

export async function deletePractice(id: string): Promise<ActionResult> {
  const { organizationId } = await requireAdmin();
  await db.practice.deleteMany({ where: { id, organizationId } });
  revalidatePath('/admin');
  return { ok: true };
}

// -------------------------------------------------------------- Rate roles

const roleSchema = z.object({
  name: z.string().min(1).max(120),
  billRate: z.coerce.number().min(0),
  costRate: z.coerce.number().min(0),
  practiceId: z.string().optional().or(z.literal('')),
  // WP6 — Employee (FTE) vs. Contractor/Vendor classification. Defaults to
  // FTE (matching the schema default) so pre-WP6 callers of this action
  // that don't send the field still create a valid role.
  employmentType: z.enum(['FTE', 'CONTRACTOR']).optional(),
});

export async function createDeliveryRole(input: unknown): Promise<ActionResult> {
  const { organizationId, userId } = await requireAdmin();
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const { name, billRate, costRate, practiceId, employmentType } = parsed.data;

  const created = await db.deliveryRole.create({
    data: { organizationId, name, billRate, costRate, practiceId: practiceId || null, employmentType: employmentType ?? 'FTE' },
  });
  // Rate-card = the sensitive financial config the data-masking layer protects.
  await recordLedgerEvent(db, {
    organizationId,
    actorId: userId,
    actionType: 'SECURITY_CONFIG_CHANGE',
    targetResource: `DeliveryRole:${created.id}`,
    metadata: { op: 'create-rate-card-role', name, billRate, costRate, employmentType: employmentType ?? 'FTE' },
  });
  revalidatePath('/admin');
  revalidatePath('/admin/audit-log');
  return { ok: true };
}

export async function deleteDeliveryRole(id: string): Promise<ActionResult> {
  const { organizationId, userId } = await requireAdmin();
  const existing = await db.deliveryRole.findFirst({ where: { id, organizationId }, select: { name: true } });
  await db.deliveryRole.deleteMany({ where: { id, organizationId } });
  if (existing) {
    await recordLedgerEvent(db, {
      organizationId,
      actorId: userId,
      actionType: 'SECURITY_CONFIG_CHANGE',
      targetResource: `DeliveryRole:${id}`,
      metadata: { op: 'delete-rate-card-role', name: existing.name },
    });
  }
  revalidatePath('/admin');
  revalidatePath('/admin/audit-log');
  return { ok: true };
}

// WP6 — a dedicated toggle rather than folding this into a general
// "edit role" action: bill/cost rates and practice assignment have no
// update action either (roles are otherwise delete-and-recreate), but
// employment type is the one field the spec explicitly asks to be
// changeable in place, since a role's rate card entry may outlive a
// contractor-to-FTE conversion (or vice versa) without the role itself
// needing to be recreated.
export async function setDeliveryRoleEmploymentType(input: unknown): Promise<ActionResult> {
  const { organizationId, userId } = await requireAdmin();
  const schema = z.object({ id: z.string().min(1), employmentType: z.enum(['FTE', 'CONTRACTOR']) });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const existing = await db.deliveryRole.findFirst({
    where: { id: parsed.data.id, organizationId },
    select: { name: true, employmentType: true },
  });
  await db.deliveryRole.updateMany({
    where: { id: parsed.data.id, organizationId },
    data: { employmentType: parsed.data.employmentType },
  });
  if (existing && existing.employmentType !== parsed.data.employmentType) {
    // Contractor classification drives the masked "Contractor / 3rd-Party
    // Cost Exposure" figure — a security-relevant reclassification.
    await recordLedgerEvent(db, {
      organizationId,
      actorId: userId,
      actionType: 'SECURITY_CONFIG_CHANGE',
      targetResource: `DeliveryRole:${parsed.data.id}`,
      metadata: {
        op: 'reclassify-employment-type',
        role: existing.name,
        before: existing.employmentType,
        after: parsed.data.employmentType,
      },
    });
  }
  revalidatePath('/admin');
  revalidatePath('/');
  revalidatePath('/admin/audit-log');
  return { ok: true };
}

// ----------------------------------------------------------------- Resources

const resourceSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().optional().or(z.literal('')),
  roleId: z.string().optional().or(z.literal('')),
  practiceId: z.string().optional().or(z.literal('')),
});

export async function createResource(input: unknown): Promise<ActionResult> {
  const { organizationId } = await requireAdmin();
  const parsed = resourceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const { name, email, roleId, practiceId } = parsed.data;

  await db.resource.create({
    data: { organizationId, name, email: email || null, roleId: roleId || null, practiceId: practiceId || null },
  });
  revalidatePath('/admin');
  return { ok: true };
}

export async function deleteResource(id: string): Promise<ActionResult> {
  const { organizationId } = await requireAdmin();
  await db.resource.deleteMany({ where: { id, organizationId } });
  revalidatePath('/admin');
  return { ok: true };
}

// ------------------------------------------------------------------- Policy

const policySchema = z.object({
  slipWarnDays: z.coerce.number().int().min(0),
  slipCritDays: z.coerce.number().int().min(0),
  marginCritPct: z.coerce.number().min(0),
  methodology: z.enum(['WATERFALL', 'AGILE', 'HYBRID']),
});

export async function updateOrgPolicy(input: unknown): Promise<ActionResult> {
  const { organizationId } = await requireAdmin();
  const parsed = policySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  await db.orgPolicy.upsert({
    where: { organizationId },
    update: parsed.data,
    create: { organizationId, ...parsed.data },
  });
  revalidatePath('/admin');
  return { ok: true };
}

const controlLabelSchema = z.object({ controlKey: z.string().min(1), label: z.string().min(1).max(160) });

export async function updateControlLabel(input: unknown): Promise<ActionResult> {
  const { organizationId } = await requireAdmin();
  const parsed = controlLabelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const { controlKey, label } = parsed.data;

  await db.controlLabel.upsert({
    where: { organizationId_controlKey: { organizationId, controlKey } },
    update: { label },
    create: { organizationId, controlKey, label },
  });
  revalidatePath('/admin');
  return { ok: true };
}

// -------------------------------------------------- Enterprise Governance (Step 1)

/**
 * Persist a resolved Governance Config (template label re-derived from the
 * settings), record a ledger event, and revalidate every surface that
 * reads it — the sidebar (all routes) plus the compliance ledger view.
 */
async function persistGovernance(
  organizationId: string,
  actorId: string,
  next: { template: GovernanceTemplateKey; hiddenModules: string[]; maskFinancialsForDelivery: boolean },
  op: string
): Promise<void> {
  const before = resolveStoredGovernance(
    await db.governanceConfig.findUnique({ where: { organizationId } })
  );

  await db.governanceConfig.upsert({
    where: { organizationId },
    update: {
      template: next.template,
      hiddenModules: next.hiddenModules,
      maskFinancialsForDelivery: next.maskFinancialsForDelivery,
    },
    create: {
      organizationId,
      template: next.template,
      hiddenModules: next.hiddenModules,
      maskFinancialsForDelivery: next.maskFinancialsForDelivery,
    },
  });

  await recordLedgerEvent(db, {
    organizationId,
    actorId,
    actionType: 'GOVERNANCE_CONFIG_CHANGE',
    targetResource: `GovernanceConfig:${organizationId}`,
    metadata: {
      op,
      before: {
        template: before.template,
        hiddenModules: before.hiddenModules,
        maskFinancialsForDelivery: before.maskFinancialsForDelivery,
      },
      after: next,
    },
  });

  // Route visibility feeds the sidebar on every page; masking feeds the
  // financial surfaces. Blow the whole tenant's cache.
  revalidatePath('/', 'layout');
  revalidatePath('/admin/audit-log');
}

export async function applyGovernanceTemplate(input: unknown): Promise<ActionResult> {
  const { organizationId, userId } = await requireAdmin();
  const parsed = z.object({ template: z.string() }).safeParse(input);
  if (!parsed.success || !isGovernanceTemplateKey(parsed.data.template)) {
    return { ok: false, error: 'Unknown compliance template' };
  }

  const resolved = applyTemplate(parsed.data.template);
  await persistGovernance(
    organizationId,
    userId,
    {
      template: resolved.template,
      hiddenModules: resolved.hiddenModules,
      maskFinancialsForDelivery: resolved.maskFinancialsForDelivery,
    },
    `apply-template:${GOVERNANCE_TEMPLATES[parsed.data.template].label}`
  );
  return { ok: true };
}

const governanceOverrideSchema = z.object({
  hiddenModules: z.array(z.string()).max(HIDEABLE_MODULES.length),
  maskFinancialsForDelivery: z.boolean(),
});

export async function updateGovernanceConfig(input: unknown): Promise<ActionResult> {
  const { organizationId, userId } = await requireAdmin();
  const parsed = governanceOverrideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const current = resolveStoredGovernance(
    await db.governanceConfig.findUnique({ where: { organizationId } })
  );
  const next = withOverrides(current, parsed.data);

  await persistGovernance(
    organizationId,
    userId,
    {
      template: next.template,
      hiddenModules: next.hiddenModules,
      maskFinancialsForDelivery: next.maskFinancialsForDelivery,
    },
    'edit-overrides'
  );
  return { ok: true };
}
