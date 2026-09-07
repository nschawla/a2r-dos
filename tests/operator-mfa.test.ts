import { describe, it, expect, afterAll } from 'vitest';
import { authenticator } from 'otplib';
import { db } from '@/lib/db';
import {
  getMfaStatus,
  hasActivatedMfa,
  beginEnrollment,
  activateEnrollment,
  verifySecondFactor,
  disableMfa,
} from '@/lib/ops/operator-mfa';

/**
 * Batch 2 — operator second factor (TOTP). Live DB, self-cleaning.
 * Enrollment ceremony, verification, anti-replay, recovery codes.
 */
describe('operator MFA (TOTP)', () => {
  const createdUserIds: string[] = [];
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  async function makeUser(local: string): Promise<string> {
    const u = await db.user.create({
      data: { email: `mfa-${local}-${stamp}@a2rventures.com`, name: local },
    });
    createdUserIds.push(u.id);
    return u.id;
  }

  /** Full enroll + activate; returns the shared secret. */
  async function enroll(userId: string): Promise<string> {
    const { secret } = await beginEnrollment(userId, 'op@a2rventures.com');
    const res = await activateEnrollment(userId, authenticator.generate(secret));
    if (!res.ok) throw new Error(`activation failed: ${res.reason}`);
    return secret;
  }

  afterAll(async () => {
    const ids = createdUserIds.splice(0);
    if (ids.length) {
      await db.operatorMfa.deleteMany({ where: { userId: { in: ids } } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
    }
  });

  it('status is not-enrolled before any setup', async () => {
    const userId = await makeUser('fresh');
    expect(await getMfaStatus(userId)).toMatchObject({ enrolled: false, activated: false, pending: false });
    expect(await hasActivatedMfa(userId)).toBe(false);
  });

  it('beginEnrollment issues a pending secret + otpauth URI + QR, without activating', async () => {
    const userId = await makeUser('pending');
    const challenge = await beginEnrollment(userId, 'op@a2rventures.com');
    expect(challenge.secret).toMatch(/^[A-Z2-7]+$/);
    expect(challenge.otpauthUri).toContain('otpauth://totp/');
    expect(challenge.qrDataUri).toMatch(/^data:image\/png;base64,/);

    const status = await getMfaStatus(userId);
    expect(status).toMatchObject({ enrolled: true, activated: false, pending: true });
    expect(await hasActivatedMfa(userId)).toBe(false);

    // a pending-only enrollment does NOT satisfy the elevation requirement
    expect(await verifySecondFactor(userId, authenticator.generate(challenge.secret))).toEqual({
      ok: false,
      reason: 'NOT_ACTIVATED',
    });
  });

  it('activateEnrollment rejects a bad code, accepts a live one, and issues 10 recovery codes', async () => {
    const userId = await makeUser('activate');
    const { secret } = await beginEnrollment(userId, 'op@a2rventures.com');

    expect(await activateEnrollment(userId, '000000')).toEqual({ ok: false, reason: 'BAD_CODE' });

    const res = await activateEnrollment(userId, authenticator.generate(secret));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.recoveryCodes).toHaveLength(10);
    expect(new Set(res.recoveryCodes).size).toBe(10);
    expect(res.recoveryCodes[0]).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);

    expect(await hasActivatedMfa(userId)).toBe(true);
    expect(await getMfaStatus(userId)).toMatchObject({ activated: true, pending: false });
  });

  it('verifySecondFactor accepts a valid TOTP, rejects a wrong one', async () => {
    const userId = await makeUser('verify');
    const secret = await enroll(userId);

    expect(await verifySecondFactor(userId, authenticator.generate(secret))).toEqual({
      ok: true,
      method: 'totp',
    });
    expect(await verifySecondFactor(userId, '123456')).toMatchObject({ ok: false });
    expect(await verifySecondFactor(userId, '')).toEqual({ ok: false, reason: 'BAD_CODE' });
  });

  it('anti-replay — the same TOTP code cannot be used twice', async () => {
    const userId = await makeUser('replay');
    const secret = await enroll(userId);

    const code = authenticator.generate(secret);
    expect((await verifySecondFactor(userId, code)).ok).toBe(true);
    expect(await verifySecondFactor(userId, code)).toEqual({ ok: false, reason: 'REPLAYED' });
  });

  it('recovery codes work once each, then are consumed', async () => {
    const userId = await makeUser('recovery');
    const { secret } = await beginEnrollment(userId, 'op@a2rventures.com');
    const res = await activateEnrollment(userId, authenticator.generate(secret));
    if (!res.ok) throw new Error('setup');
    const [first, second] = res.recoveryCodes;

    expect(await verifySecondFactor(userId, first!.toLowerCase())).toEqual({ ok: true, method: 'recovery' });
    expect(await verifySecondFactor(userId, first!)).toMatchObject({ ok: false }); // consumed
    expect(await verifySecondFactor(userId, second!)).toEqual({ ok: true, method: 'recovery' });

    const row = await db.operatorMfa.findUnique({ where: { userId } });
    expect((row?.recoveryCodeHashes as string[]).length).toBe(8);
  });

  it('NO_MFA for an operator who never enrolled', async () => {
    const userId = await makeUser('none');
    expect(await verifySecondFactor(userId, '123456')).toEqual({ ok: false, reason: 'NO_MFA' });
  });

  it('disableMfa removes the enrollment entirely', async () => {
    const userId = await makeUser('disable');
    await enroll(userId);
    expect(await hasActivatedMfa(userId)).toBe(true);
    await disableMfa(userId);
    expect(await getMfaStatus(userId)).toMatchObject({ enrolled: false });
  });
});
