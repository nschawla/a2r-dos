'use server';

import { withAction } from '@/lib/observability/action-wrapper';
import { rateLimitByUser } from '@/lib/rate-limit-action';
import { RATE_LIMITS } from '@/lib/rate-limits';

/**
 * WP7 — Self-Service Batch Import Engine: server actions behind the
 * BatchUploadPortal / BatchDetailView UI at /admin/ingestion.
 *
 * Gated on `admin:ingestion` (ADMIN only — see src/lib/auth/rbac.ts) even
 * though the feature is framed as "client self-service": a batch spans
 * however many projects a file references at once, bypassing the
 * per-project edit scoping every other mutation in this app goes through
 * (authorizeProjectEdit). That blast radius belongs on the same tenant
 * admin tier as Workspace Backup & Restore (admin:workspace), not opened
 * up to every PROJECT_MANAGER — a tenant's Admin runs weekly BAU uploads
 * on behalf of the delivery team, the same way they already own the
 * Ingestion & Template Hub this lives inside.
 *
 * Three-stage flow, each stage re-deriving truth server-side rather than
 * trusting what the client last rendered:
 *   1. stageImportBatch  — the file's rows (already parsed client-side by
 *      workbook-reader.ts — see that file's comment on why re-parsing the
 *      bytes server-side buys nothing extra) are validated AGAIN here
 *      against this org's live projects/resources and persisted as a
 *      DataImportBatch + DataImportRow[]. The client's own preview is UX
 *      only; this is the row's real status of record.
 *   2. updateImportRow   — a single quarantined row's raw cells are
 *      patched and re-validated in place.
 *   3. commitImportBatch — HARD STOP: re-validates every row one more
 *      time against current data (a project could have been renamed or
 *      removed since staging) and refuses to write anything — not even
 *      the clean rows — while a single row still errors. All-or-nothing,
 *      inside one transaction, so a batch can never partially land.
 */
