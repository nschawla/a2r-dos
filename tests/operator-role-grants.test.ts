import { describe, it, expect, vi, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, cache: <T>(fn: T): T => fn };
});
const { mockGetServerSession, cookieJar } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  cookieJar: { store: new Map<string, string>() },
}));
vi.mock('next-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-auth')>();
  return { ...actual, getServerSession: mockGetServerSession };
});
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (n: string) => (cookieJar.store.has(n) ? { name: n, value: cookieJar.store.get(n) } : undefined),
    set: (n: string, v: string) => cookieJar.store.set(n, v),
    delete: (n: string) => cookieJar.store.delete(n),
  }),
  headers: () => new Headers(),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { db } from '@/lib/db';
import { grantStaffAccess, activeOperatorRole, setOperatorRole } from '@/lib/ops/staff-grants';
import { getOpsContextOrNull, requireOpsCapability, requireElevatedOps } from '@/lib/ops-auth';

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const createdUserIds: string[] = [];

async function makeOperator(local: string, role: 'SUPER_ADMIN' | 'SUPPORT' | 'VIEWER' | 'AUDITOR' = 'SUPER_ADMIN') {
  const email = `role-${local}-${stamp}@a2rventures.com`;
  const u = await db.user.create({ data: { email, name: local, passwordHash: await bcrypt.hash('x'.repeat(12), 10) } });
  createdUserIds.push(u.id);
  await grantStaffAccess({ email, grantedByUserId: u.id, reason: 'role test', role });
  return u;
}
function signIn(u: { id: string; email: string }) {
  mockGetServerSession.mockResolvedValue({
    user: { id: u.id, email: u.email, name: 'Op', isA2rStaff: true, mustChangePassword: false },
    sessionVersion: 0,
  });
}

afterAll(async () => {
  vi.restoreAllMocks();
  const ids = createdUserIds.splice(0);
  if (ids.length) {
    await db.staffGrant.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  }
});

describe('operator role — grant + resolve', () => {
  it('grantStaffAccess records the role; activeOperatorRole reads it back', async () => {
    const u = await makeOperator('support', 'SUPPORT');
    expect(await activeOperatorRole(u.id)).toBe('SUPPORT');
    expect(await activeOperatorRole('nobody')).toBeNull();
  });

  it('grantStaffAccess defaults to SUPER_ADMIN when no role given', async () => {
    const email = `role-default-${stamp}@a2rventures.com`;
    const u = await db.user.create({ data: { email, name: 'd', passwordHash: await bcrypt.hash('x'.repeat(12), 10) } });
    createdUserIds.push(u.id);
    await grantStaffAccess({ email, grantedByUserId: u.id, reason: 'default role test' });
    expect(await activeOperatorRole(u.id)).toBe('SUPER_ADMIN');
  });

  it('the OpsContext carries the role and a working can()', async () => {
    const u = await makeOperator('ctx', 'AUDITOR');
    signIn(u);
    const ops = await getOpsContextOrNull();
    expect(ops?.role).toBe('AUDITOR');
    expect(ops?.can('audit:view')).toBe(true);
    expect(ops?.can('tenants:provision')).toBe(false);
  });
});

describe('operator role — guards', () => {
  it('requireOpsCapability redirects when the role lacks the capability', async () => {
    const u = await makeOperator('viewer', 'VIEWER');
    signIn(u);
    await expect(requireOpsCapability('tenants:view')).rejects.toThrow(/REDIRECT:\/ops\/telemetry/);
    await expect(requireOpsCapability('telemetry:view')).resolves.toMatchObject({ role: 'VIEWER' });
  });

  it('requireElevatedOps(capability) returns ROLE_FORBIDDEN before checking elevation', async () => {
    const u = await makeOperator('forbidden', 'SUPPORT');
    signIn(u);
    const gate = await requireElevatedOps('tenants:provision');
    expect(gate).toEqual({ ok: false, reason: 'ROLE_FORBIDDEN' });
  });
});

describe('operator role — setOperatorRole', () => {
  it('re-grants with the new role, revoking the old grant', async () => {
    const target = await makeOperator('target', 'VIEWER');
    const actor = await makeOperator('actor', 'SUPER_ADMIN');
    expect(await activeOperatorRole(target.id)).toBe('VIEWER');

    const res = await setOperatorRole({ targetUserId: target.id, role: 'BILLING', actingUserId: actor.id });
    expect(res.ok).toBe(true);
    expect(await activeOperatorRole(target.id)).toBe('BILLING');

    const rows = await db.staffGrant.findMany({ where: { userId: target.id } });
    expect(rows.filter((r) => r.revokedAt === null)).toHaveLength(1);
    expect(rows.filter((r) => r.revokedAt !== null)).toHaveLength(1);
  });

  it('refuses to change your own role', async () => {
    const u = await makeOperator('self', 'SUPER_ADMIN');
    const res = await setOperatorRole({ targetUserId: u.id, role: 'VIEWER', actingUserId: u.id });
    expect(res).toMatchObject({ ok: false });
  });

  it('no-op success when the role is already set', async () => {
    const target = await makeOperator('same', 'SUPPORT');
    const actor = await makeOperator('actor2', 'SUPER_ADMIN');
    const res = await setOperatorRole({ targetUserId: target.id, role: 'SUPPORT', actingUserId: actor.id });
    expect(res.ok).toBe(true);
    const rows = await db.staffGrant.findMany({ where: { userId: target.id, revokedAt: null } });
    expect(rows).toHaveLength(1); // unchanged
  });
});
