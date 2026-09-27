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
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { PROVIDER_LABEL } from '@/lib/integrations/registry-labels';
import { captureException } from '@/lib/observability';
import type { IntegrationConnectionStatus, IntegrationErrorCategory, IntegrationProvider } from '@prisma/client';

/** True when a Prisma error is specifically "this table doesn't exist yet"
 * (P2021) — the exact shape thrown for `IntegrationConnection`/
 * `IntegrationError` in an environment whose migration 26 hasn't been
 * applied. v1.18.0 shipped this feature to STAGING ONLY, production
 * deliberately untouched (docs/INTEGRATION_ADAPTERS.md) — but nothing
 * gated the /ops/integrations *route* itself behind that, so any visit
 * (including the Ops Console sidebar's own automatic Link prefetch of
 * every nav item) threw this uncaught in production. Any OTHER Prisma
 * error still throws normally — this narrowly catches only the "not
 * provisioned in this environment" case, not a real query bug. */
function isMissingIntegrationTables(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2021';
}

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
 * Health Matrix's row set. Empty (never throws) in an environment where
 * this feature's tables aren't provisioned yet — see
 * `isMissingIntegrationTables` above. */
export async function loadAllConnections(): Promise<ConnectionRow[]> {
  let rows: Awaited<ReturnType<typeof db.integrationConnection.findMany<{ select: typeof CONNECTION_SELECT }>>>;
  let orgs: { id: string; name: string }[];
  let errorCounts: { connectionId: string; _count: { _all: number } }[];
  try {
    [rows, orgs, errorCounts] = await Promise.all([
      db.integrationConnection.findMany({ select: CONNECTION_SELECT, orderBy: { createdAt: 'desc' } }),
      db.organization.findMany({ where: { purgedAt: null }, select: { id: true, name: true } }),
      db.integrationError.groupBy({
        by: ['connectionId'],
        where: { resolved: false },
        _count: { _all: true },
      }),
    ]);
  } catch (err) {
    if (!isMissingIntegrationTables(err)) throw err;
    captureException(err, { scope: 'ops-integrations', reason: 'tables-not-provisioned' });
    return [];
  }

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
 * click on a Connection Health Matrix row opens into. Empty (never
 * throws) when this feature's tables aren't provisioned. */
export async function loadConnectionErrors(organizationId: string, connectionId: string): Promise<ErrorLogRow[]> {
  let rows: Awaited<ReturnType<typeof db.integrationError.findMany>>;
  try {
    rows = await db.integrationError.findMany({
      where: { organizationId, connectionId },
      orderBy: { occurredAt: 'desc' },
      take: 50,
    });
  } catch (err) {
    if (!isMissingIntegrationTables(err)) throw err;
    captureException(err, { scope: 'ops-integrations', reason: 'tables-not-provisioned' });
    return [];
  }
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
 * for the "edit connection" form to pre-fill non-secret fields. `null`
 * (never throws) when this feature's tables aren't provisioned. */
export async function loadConnection(organizationId: string, connectionId: string) {
  try {
    return await db.integrationConnection.findFirst({
      where: { organizationId, id: connectionId },
      select: CONNECTION_SELECT,
    });
  } catch (err) {
    if (!isMissingIntegrationTables(err)) throw err;
    captureException(err, { scope: 'ops-integrations', reason: 'tables-not-provisioned' });
    return null;
  }
}
