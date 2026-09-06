'use server';

import { withAction } from '@/lib/observability/action-wrapper';

/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Custom KPI Definition Engine — CRUD server actions behind
 * /admin/kpis. Gated on `admin:governance` (ADMIN only): a custom KPI
 * renders on the SteerCo-facing Control Tower and the tenant-wide
 * Executive Hub, the same tenant-wide-visibility blast radius as the
 * Governance templates already gated on that permission — not a
 * per-project concern, so it doesn't go through authorizeProjectEdit.
 */
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { authorizeAdminAction } from '@/server/authz';
import { validateKpiDefinition } from '@/lib/kpi-engine';
import { isRbacPersona } from '@/lib/governance/rbacMatrix';
import type { CustomKpiDef, CustomKpiInput, KpiDataSource, KpiFormulaType } from '@/types/kpi';
import { KPI_DATA_SOURCES } from '@/types/kpi';

export type ActionResult<T = Record<string, never>> = ({ ok: true } & T) | { ok: false; error: string };

function sanitizeInput(raw: unknown): { ok: true; input: CustomKpiInput } | { ok: false; error: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Invalid input.' };
  const r = raw as Record<string, unknown>;

  const name = typeof r.name === 'string' ? r.name.trim() : '';
  const dataSource = r.dataSource;
  const metricKey = typeof r.metricKey === 'string' ? r.metricKey : '';
  const formulaType = r.formulaType;
  const targetValue = typeof r.targetValue === 'number' ? r.targetValue : NaN;
  const warningValue = typeof r.warningValue === 'number' ? r.warningValue : NaN;
  const targetPersonas = Array.isArray(r.targetPersonas) ? r.targetPersonas.filter(isRbacPersona) : [];

  if (!(KPI_DATA_SOURCES as readonly unknown[]).includes(dataSource)) {
    return { ok: false, error: 'Unknown data source.' };
  }
  if (formulaType !== 'DIRECT' && formulaType !== 'INVERSE') {
    return { ok: false, error: 'Unknown formula type.' };
  }

  const input: CustomKpiInput = {
    name,
    dataSource: dataSource as KpiDataSource,
    metricKey: metricKey as CustomKpiInput['metricKey'],
    formulaType: formulaType as KpiFormulaType,
    targetValue,
    warningValue,
    targetPersonas,
  };

  const errors = validateKpiDefinition(input);
  if (errors.length > 0) return { ok: false, error: errors[0]! };

  return { ok: true, input };
}

export const listCustomKpis = withAction('listCustomKpis', async (): Promise<ActionResult<{ kpis: CustomKpiDef[] }>> => {
  const auth = await authorizeAdminAction('admin:governance');
  if (!auth.ok) return { ok: false, error: auth.error };

  const rows = await db.customKpi.findMany({
    where: { organizationId: auth.context.organizationId },
    orderBy: { createdAt: 'asc' },
  });

  return { ok: true, kpis: rows.map(toDef) };
});

export const createCustomKpi = withAction('createCustomKpi', async (input: unknown): Promise<ActionResult<{ id: string }>> => {
  const auth = await authorizeAdminAction('admin:governance');
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = sanitizeInput(input);
  if (!parsed.ok) return parsed;

  const row = await db.customKpi.create({
    data: {
      organizationId: auth.context.organizationId,
      createdById: auth.context.userId,
      name: parsed.input.name,
      dataSource: parsed.input.dataSource,
      metricKey: parsed.input.metricKey,
      formulaType: parsed.input.formulaType,
      targetValue: parsed.input.targetValue,
      warningValue: parsed.input.warningValue,
      targetPersonas: parsed.input.targetPersonas,
    },
    select: { id: true },
  });

  revalidatePath('/admin/kpis');
  revalidatePath('/', 'layout');
  revalidatePath('/reports');
  return { ok: true, id: row.id };
});

export const updateCustomKpi = withAction('updateCustomKpi', async (id: string, input: unknown): Promise<{ ok: true } | { ok: false; error: string }> => {
  const auth = await authorizeAdminAction('admin:governance');
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = sanitizeInput(input);
  if (!parsed.ok) return parsed;

  const existing = await db.customKpi.findFirst({ where: { id, organizationId: auth.context.organizationId } });
  if (!existing) return { ok: false, error: 'KPI not found.' };

  await db.customKpi.update({
    where: { id },
    data: {
      name: parsed.input.name,
      dataSource: parsed.input.dataSource,
      metricKey: parsed.input.metricKey,
      formulaType: parsed.input.formulaType,
      targetValue: parsed.input.targetValue,
      warningValue: parsed.input.warningValue,
      targetPersonas: parsed.input.targetPersonas,
    },
  });

  revalidatePath('/admin/kpis');
  revalidatePath('/', 'layout');
  revalidatePath('/reports');
  return { ok: true };
});

export const deleteCustomKpi = withAction('deleteCustomKpi', async (id: string): Promise<{ ok: true } | { ok: false; error: string }> => {
  const auth = await authorizeAdminAction('admin:governance');
  if (!auth.ok) return { ok: false, error: auth.error };

  const existing = await db.customKpi.findFirst({ where: { id, organizationId: auth.context.organizationId } });
  if (!existing) return { ok: false, error: 'KPI not found.' };

  await db.customKpi.delete({ where: { id } });

  revalidatePath('/admin/kpis');
  revalidatePath('/', 'layout');
  revalidatePath('/reports');
  return { ok: true };
});

function toDef(row: {
  id: string;
  name: string;
  dataSource: string;
  metricKey: string;
  formulaType: string;
  targetValue: number;
  warningValue: number;
  targetPersonas: string[];
}): CustomKpiDef {
  return {
    id: row.id,
    name: row.name,
    dataSource: row.dataSource as KpiDataSource,
    metricKey: row.metricKey as CustomKpiDef['metricKey'],
    formulaType: row.formulaType as KpiFormulaType,
    targetValue: row.targetValue,
    warningValue: row.warningValue,
    targetPersonas: row.targetPersonas.filter(isRbacPersona),
  };
}
