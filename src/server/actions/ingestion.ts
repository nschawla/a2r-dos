'use server';

/**
 * WP6 — CSV Ingestion Server Actions: the thin Prisma-touching layer over
 * the pure parsers in src/lib/ingestion/csv-parsers.ts, mirroring the
 * calc-engine's pure-lib/adapter split (see src/server/queries/calc-adapters.ts).
 *
 * Two-action dry-run/commit pattern:
 * - `previewCsvImport` parses the raw text server-side against the org's
 *   live roster and returns the full row-by-row result. No writes happen
 *   here — CsvImportModal renders this as the preview table.
 * - `commitCsvImport` re-parses the SAME raw text itself rather than
 *   trusting anything the client sends back from the preview call (a
 *   "please trust me, row 4 was valid" payload from the browser is not a
 *   security boundary). Only rows that parse clean are written; the rest
 *   are silently skipped (their errors were already shown at preview
 *   time) — one atomic transaction per commit, plus exactly one
 *   CSV_IMPORT_COMMITTED audit log entry summarizing the batch.
 *
 * Gated by `authorizeProjectEdit`, same as every other per-project mutation
 * — CSV import is a bulk version of edits a user could already make one row
 * at a time through DealEditor/RaidBoard/EacEditor, not a distinct admin
 * capability. See src/server/authz.ts's authorizeAdminAction doc comment
 * for why Workspace Backup & Restore is gated differently.
 */
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { authorizeProjectEdit } from '@/server/authz';
import { logAuditEvent } from '@/lib/audit/logger';
import {
  parseEffortMatrixCsv,
  parseRaidCsv,
  parseFinancialActualsCsv,
  type CsvParseResult,
  type EffortMatrixCsvRow,
  type RaidCsvRow,
  type FinancialActualCsvRow,
  type RoleLookupEntry,
  type ResourceLookupEntry,
} from '@/lib/ingestion/csv-parsers';

export type IngestionKind = 'effort' | 'raid' | 'financials';
export type IngestionRow = EffortMatrixCsvRow | RaidCsvRow | FinancialActualCsvRow;

export type PreviewCsvImportResult =
  | { ok: true; result: CsvParseResult<IngestionRow> }
  | { ok: false; error: string };

export type CommitCsvImportResult =
  | { ok: true; importedCount: number; skippedCount: number; totalRows: number }
  | { ok: false; error: string };

async function loadRoleLookup(organizationId: string): Promise<RoleLookupEntry[]> {
  const roles = await db.deliveryRole.findMany({
    where: { organizationId },
    select: { id: true, name: true, employmentType: true },
  });
  return roles.map((r) => ({ id: r.id, name: r.name, employmentType: r.employmentType === 'CONTRACTOR' ? 'contractor' : 'fte' }));
}

async function loadResourceLookup(organizationId: string): Promise<ResourceLookupEntry[]> {
  return db.resource.findMany({ where: { organizationId }, select: { id: true, name: true } });
}

/** Shared by both actions so preview and commit can never drift apart on
 * which roster/mode they validate against. */
async function parseForKind(
  kind: IngestionKind,
  csvText: string,
  organizationId: string,
  projectId: string
): Promise<{ ok: true; result: CsvParseResult<IngestionRow> } | { ok: false; error: string }> {
  if (kind === 'effort') {
    const roles = await loadRoleLookup(organizationId);
    return { ok: true, result: parseEffortMatrixCsv(csvText, roles) };
  }
  if (kind === 'raid') {
    const resources = await loadResourceLookup(organizationId);
    return { ok: true, result: parseRaidCsv(csvText, resources) };
  }
  if (kind === 'financials') {
    const project = await db.project.findFirst({ where: { id: projectId, organizationId }, select: { estimationMode: true } });
    if (!project) return { ok: false, error: 'Project not found.' };
    const roles = await loadRoleLookup(organizationId);
    const mode = project.estimationMode === 'DIRECT' ? 'direct' : 'matrix';
    return { ok: true, result: parseFinancialActualsCsv(csvText, roles, mode) };
  }
  return { ok: false, error: 'Unrecognized import kind.' };
}

export async function previewCsvImport(projectId: string, kind: IngestionKind, csvText: string): Promise<PreviewCsvImportResult> {
  const auth = await authorizeProjectEdit(projectId);
  if (!auth.ok) return { ok: false, error: auth.error };

  return parseForKind(kind, csvText, auth.context.organizationId, projectId);
}

export async function commitCsvImport(projectId: string, kind: IngestionKind, csvText: string): Promise<CommitCsvImportResult> {
  const auth = await authorizeProjectEdit(projectId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = await parseForKind(kind, csvText, auth.context.organizationId, projectId);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const validRows = parsed.result.rows.map((r) => r.data).filter((d): d is IngestionRow => d !== null);
  const totalRows = parsed.result.rows.length;
  const skippedCount = totalRows - validRows.length;

  if (validRows.length === 0) {
    return { ok: false, error: 'No valid rows to import — fix the errors shown in the preview and try again.' };
  }

  await db.$transaction(async (tx) => {
    if (kind === 'effort') {
      for (const row of validRows as EffortMatrixCsvRow[]) {
        await tx.effortCell.upsert({
          where: { projectId_phaseKey_roleId: { projectId, phaseKey: row.phaseKey, roleId: row.roleId } },
          update: { hours: row.hours },
          create: {
            organizationId: auth.context.organizationId,
            projectId,
            phaseKey: row.phaseKey,
            roleId: row.roleId,
            hours: row.hours,
          },
        });
      }
    } else if (kind === 'raid') {
      for (const row of validRows as RaidCsvRow[]) {
        await tx.raidEntry.create({
          data: {
            organizationId: auth.context.organizationId,
            projectId,
            type: row.type,
            title: row.title || null,
            description: row.description,
            severity: row.severity,
            impact: row.impact || null,
            mitigationPlan: row.mitigationPlan || null,
            ownerId: row.ownerId,
            targetDate: row.targetDate ? new Date(row.targetDate) : null,
            escalate: row.escalate,
          },
        });
      }
    } else {
      for (const row of validRows as FinancialActualCsvRow[]) {
        await tx.financialActual.upsert({
          where: { projectId_roleKey: { projectId, roleKey: row.roleKey } },
          update: {
            roleId: row.roleKey === '_direct' ? null : row.roleKey,
            hours: row.hours,
            cost: row.cost,
            forecastHours: row.forecastHours,
            openRRHours: row.openRRHours,
          },
          create: {
            organizationId: auth.context.organizationId,
            projectId,
            roleKey: row.roleKey,
            roleId: row.roleKey === '_direct' ? null : row.roleKey,
            hours: row.hours,
            cost: row.cost,
            forecastHours: row.forecastHours,
            openRRHours: row.openRRHours,
          },
        });
      }
    }

    await logAuditEvent(tx, {
      organizationId: auth.context.organizationId,
      projectId,
      userId: auth.context.userId,
      action: 'CSV_IMPORT_COMMITTED',
      entityType: 'INGESTION',
      entityId: kind,
      previousState: null,
      newState: { kind, importedCount: validRows.length, skippedCount, totalRows },
    });
  });

  revalidatePath('/');
  revalidatePath(`/commercial-baseline/${projectId}`);
  revalidatePath(`/raid/${projectId}`);
  revalidatePath(`/financials/${projectId}`);

  return { ok: true, importedCount: validRows.length, skippedCount, totalRows };
}
