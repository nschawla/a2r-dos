import { describe, it, expect, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { runSync } from '@/lib/integrations/sync-runner';

/**
 * Live-DB integration test for src/lib/integrations/sync-runner.ts — the
 * pipeline shared by the manual "Retry Sync" action and the cron route.
 * No auth mocking needed: `runSync` takes an organizationId/connectionId
 * directly and is self-contained on the tenant-scope side (runUnscoped
 * internally) — the AUTHORIZATION check is the caller's job, tested
 * separately wherever the server actions get their own coverage.
 */
const createdConnectionIds: string[] = [];

afterAll(async () => {
  if (createdConnectionIds.length) {
    await db.integrationError.deleteMany({ where: { connectionId: { in: createdConnectionIds } } });
    await db.integrationSyncRun.deleteMany({ where: { connectionId: { in: createdConnectionIds } } });
    await db.integrationConnection.deleteMany({ where: { id: { in: createdConnectionIds } } });
  }
});

async function demoOrgId(): Promise<string> {
  const org = await db.organization.findFirst({ where: { slug: 'a2r-ventures-demo' }, select: { id: true } });
  if (!org) throw new Error('demo org not seeded — run prisma/seed.ts against this DB first');
  return org.id;
}

describe('runSync', () => {
  it('a connection with no credential fails cleanly: FAILED status, one AUTH_EXPIRED error, connection marked ERROR', async () => {
    const organizationId = await demoOrgId();
    const connection = await db.integrationConnection.create({
      data: {
        organizationId,
        provider: 'JIRA',
        displayName: 'Sync-runner test — no credential',
        config: { baseUrl: 'https://example-test.atlassian.net', email: 'x@example.com', projectKey: 'DEL' },
        status: 'NOT_CONFIGURED',
      },
    });
    createdConnectionIds.push(connection.id);

    const outcome = await runSync(organizationId, connection.id, 'manual:test');
    expect(outcome.status).toBe('FAILED');
    expect(outcome.recordsIngested).toBe(0);
    expect(outcome.errorCount).toBe(1);

    const updated = await db.integrationConnection.findUniqueOrThrow({ where: { id: connection.id } });
    expect(updated.status).toBe('ERROR');
    expect(updated.lastSyncStatus).toBe('FAILED');
    expect(updated.lastSyncRecordCount).toBe(0);

    const errors = await db.integrationError.findMany({ where: { connectionId: connection.id } });
    expect(errors).toHaveLength(1);
    expect(errors[0]!.category).toBe('AUTH_EXPIRED');
    expect(errors[0]!.humanMessage).toMatch(/no api credential/i);

    const runs = await db.integrationSyncRun.findMany({ where: { connectionId: connection.id } });
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe('FAILED');
    expect(runs[0]!.triggeredBy).toBe('manual:test');
  });

  it('an unreachable base URL fails with a NETWORK_TIMEOUT / DNS-style error, not a thrown exception', async () => {
    const organizationId = await demoOrgId();
    const connection = await db.integrationConnection.create({
      data: {
        organizationId,
        provider: 'NETSUITE',
        displayName: 'Sync-runner test — unreachable host',
        config: { accountId: 'this-account-does-not-exist-a2r-test' },
        // A credential IS present here — past the notConfiguredError guard,
        // so the real fetch attempt (and its failure) is what's exercised.
        credentialCiphertext: (await import('@/lib/identity/crypto')).encryptSecret('fake-token'),
        status: 'CONNECTED',
      },
    });
    createdConnectionIds.push(connection.id);

    const outcome = await runSync(organizationId, connection.id, 'manual:test');
    expect(outcome.status).toBe('FAILED');
    expect(outcome.errorCount).toBe(1);

    const errors = await db.integrationError.findMany({ where: { connectionId: connection.id } });
    expect(errors[0]!.category).toBe('NETWORK_TIMEOUT');
  }, 20_000);

  it('an unknown connectionId returns FAILED without throwing or writing any rows', async () => {
    const organizationId = await demoOrgId();
    const outcome = await runSync(organizationId, 'does-not-exist', 'manual:test');
    expect(outcome).toEqual({ status: 'FAILED', recordsIngested: 0, durationMs: 0, errorCount: 0 });
  });
});
