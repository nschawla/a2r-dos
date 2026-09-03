import { describe, it, expect, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { recordLedgerEvent, verifyLedgerIntegrity } from '@/lib/audit-ledger';

/**
 * REL-3 — the Immutable Compliance Ledger's SHA-256 hash chain must stay
 * single-threaded per tenant even under parallel appends. `recordLedgerEvent`
 * takes a per-tenant Postgres advisory lock and the schema carries a
 * `@@unique([organizationId, previousHash])` backstop, so concurrent
 * appends serialize instead of forking the chain.
 *
 * Live-DB. Self-cleaning: the ledger FK is `onDelete: Restrict`, so each
 * test org's chain is cleared before the org is dropped.
 */
describe('Immutable Audit Ledger — concurrency (REL-3)', () => {
  const createdOrgIds: string[] = [];

  afterAll(async () => {
    for (const id of createdOrgIds) {
      await db.immutableAuditLedger.deleteMany({ where: { organizationId: id } });
      await db.organization.delete({ where: { id } }).catch(() => {});
    }
  });

  async function freshOrg() {
    const org = await db.organization.create({
      data: {
        name: 'Ledger Concurrency Test',
        slug: `ledger-conc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      },
    });
    createdOrgIds.push(org.id);
    return org;
  }

  it('keeps a valid tamper-evident hash chain under parallel append pressure', async () => {
    const org = await freshOrg();
    const N = 12;

    const results = await Promise.allSettled(
      Array.from({ length: N }, (_, i) =>
        recordLedgerEvent(db, {
          organizationId: org.id,
          actorId: `stress-actor-${i}`,
          actionType: 'SECURITY_CONFIG_CHANGE',
          targetResource: `Organization:${org.id}`,
          metadata: { test: 'concurrency', index: i },
        })
      )
    );

    // Every append committed a row — none rejected, none silently dropped.
    const committed = results.filter((r) => r.status === 'fulfilled' && r.value !== null);
    expect(committed).toHaveLength(N);

    const rows = await db.immutableAuditLedger.findMany({
      where: { organizationId: org.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(rows).toHaveLength(N);

    // Exactly one genesis row, and no predecessor is claimed twice (no fork).
    expect(rows.filter((r) => r.previousHash === null)).toHaveLength(1);
    const prevHashes = rows.map((r) => r.previousHash).filter((h): h is string => h !== null);
    expect(new Set(prevHashes).size).toBe(prevHashes.length);

    // Each row links to the one before it.
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.previousHash).toBe(rows[i - 1]!.currentHash);
    }

    // The service's own verifier agrees the chain is intact.
    const integrity = await verifyLedgerIntegrity(org.id);
    expect(integrity.ok).toBe(true);
    expect(integrity.count).toBe(N);
  });

  it('appends made from independent transactions also chain cleanly', async () => {
    const org = await freshOrg();
    const N = 6;

    await Promise.allSettled(
      Array.from({ length: N }, (_, i) =>
        db.$transaction((tx) =>
          recordLedgerEvent(tx, {
            organizationId: org.id,
            actorId: `tx-actor-${i}`,
            actionType: 'ROLE_POLICY_CHANGE',
            targetResource: `RoleUtilizationPolicy:tx-${i}`,
          })
        )
      )
    );

    const integrity = await verifyLedgerIntegrity(org.id);
    expect(integrity.ok).toBe(true);
    expect(integrity.count).toBe(N);
  });

  it('still detects a genuinely tampered row', async () => {
    const org = await freshOrg();
    await recordLedgerEvent(db, {
      organizationId: org.id,
      actorId: 'a',
      actionType: 'BASELINE_OVERRIDE',
      targetResource: 'Project:x',
    });
    const second = await recordLedgerEvent(db, {
      organizationId: org.id,
      actorId: 'b',
      actionType: 'BASELINE_OVERRIDE',
      targetResource: 'Project:y',
    });
    expect(second).not.toBeNull();

    // Edit a field of the 2nd row directly — the "immutable" guarantee is
    // by convention (no app write path), so a raw update is the tamper.
    await db.immutableAuditLedger.update({
      where: { id: second!.id },
      data: { actorId: 'tampered-actor' },
    });

    const integrity = await verifyLedgerIntegrity(org.id);
    expect(integrity.ok).toBe(false);
    expect(integrity.reason).toBe('hash-recompute-mismatch');
  });
});