import { revalidatePath } from 'next/cache';
import type { Prisma, BatchImportDataType, BatchImportStatus, BatchImportRowStatus, ScheduleStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { authorizeAdminAction } from '@/server/authz';
import { logAuditEvent } from '@/lib/audit/logger';
import { recordLedgerEvent } from '@/lib/audit-ledger';
import {
  validateBatchRow,
  MAX_BATCH_ROWS,
  type BatchValidationContext,
  type BatchRowIssue,
  type WeeklyActualsBatchRow,
  type MilestoneProgressBatchRow,
  type ForecastEacBatchRow,
  type StatusRaidBatchRow,
} from '@/lib/ingestion/batch-schemas';

export type ActionResult<T> = { ok: true } & T | { ok: false; error: string };

export interface StagedRowView {
  id: string;
  rowIndex: number;
  raw: Record<string, string>;
  status: BatchImportRowStatus;
  errors: BatchRowIssue[];
}

export interface BatchListItem {
  id: string;
  dataType: BatchImportDataType;
  fileName: string;
  status: BatchImportStatus;
  totalRows: number;
  validRows: number;
  errorRows: number;
  createdAt: string;
  committedAt: string | null;
  uploadedByName: string | null;
}

export interface BatchDetail extends BatchListItem {
  rows: StagedRowView[];
}

async function loadLookups(organizationId: string): Promise<BatchValidationContext> {
  const [projects, resources, roles] = await Promise.all([
    db.project.findMany({ where: { organizationId }, select: { id: true, externalId: true, name: true, estimationMode: true } }),
    db.resource.findMany({ where: { organizationId }, select: { id: true, name: true, email: true } }),
    db.deliveryRole.findMany({ where: { organizationId }, select: { id: true, name: true } }),
  ]);
  return {
    projects: projects.map((p) => ({ id: p.id, code: p.externalId, name: p.name, estimationMode: p.estimationMode })),
    resources: resources.map((r) => ({ id: r.id, name: r.name, email: r.email })),
    roles,
  };
}

function toListItem(batch: {
  id: string;
  dataType: BatchImportDataType;
  fileName: string;
  status: BatchImportStatus;
  totalRows: number;
  validRows: number;
  errorRows: number;
  createdAt: Date;
  committedAt: Date | null;
  uploadedBy: { name: string | null; email: string } | null;
}): BatchListItem {
  return {
    id: batch.id,
    dataType: batch.dataType,
    fileName: batch.fileName,
    status: batch.status,
    totalRows: batch.totalRows,
    validRows: batch.validRows,
    errorRows: batch.errorRows,
    createdAt: batch.createdAt.toISOString(),
    committedAt: batch.committedAt ? batch.committedAt.toISOString() : null,
    uploadedByName: batch.uploadedBy?.name ?? batch.uploadedBy?.email ?? null,
  };
}

// ------------------------------------------------------------- stage

export const stageImportBatch = withAction('stageImportBatch', async (dataType: BatchImportDataType, fileName: string, rows: Record<string, string>[]): Promise<ActionResult<{ batchId: string; validRows: number; errorRows: number }>> => {
  const auth = await authorizeAdminAction('admin:ingestion');
  if (!auth.ok) return { ok: false, error: auth.error };

  const limited = await rateLimitByUser('import:batch', auth.context.userId, RATE_LIMITS.BATCH_INGEST);
  if (limited) return limited;

  if (rows.length === 0) {
    return { ok: false, error: 'That file has no data rows to import.' };
  }
  if (rows.length > MAX_BATCH_ROWS) {
    return { ok: false, error: `This file has ${rows.length} rows — batches are capped at ${MAX_BATCH_ROWS}. Split it into smaller files and upload each separately.` };
  }

  const lookups = await loadLookups(auth.context.organizationId);
  const rowsWithValidation = rows.map((raw) => ({ raw, result: validateBatchRow(dataType, raw, lookups) }));
  const validRows = rowsWithValidation.filter((rv) => rv.result.errors.length === 0).length;
  const errorRows = rowsWithValidation.length - validRows;

  const batch = await db.dataImportBatch.create({
    data: {
      organizationId: auth.context.organizationId,
      dataType,
      fileName,
      status: 'STAGED',
      totalRows: rows.length,
      validRows,
      errorRows,
      uploadedById: auth.context.userId,
      rows: {
        create: rowsWithValidation.map((rv, idx) => ({
          organizationId: auth.context.organizationId,
          rowIndex: idx + 1,
          raw: rv.raw as Prisma.InputJsonValue,
          status: rv.result.errors.length === 0 ? 'VALID' : 'ERROR',
          errors: rv.result.errors as unknown as Prisma.InputJsonValue,
        })),
      },
    },
    select: { id: true },
  });

  await logAuditEvent(db, {
    organizationId: auth.context.organizationId,
    userId: auth.context.userId,
    action: 'BATCH_IMPORT_STAGED',
    entityType: 'DATA_IMPORT_BATCH',
    entityId: batch.id,
    newState: { dataType, fileName, totalRows: rows.length, validRows, errorRows },
  });

  revalidatePath('/admin/ingestion');
  return { ok: true, batchId: batch.id, validRows, errorRows };
});

// ------------------------------------------------------------- list / detail

export const listImportBatches = withAction('listImportBatches', async (): Promise<ActionResult<{ batches: BatchListItem[] }>> => {
  const auth = await authorizeAdminAction('admin:ingestion');
  if (!auth.ok) return { ok: false, error: auth.error };

  const limited = await rateLimitByUser('import:batch', auth.context.userId, RATE_LIMITS.BATCH_INGEST);
  if (limited) return limited;

  const batches = await db.dataImportBatch.findMany({
    where: { organizationId: auth.context.organizationId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { uploadedBy: { select: { name: true, email: true } } },
  });

  return { ok: true, batches: batches.map(toListItem) };
});

export const getImportBatch = withAction('getImportBatch', async (batchId: string): Promise<ActionResult<{ batch: BatchDetail }>> => {
  const auth = await authorizeAdminAction('admin:ingestion');
  if (!auth.ok) return { ok: false, error: auth.error };

  const limited = await rateLimitByUser('import:batch', auth.context.userId, RATE_LIMITS.BATCH_INGEST);
  if (limited) return limited;

  const batch = await db.dataImportBatch.findFirst({
    where: { id: batchId, organizationId: auth.context.organizationId },
    include: {
      uploadedBy: { select: { name: true, email: true } },
      rows: { orderBy: { rowIndex: 'asc' } },
    },
  });
  if (!batch) return { ok: false, error: 'Batch not found.' };

  return {
    ok: true,
    batch: {
      ...toListItem(batch),
      rows: batch.rows.map((r) => ({
        id: r.id,
        rowIndex: r.rowIndex,
        raw: r.raw as Record<string, string>,
        status: r.status,
        errors: r.errors as unknown as BatchRowIssue[],
      })),
    },
  };
});

// ------------------------------------------------------------- correct

export const updateImportRow = withAction('updateImportRow', async (batchId: string, rowId: string, patch: Record<string, string>): Promise<ActionResult<{ row: StagedRowView; validRows: number; errorRows: number; totalRows: number }>> => {
  const auth = await authorizeAdminAction('admin:ingestion');
  if (!auth.ok) return { ok: false, error: auth.error };

  const limited = await rateLimitByUser('import:batch', auth.context.userId, RATE_LIMITS.BATCH_INGEST);
  if (limited) return limited;

  const batch = await db.dataImportBatch.findFirst({
    where: { id: batchId, organizationId: auth.context.organizationId },
    select: { id: true, dataType: true, status: true },
  });
  if (!batch) return { ok: false, error: 'Batch not found.' };
  if (batch.status !== 'STAGED') {
    return { ok: false, error: `This batch is ${batch.status === 'COMMITTED' ? 'already committed' : 'discarded'} and can no longer be edited.` };
  }

  const row = await db.dataImportRow.findFirst({ where: { id: rowId, batchId } });
  if (!row) return { ok: false, error: 'Row not found in this batch.' };

  const mergedRaw: Record<string, string> = { ...(row.raw as Record<string, string>), ...patch };
  const lookups = await loadLookups(auth.context.organizationId);
  const { errors } = validateBatchRow(batch.dataType, mergedRaw, lookups);
  const status: BatchImportRowStatus = errors.length === 0 ? 'CORRECTED' : 'ERROR';

  const updated = await db.dataImportRow.update({
    where: { id: rowId },
    data: { raw: mergedRaw as Prisma.InputJsonValue, status, errors: errors as unknown as Prisma.InputJsonValue },
  });

  const [validRows, errorRows, totalRows] = await Promise.all([
    db.dataImportRow.count({ where: { batchId, status: { in: ['VALID', 'CORRECTED'] } } }),
    db.dataImportRow.count({ where: { batchId, status: 'ERROR' } }),
    db.dataImportRow.count({ where: { batchId } }),
  ]);
  await db.dataImportBatch.update({ where: { id: batchId }, data: { validRows, errorRows } });

  return {
    ok: true,
    row: { id: updated.id, rowIndex: updated.rowIndex, raw: mergedRaw, status: updated.status, errors },
    validRows,
    errorRows,
    totalRows,
  };
});

// ------------------------------------------------------------- commit / discard

const SCHEDULE_STATUS_SET: readonly ScheduleStatus[] = ['NOTSTARTED', 'INPROGRESS', 'COMPLETE', 'DELAYED'];

export const commitImportBatch = withAction('commitImportBatch', async (batchId: string): Promise<ActionResult<{ committedRows: number }>> => {
  const auth = await authorizeAdminAction('admin:ingestion');
  if (!auth.ok) return { ok: false, error: auth.error };

  const limited = await rateLimitByUser('import:batch', auth.context.userId, RATE_LIMITS.BATCH_INGEST);
  if (limited) return limited;

  const batch = await db.dataImportBatch.findFirst({
    where: { id: batchId, organizationId: auth.context.organizationId },
    include: { rows: { orderBy: { rowIndex: 'asc' } } },
  });
  if (!batch) return { ok: false, error: 'Batch not found.' };
  if (batch.status !== 'STAGED') {
    return { ok: false, error: `This batch is ${batch.status === 'COMMITTED' ? 'already committed' : 'discarded'} — nothing to commit.` };
  }

  // Authoritative re-check: never trust a row's stored status at commit
  // time — a referenced project/resource could have changed since it was
  // staged or last corrected.
  const lookups = await loadLookups(auth.context.organizationId);
  const revalidated = batch.rows.map((r) => ({
    row: r,
    result: validateBatchRow(batch.dataType, r.raw as Record<string, string>, lookups),
  }));
  const stillErrored = revalidated.filter((r) => r.result.errors.length > 0);

  if (stillErrored.length > 0) {
    // Persist the fresh re-check so the quarantine grid reflects reality
    // even though nothing commits — a stale-looking "0 errors" row that
    // silently re-broke would be worse than surfacing it here.
    await db.$transaction(
      stillErrored.map((r) =>
        db.dataImportRow.update({
          where: { id: r.row.id },
          data: { status: 'ERROR', errors: r.result.errors as unknown as Prisma.InputJsonValue },
        })
      )
    );
    const errorRows = stillErrored.length;
    await db.dataImportBatch.update({ where: { id: batchId }, data: { errorRows, validRows: batch.totalRows - errorRows } });
    return {
      ok: false,
      error: `${errorRows} row${errorRows === 1 ? '' : 's'} still ${errorRows === 1 ? 'has' : 'have'} unresolved errors — resolve every error before committing. No rows were imported.`,
    };
  }

  const committedRows = revalidated.length;

  await db.$transaction(async (tx) => {
    for (const { result } of revalidated) {
      if (batch.dataType === 'WEEKLY_ACTUALS') {
        const data = result.data as WeeklyActualsBatchRow;
        await tx.weeklyAssignmentSlot.upsert({
          where: {
            resourceId_projectId_weekDate: {
              resourceId: data.resourceId,
              projectId: data.projectId,
              weekDate: new Date(data.weekDate),
            },
          },
          update: {
            actualHours: data.actualHours,
            ...(data.forecastedHours !== null ? { forecastedHours: data.forecastedHours } : {}),
          },
          create: {
            organizationId: auth.context.organizationId,
            resourceId: data.resourceId,
            projectId: data.projectId,
            weekDate: new Date(data.weekDate),
            actualHours: data.actualHours,
            forecastedHours: data.forecastedHours ?? 0,
          },
        });
      } else if (batch.dataType === 'MILESTONE_PROGRESS') {
        const data = result.data as MilestoneProgressBatchRow;
        if (!SCHEDULE_STATUS_SET.includes(data.status)) continue; // exhaustive by construction; guards the cast below
        await tx.schedulePhase.upsert({
          where: { projectId_phaseKey: { projectId: data.projectId, phaseKey: data.phaseKey } },
          update: {
            status: data.status,
            pctComplete: data.pctComplete,
            ...(data.actualStart ? { actualStart: new Date(data.actualStart) } : {}),
            ...(data.actualEnd ? { actualEnd: new Date(data.actualEnd) } : {}),
          },
          create: {
            organizationId: auth.context.organizationId,
            projectId: data.projectId,
            phaseKey: data.phaseKey,
            status: data.status,
            pctComplete: data.pctComplete,
            actualStart: data.actualStart ? new Date(data.actualStart) : null,
            actualEnd: data.actualEnd ? new Date(data.actualEnd) : null,
          },
        });
      } else if (batch.dataType === 'FORECAST_EAC') {
        const data = result.data as ForecastEacBatchRow;
        await tx.financialActual.upsert({
          where: { projectId_roleKey: { projectId: data.projectId, roleKey: data.roleKey } },
          update: { forecastHours: data.forecastHours, openRRHours: data.openRRHours },
          create: {
            organizationId: auth.context.organizationId,
            projectId: data.projectId,
            roleKey: data.roleKey,
            roleId: data.roleKey,
            forecastHours: data.forecastHours,
            openRRHours: data.openRRHours,
          },
        });
      } else {
        const data = result.data as StatusRaidBatchRow;
        if (data.narrative) {
          await tx.activityLogEntry.create({
            data: {
              organizationId: auth.context.organizationId,
              projectId: data.projectId,
              userId: auth.context.userId,
              text: `Week of ${data.weekDate.slice(0, 10)} — ${data.narrative}`,
              tab: 'raid',
            },
          });
        }
        if (data.raid) {
          await tx.raidEntry.create({
            data: {
              organizationId: auth.context.organizationId,
              projectId: data.projectId,
              type: data.raid.type,
              description: data.raid.description,
              severity: data.raid.severity,
              ownerId: data.raid.ownerId,
            },
          });
        }
      }
    }

    await tx.dataImportBatch.update({
      where: { id: batchId },
      data: { status: 'COMMITTED', committedAt: new Date(), validRows: committedRows, errorRows: 0 },
    });

    await logAuditEvent(tx, {
      organizationId: auth.context.organizationId,
      userId: auth.context.userId,
      action: 'BATCH_IMPORT_COMMITTED',
      entityType: 'DATA_IMPORT_BATCH',
      entityId: batchId,
      newState: { dataType: batch.dataType, fileName: batch.fileName, committedRows },
    });

    await recordLedgerEvent(tx, {
      organizationId: auth.context.organizationId,
      actorId: auth.context.userId,
      actionType: 'BATCH_IMPORT_COMMITTED',
      targetResource: `DataImportBatch:${batchId}`,
      metadata: { dataType: batch.dataType, fileName: batch.fileName, committedRows },
    });
  });

  revalidatePath('/admin/ingestion');
  revalidatePath('/capacity');
  revalidatePath('/schedule');
  revalidatePath('/financials');
  revalidatePath('/raid');
  revalidatePath('/');

  return { ok: true, committedRows };
});

export const discardImportBatch = withAction('discardImportBatch', async (batchId: string): Promise<{ ok: true } | { ok: false; error: string }> => {
  const auth = await authorizeAdminAction('admin:ingestion');
  if (!auth.ok) return { ok: false, error: auth.error };

  const limited = await rateLimitByUser('import:batch', auth.context.userId, RATE_LIMITS.BATCH_INGEST);
  if (limited) return limited;

  const batch = await db.dataImportBatch.findFirst({
    where: { id: batchId, organizationId: auth.context.organizationId },
    select: { id: true, status: true, dataType: true, fileName: true },
  });
  if (!batch) return { ok: false, error: 'Batch not found.' };
  if (batch.status !== 'STAGED') {
    return { ok: false, error: 'Only a staged batch can be discarded.' };
  }

  await db.dataImportBatch.update({ where: { id: batchId }, data: { status: 'DISCARDED' } });
  await logAuditEvent(db, {
    organizationId: auth.context.organizationId,
    userId: auth.context.userId,
    action: 'BATCH_IMPORT_DISCARDED',
    entityType: 'DATA_IMPORT_BATCH',
    entityId: batchId,
    newState: { dataType: batch.dataType, fileName: batch.fileName },
  });

  revalidatePath('/admin/ingestion');
  return { ok: true };
});
