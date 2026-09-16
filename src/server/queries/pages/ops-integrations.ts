/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Read queries behind the Ops Console's Connection Health Matrix
 * (/ops/integrations). Callable only from a request that already resolved
 * an Ops context (requireOpsContext / requireElevatedOps, both of which
 * call setAdminScope('ops-console') before this ever runs) — same
 * precondition as src/server/queries/ops-telemetry.ts.
 *
 * `credentialCiphertext` is NEVER selected here — every query below uses
 * an explicit `select` that omits it, so a leaked query result can't leak
 * a sealed secret either.
 */
import { db } from '@/lib/db';
import { PROVIDER_LABEL } from '@/lib/integrations/registry-labels';
import type { IntegrationConnectionStatus, IntegrationErrorCategory, IntegrationProvider } from '@prisma/client';

const CONNECTION_SELECT = {
  id: true,
  organizationId: true,
  provider: true,
  displayName: true,
  status: true,
  config: true,
  credentialFingerprint: true,
  lastSyncAt: true,
  lastSyncStatus: true,
  lastSyncRecordCount: true,
  avgSyncDurationMs: true,
  rateLimitRemaining: true,
  rateLimitResetAt: true,
  syncIntervalMinutes: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface ConnectionRow {
  id: string;
  organizationId: string;
  organizationName: string;
  provider: IntegrationProvider;
  providerLabel: string;
  displayName: string;
  status: IntegrationConnectionStatus;
  config: Record<string, string>;
  credentialFingerprint: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncRecordCount: number | null;
  avgSyncDurationMs: number | null;
  rateLimitRemaining: number | null;
  rateLimitResetAt: string | null;
  syncIntervalMinutes: number;
  openErrorCount: number;
}

/** Every connection across every (non-purged) tenant — the Connection
 * Health Matrix's row set. */
export async function loadAllConnections(): Promise<ConnectionRow[]> {
  const [rows, orgs, errorCounts] = await Promise.all([
    db.integrationConnection.findMany({ select: CONNECTION_SELECT, orderBy: { createdAt: 'desc' } }),
    db.organization.findMany({ where: { purgedAt: null }, select: { id: true, name: true } }),
    db.integrationError.groupBy({
      by: ['connectionId'],
      where: { resolved: false },
      _count: { _all: true },
    }),
  ]);

  const orgNameById = new Map(orgs.map((o) => [o.id, o.name]));
  const errorCountByConnection = new Map(errorCounts.map((e) => [e.connectionId, e._count._all]));

  return rows.map((r) => ({
    id: r.id,
    organizationId: r.organizationId,
    organizationName: orgNameById.get(r.organizationId) ?? 'Unknown tenant',
    provider: r.provider,
    providerLabel: PROVIDER_LABEL[r.provider],
    displayName: r.displayName,
    status: r.status,
    config: (r.config as Record<string, string>) ?? {},
    credentialFingerprint: r.credentialFingerprint,
    lastSyncAt: r.lastSyncAt?.toISOString() ?? null,
    lastSyncStatus: r.lastSyncStatus,
    lastSyncRecordCount: r.lastSyncRecordCount,
    avgSyncDurationMs: r.avgSyncDurationMs,
    rateLimitRemaining: r.rateLimitRemaining,
    rateLimitResetAt: r.rateLimitResetAt?.toISOString() ?? null,
    syncIntervalMinutes: r.syncIntervalMinutes,
    openErrorCount: errorCountByConnection.get(r.id) ?? 0,
  }));
}

export interface ErrorLogRow {
  id: string;
  connectionId: string;
  occurredAt: string;
  category: IntegrationErrorCategory;
  humanMessage: string;
  rawDetail: string | null;
  resolved: boolean;
}

/** The error log for one connection, newest first — the detail panel a
 * click on a Connection Health Matrix row opens into. */
export async function loadConnectionErrors(organizationId: string, connectionId: string): Promise<ErrorLogRow[]> {
  const rows = await db.integrationError.findMany({
    where: { organizationId, connectionId },
    orderBy: { occurredAt: 'desc' },
    take: 50,
  });
  return rows.map((r) => ({
    id: r.id,
    connectionId: r.connectionId,
    occurredAt: r.occurredAt.toISOString(),
    category: r.category,
    humanMessage: r.humanMessage,
    rawDetail: r.rawDetail,
    resolved: r.resolved,
  }));
}

/** One connection's own detail (config + fingerprint, never the secret) —
 * for the "edit connection" form to pre-fill non-secret fields. */
export async function loadConnection(organizationId: string, connectionId: string) {
  return db.integrationConnection.findFirst({
    where: { organizationId, id: connectionId },
    select: CONNECTION_SELECT,
  });
}
