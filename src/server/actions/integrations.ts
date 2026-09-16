'use server';

/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Read-Only External Integration Adapter server actions. Same model as
 * identity.ts: platform infrastructure an A2R operator configures on a
 * tenant's behalf from the Ops Console (/ops/integrations), not
 * tenant self-service — external-system credentials carry the same
 * "operator-configured" trust boundary as an SSO client secret. Every
 * action requires an elevated operator session (`integrations:manage`)
 * and is written to that tenant's Compliance Ledger.
 */
import { withAction } from '@/lib/observability/action-wrapper';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { requireElevatedOps, requireOpsContext } from '@/lib/ops-auth';
import { loadConnectionErrors, type ErrorLogRow } from '@/server/queries/pages/ops-integrations';
import { recordLedgerEvent } from '@/lib/audit-ledger';
import { decryptSecret, encryptSecret, secretFingerprint } from '@/lib/identity/crypto';
import { adapterFor } from '@/lib/integrations/registry';
import { runSync } from '@/lib/integrations/sync-runner';
import type { ActionResult } from './auth';

const PROVIDERS = ['JIRA', 'ASANA', 'MONDAY', 'NETSUITE', 'CERTINIA', 'KANTATA', 'OPENAIR', 'SALESFORCE'] as const;

async function authorizeIntegrationAction(
  organizationId: string,
): Promise<{ ok: true; actorId: string } | { ok: false; error: string }> {
  const gate = await requireElevatedOps('integrations:manage');
  if (!gate.ok) {
    return { ok: false, error: gate.reason === 'ELEVATION_REQUIRED' ? 'ELEVATION_REQUIRED' : 'Not authorized.' };
  }
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
  if (!org) return { ok: false, error: 'Unknown tenant.' };
  return { ok: true, actorId: gate.ops.userId };
}

async function logIntegrationChange(
  organizationId: string,
  actorId: string,
  op: string,
  detail?: Record<string, unknown>,
) {
  await recordLedgerEvent(db, {
    organizationId,
    actorId,
    actionType: 'INTEGRATION_CONFIG_CHANGE',
    targetResource: `IntegrationConnection:${organizationId}`,
    metadata: { op, ...(detail ?? {}) },
  });
  revalidatePath('/ops/integrations');
  revalidatePath('/admin/audit-log');
}

const withOrg = <T extends z.ZodRawShape>(shape: T) =>
  z.strictObject({ organizationId: z.string().min(1), ...shape });

// ─────────────────────────────────────────────────── create / update

const upsertSchema = withOrg({
  connectionId: z.string().optional(), // present = update, absent = create
  provider: z.enum(PROVIDERS),
  displayName: z.string().min(2).max(120),
  config: z.record(z.string().max(500)),
  credential: z.string().max(4000).optional(), // blank on update = leave the stored secret untouched
  syncIntervalMinutes: z.coerce.number().int().min(15).max(1440),
});

export const upsertIntegrationConnection = withAction(
  'upsertIntegrationConnection',
  async (input: unknown): Promise<ActionResult> => {
    const parsed = upsertSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
    const d = parsed.data;
    const auth = await authorizeIntegrationAction(d.organizationId);
    if (!auth.ok) return { ok: false, error: auth.error };

    const newCredential = (d.credential ?? '').trim();
    const secretPatch = newCredential
      ? { credentialCiphertext: encryptSecret(newCredential), credentialFingerprint: secretFingerprint(newCredential) }
      : {};

    const base = {
      provider: d.provider,
      displayName: d.displayName.trim(),
      config: d.config,
      syncIntervalMinutes: d.syncIntervalMinutes,
    };

    if (d.connectionId) {
      const existing = await db.integrationConnection.findFirst({
        where: { organizationId: d.organizationId, id: d.connectionId },
        select: { id: true },
      });
      if (!existing) return { ok: false, error: 'Unknown connection.' };
      await db.integrationConnection.update({
        where: { organizationId: d.organizationId, id: d.connectionId },
        data: { ...base, ...secretPatch, ...(newCredential ? { status: 'CONNECTED' } : {}) },
      });
    } else {
      await db.integrationConnection.create({
        data: {
          organizationId: d.organizationId,
          ...base,
          ...secretPatch,
          status: newCredential ? 'CONNECTED' : 'NOT_CONFIGURED',
        },
      });
    }

    await logIntegrationChange(d.organizationId, auth.actorId, d.connectionId ? 'update' : 'create', {
      provider: d.provider,
      credentialRotated: newCredential ? secretFingerprint(newCredential) : undefined,
    });
    return { ok: true };
  },
);

