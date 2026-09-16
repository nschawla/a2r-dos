/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * The one function that actually runs a sync attempt — called by both the
 * manual "Retry Sync" server action (src/server/actions/integrations.ts)
 * and the scheduled cron route (src/app/api/cron/integrations-sync/route.ts),
 * so the two paths can never drift into different behavior.
 *
 * Pipeline: decrypt the credential → adapter.testConnection isn't re-run
 * here (that's a separate, cheap action) → adapter.pull(), paginating up
 * to a bounded page count → each page's records validated through the
 * Normalization Layer (normalize.ts) → tally counts → write one
 * IntegrationSyncRun + any IntegrationError rows → update the
 * connection's health fields.
 *
 * v1 scope: this counts and validates records; it does not yet write them
 * into a specific project's delivery/financial models — that requires a
 * project-mapping step (which internal Project a given external
 * board/company corresponds to) this work packet didn't specify. See
 * docs/INTEGRATION_ADAPTERS.md §5 for what a follow-on needs.
 */
import { db } from '@/lib/db';
import { runUnscoped } from '@/lib/db/org-scope';
import { decryptSecret } from '@/lib/identity/crypto';
import { adapterFor } from './registry';
import { normalizeRecords } from './normalize';
import { classifySchemaMismatch } from './errors';
import type { IntegrationErrorCategory } from '@prisma/client';

/** Hard ceiling on pages pulled in one sync attempt — a serverless
 * function has a bounded execution window; a provider with more data than
 * this fits in one run picks up where `nextCursor` left off on the next
 * scheduled sync rather than a single run trying to drain everything. */
const MAX_PAGES_PER_RUN = 20;

export interface SyncOutcome {
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  recordsIngested: number;
  durationMs: number;
  errorCount: number;
}

export interface DueConnection {
  id: string;
  organizationId: string;
}

/** Every `CONNECTED` connection whose `syncIntervalMinutes` has elapsed
 * since its last sync (or that has never synced) — the cron route's work
 * queue. Cross-tenant by nature, so it runs under the same
 * `runUnscoped` marker as any other background job iterating every
 * tenant (see src/lib/db/org-scope.ts's own doc comment). */
export async function findDueConnections(): Promise<DueConnection[]> {
  return runUnscoped('scheduled-integration-sync', () =>
    db.$queryRaw<DueConnection[]>`
      SELECT id, "organizationId" FROM integration_connections
      WHERE status = 'CONNECTED'
        AND ("lastSyncAt" IS NULL OR "lastSyncAt" < now() - ("syncIntervalMinutes" || ' minutes')::interval)
      ORDER BY "lastSyncAt" ASC NULLS FIRST
      LIMIT 100
    `,
  );
}

/**
 * Run one sync attempt for `connectionId`. Caller is responsible for the
 * AUTHORIZATION check (the ops-elevation gate for the manual path, the
 * internal-token/ops-session check for the cron route) — this function
 * itself is self-contained on the tenant-SCOPE side: it always runs under
 * `runUnscoped`, so it works correctly whether the caller already has an
 * admin scope active (the manual retry action, via requireElevatedOps) or
 * none at all (the cron route, iterating every tenant with no session).
 */
export async function runSync(
  organizationId: string,
  connectionId: string,
  triggeredBy: string,
): Promise<SyncOutcome> {
  return runUnscoped('scheduled-integration-sync', () => runSyncInner(organizationId, connectionId, triggeredBy));
}

async function runSyncInner(organizationId: string, connectionId: string, triggeredBy: string): Promise<SyncOutcome> {
  const startedAt = new Date();
  const connection = await db.integrationConnection.findFirst({
    where: { organizationId, id: connectionId },
  });
  if (!connection) {
    return { status: 'FAILED', recordsIngested: 0, durationMs: 0, errorCount: 0 };
  }

  await db.integrationConnection.update({
    where: { organizationId, id: connectionId },
    data: { status: 'SYNCING' },
  });

  const adapter = adapterFor(connection.provider);
  const credential = connection.credentialCiphertext ? decryptSecret(connection.credentialCiphertext) : null;
  const config = (connection.config as Record<string, string>) ?? {};

  const errors: { category: IntegrationErrorCategory; humanMessage: string; rawDetail: string | null }[] = [];
  let recordsIngested = 0;
  let cursor: string | undefined;
  let rateLimitRemaining: number | null = null;
  let rateLimitResetAt: Date | null = null;
  let pages = 0;

  for (; pages < MAX_PAGES_PER_RUN; pages++) {
    const result = await adapter.pull({ config, credential }, cursor);
    if (!result.ok) {
      errors.push({ category: result.category, humanMessage: result.humanMessage, rawDetail: result.rawDetail ?? null });
      break;
    }

    const normalized = normalizeRecords(result.value.records);
    if (!normalized.ok) {
      const { category, humanMessage } = classifySchemaMismatch(connection.provider, normalized.detail);
      errors.push({ category, humanMessage, rawDetail: normalized.detail });
      break;
    }

    recordsIngested += normalized.records.length;
    rateLimitRemaining = result.value.rateLimitRemaining;
    rateLimitResetAt = result.value.rateLimitResetAt ? new Date(result.value.rateLimitResetAt) : null;

    if (!result.value.nextCursor) break;
    cursor = result.value.nextCursor;
  }

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();
  const status: SyncOutcome['status'] = errors.length === 0 ? 'SUCCESS' : recordsIngested > 0 ? 'PARTIAL' : 'FAILED';

  const prevAvg = connection.avgSyncDurationMs;
  const avgSyncDurationMs = prevAvg ? Math.round((prevAvg + durationMs) / 2) : durationMs;

  await db.$transaction([
    db.integrationConnection.update({
      where: { organizationId, id: connectionId },
      data: {
        status: status === 'FAILED' ? 'ERROR' : 'CONNECTED',
        lastSyncAt: finishedAt,
        lastSyncStatus: status,
        lastSyncRecordCount: recordsIngested,
        avgSyncDurationMs,
        rateLimitRemaining,
        rateLimitResetAt,
      },
    }),
    db.integrationSyncRun.create({
      data: {
        organizationId,
        connectionId,
        startedAt,
        finishedAt,
        status,
        recordsIngested,
        durationMs,
        triggeredBy,
      },
    }),
    ...errors.map((e) =>
      db.integrationError.create({
        data: {
          organizationId,
          connectionId,
          category: e.category,
          humanMessage: e.humanMessage,
          rawDetail: e.rawDetail,
        },
      }),
    ),
  ]);

  return { status, recordsIngested, durationMs, errorCount: errors.length };
}
