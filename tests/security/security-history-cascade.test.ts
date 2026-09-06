import { describe, it, expect, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { hashToken } from '@/lib/crypto/bearer-token';

/**
 * Phase 1 (v1.11.0) — security & operator-access history must survive the
 * principal it describes. Migration 00000000000019 flips three FK
 * `onDelete` actions from `Cascade` to `Restrict`:
 *
 *   staff_grants.userId          → users(id)          RESTRICT
 *   staff_elevations.userId      → users(id)          RESTRICT
 *   impersonation_grants.orgId   → organizations(id)  RESTRICT
 *
 * so a raw `DELETE` of the user / org is refused while any history row
 * exists — the compliance record cannot be destroyed by a cascade.
 * Live DB, self-cleaning.
 */
describe('security history is not cascade-deleted', () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const userIds: string[] = [];
  const orgIds: string[] = [];

  afterAll(async () => {
    // Clean up in dependency order (the point of the test is that this
    // order is *required* — the DB won't let us skip it).
    await db.staffElevation.deleteMany({ where: { userId: { in: userIds } } });
    await db.staffGrant.deleteMany({ where: { userId: { in: userIds } } });
    await db.impersonationGrant.deleteMany({ where: { organizationId: { in: orgIds } } });
    await db.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.organization.deleteMany({ where: { id: { in: orgIds } } });
  });

  async function makeUser(local: string) {
    const u = await db.user.create({ data: { email: `${local}-${stamp}@a2rventures.com`, name: local } });
    userIds.push(u.id);
    return u;
  }
  async function makeOrg(local: string) {
    const o = await db.organization.create({ data: { name: `${local} ${stamp}`, slug: `${local}-${stamp}` } });
    orgIds.push(o.id);
    return o;
  }

  it('a user with a staff grant / elevation cannot be raw-deleted — the history survives', async () => {
    const u = await makeUser('sechist');
    const grant = await db.staffGrant.create({
      data: { userId: u.id, reason: 'security-history cascade test' },
    });
    const elevation = await db.staffElevation.create({
      data: {
        userId: u.id,
        tokenHash: hashToken(`sh-${stamp}`),
        reason: 'security-history cascade test elevation',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await expect(db.user.delete({ where: { id: u.id } })).rejects.toThrow();

    // Soft-revoke / soft-end — still cannot delete; the rows are the record.
    await db.staffGrant.update({ where: { id: grant.id }, data: { revokedAt: new Date() } });
    await db.staffElevation.update({ where: { id: elevation.id }, data: { endedAt: new Date(), endedReason: 'operator' } });
    await expect(db.user.delete({ where: { id: u.id } })).rejects.toThrow();

    expect(await db.staffGrant.findUnique({ where: { id: grant.id } })).not.toBeNull();
    expect(await db.staffElevation.findUnique({ where: { id: elevation.id } })).not.toBeNull();
  });

  it('an org with an impersonation grant cannot be raw-deleted — the access record survives', async () => {
    const actor = await makeUser('sechist-op');
    const org = await makeOrg('sechist-org');
    const grant = await db.impersonationGrant.create({
      data: {
        tokenHash: hashToken(`imp-${stamp}`),
        actorId: actor.id,
        organizationId: org.id,
        reason: 'security-history cascade test',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await expect(db.organization.delete({ where: { id: org.id } })).rejects.toThrow();
    expect(await db.impersonationGrant.findUnique({ where: { id: grant.id } })).not.toBeNull();
  });

  it('AuditLog keeps the row (userId → null) when its actor user is deleted', async () => {
    const actor = await makeUser('sechist-audit');
    const org = await makeOrg('sechist-audit-org');
    const entry = await db.auditLog.create({
      data: {
        organizationId: org.id,
        userId: actor.id,
        action: 'BASELINE_LOCKED',
        entityType: 'PROJECT',
        entityId: 'p-x',
      },
    });

    // actor has no staff history → the delete is allowed …
    await db.user.delete({ where: { id: actor.id } });
    userIds.splice(userIds.indexOf(actor.id), 1);

    // … and the AuditLog row survives with a null actor.
    const after = await db.auditLog.findUnique({ where: { id: entry.id } });
    expect(after).not.toBeNull();
    expect(after?.userId).toBeNull();
  });
});