// ─────────────────────────────────────────────────── test connection

const testSchema = withOrg({ connectionId: z.string().min(1) });

type TestResult = { ok: true; accountLabel: string } | { ok: false; error: string };

export const testIntegrationConnection = withAction(
  'testIntegrationConnection',
  async (input: unknown): Promise<TestResult> => {
    const parsed = testSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Invalid input' };
    const auth = await authorizeIntegrationAction(parsed.data.organizationId);
    if (!auth.ok) return { ok: false, error: auth.error };

    const connection = await db.integrationConnection.findFirst({
      where: { organizationId: parsed.data.organizationId, id: parsed.data.connectionId },
    });
    if (!connection) return { ok: false, error: 'Unknown connection.' };

    const credential = connection.credentialCiphertext ? decryptSecret(connection.credentialCiphertext) : null;
    const adapter = adapterFor(connection.provider);
    const result = await adapter.testConnection({
      config: (connection.config as Record<string, string>) ?? {},
      credential,
    });

    if (!result.ok) {
      await db.integrationError.create({
        data: {
          organizationId: parsed.data.organizationId,
          connectionId: connection.id,
          category: result.category,
          humanMessage: result.humanMessage,
          rawDetail: result.rawDetail ?? null,
        },
      });
      await db.integrationConnection.update({
        where: { organizationId: parsed.data.organizationId, id: connection.id },
        data: { status: 'ERROR' },
      });
      revalidatePath('/ops/integrations');
      return { ok: false, error: result.humanMessage };
    }

    await db.integrationConnection.update({
      where: { organizationId: parsed.data.organizationId, id: connection.id },
      data: { status: 'CONNECTED' },
    });
    revalidatePath('/ops/integrations');
    return { ok: true, accountLabel: result.value.accountLabel };
  },
);

// ─────────────────────────────────────────────────── retry sync

const syncSchema = withOrg({ connectionId: z.string().min(1) });

export const retrySyncAction = withAction('retrySyncAction', async (input: unknown): Promise<ActionResult> => {
  const parsed = syncSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid input' };
  const auth = await authorizeIntegrationAction(parsed.data.organizationId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const outcome = await runSync(parsed.data.organizationId, parsed.data.connectionId, `manual:${auth.actorId}`);
  await logIntegrationChange(parsed.data.organizationId, auth.actorId, 'retry-sync', {
    status: outcome.status,
    recordsIngested: outcome.recordsIngested,
  });
  if (outcome.status === 'FAILED') {
    return { ok: false, error: 'Sync failed — see the error log below for details.' };
  }
  return { ok: true };
});

// ─────────────────────────────────────────────────── error log (read-only)

export const loadConnectionErrorsAction = withAction(
  'loadConnectionErrorsAction',
  async (organizationId: string, connectionId: string): Promise<{ ok: true; errors: ErrorLogRow[] } | { ok: false; error: string }> => {
    // View-only — no elevation needed, unlike the mutating actions above.
    const ops = await requireOpsContext();
    if (!ops.can('integrations:view')) return { ok: false, error: 'Not authorized.' };
    const errors = await loadConnectionErrors(organizationId, connectionId);
    return { ok: true, errors };
  },
);

// ─────────────────────────────────────────────────── delete

export const deleteIntegrationConnection = withAction(
  'deleteIntegrationConnection',
  async (organizationId: string, connectionId: string): Promise<ActionResult> => {
    const auth = await authorizeIntegrationAction(organizationId);
    if (!auth.ok) return { ok: false, error: auth.error };
    const existing = await db.integrationConnection.findFirst({
      where: { organizationId, id: connectionId },
      select: { provider: true },
    });
    if (!existing) return { ok: true };
    await db.integrationConnection.delete({ where: { organizationId, id: connectionId } });
    await logIntegrationChange(organizationId, auth.actorId, 'delete', { provider: existing.provider });
    return { ok: true };
  },
);
