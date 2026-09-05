import { describe, it, expect, afterAll } from 'vitest';
import { db } from '@/lib/db';
import {
  hasActiveStaffGrant,
  grantStaffAccess,
  revokeStaffAccess,
  listActiveStaffGrants,
} from '@/lib/ops/staff-grants';

/**
 * P0 #2 — explicit staff-access entitlements replace the `User.isA2rStaff`
 * boolean + the `@a2rventures.com` email wildcard. Live DB, self-cleaning.
 */
describe('Explicit staff-access grants', () => {
  const createdUserIds: string[] = [];
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  async function makeUser(local: string): Promise<{ id: string; email: string }> {
    const email = `${local}-${stamp}@a2rventures.com`; // corporate domain — must NOT matter
    const u = await db.user.create({ data: { email, name: local } });
    createdUserIds.push(u.id);
    return { id: u.id, email };
  }

  afterAll(async () => {
    const ids = createdUserIds.splice(0);
    if (ids.length) {
      await db.staffGrant.deleteMany({ where: { userId: { in: ids } } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
    }
  });

  it('an @a2rventures.com email alone confers NO staff access', async () => {
    const u = await makeUser('nobody');
    expect(await hasActiveStaffGrant(u.id)).toBe(false);
  });

  it('a null / unknown user id is not staff', async () => {
    expect(await hasActiveStaffGrant(null)).toBe(false);
    expect(await hasActiveStaffGrant('does-not-exist')).toBe(false);
  });

  it('an explicit grant confers access; revoking removes it and keeps history', async () => {
    const operator = await makeUser('operator');
    const target = await makeUser('target');

    const granted = await grantStaffAccess({
      email: target.email,
      grantedByUserId: operator.id,
      reason: 'unit test grant',
    });
    expect(granted).toEqual({ ok: true });

    const rows = await db.staffGrant.findMany({ where: { userId: target.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.revokedAt).toBeNull();
    expect(rows[0]?.grantedByUserId).toBe(operator.id);
    expect(await hasActiveStaffGrant(target.id)).toBe(true);

    const revoked = await revokeStaffAccess({ email: target.email, revokedByUserId: operator.id });
    expect(revoked).toEqual({ ok: true });

    // history row survives, now revoked
    const after = await db.staffGrant.findMany({ where: { userId: target.id } });
    expect(after).toHaveLength(1);
    expect(after[0]?.revokedAt).not.toBeNull();
    expect(after[0]?.revokedByUserId).toBe(operator.id);
    expect(await hasActiveStaffGrant(target.id)).toBe(false);
  });

  it('grant is idempotent and rejects an unknown account / thin reason', async () => {
    const u = await makeUser('idem');
    expect(await grantStaffAccess({ email: u.email, grantedByUserId: u.id, reason: 'first' })).toEqual({ ok: true });
    expect(await grantStaffAccess({ email: u.email, grantedByUserId: u.id, reason: 'again' })).toEqual({ ok: true });
    expect(await db.staffGrant.count({ where: { userId: u.id, revokedAt: null } })).toBe(1);

    const missing = await grantStaffAccess({
      email: `ghost-${stamp}@a2rventures.com`,
      grantedByUserId: u.id,
      reason: 'x',
    });
    expect(missing.ok).toBe(false);

    const thin = await grantStaffAccess({ email: u.email, grantedByUserId: u.id, reason: 'x' });
    expect(thin.ok).toBe(false);
  });

  it('an operator cannot revoke their own access', async () => {
    const u = await makeUser('self');
    await grantStaffAccess({ email: u.email, grantedByUserId: u.id, reason: 'self test' });
    const res = await revokeStaffAccess({ email: u.email, revokedByUserId: u.id });
    expect(res.ok).toBe(false);
    expect(await db.staffGrant.count({ where: { userId: u.id, revokedAt: null } })).toBe(1);
  });

  it('listActiveStaffGrants surfaces the granter email and excludes revoked rows', async () => {
    const operator = await makeUser('lister-op');
    const kept = await makeUser('lister-kept');
    const gone = await makeUser('lister-gone');
    await grantStaffAccess({ email: kept.email, grantedByUserId: operator.id, reason: 'stays' });
    await grantStaffAccess({ email: gone.email, grantedByUserId: operator.id, reason: 'goes' });
    await revokeStaffAccess({ email: gone.email, revokedByUserId: operator.id });

    const list = await listActiveStaffGrants();
    const keptRow = list.find((r) => r.userEmail === kept.email);
    expect(keptRow?.grantedByEmail).toBe(operator.email);
    expect(list.some((r) => r.userEmail === gone.email)).toBe(false);
  });
});
