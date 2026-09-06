import { describe, it, expect, vi, beforeEach } from 'vitest';

// React Server `cache()` is undefined in the plain-Node test runtime;
// src/lib/identity/service.ts (pulled in transitively via @/lib/auth) calls
// it at import time. Passthrough shim, scoped to this file.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, cache: <T>(fn: T): T => fn };
});

// getServerSession is the only thing the rotation guards touch — stub it so
// these stay pure (no DB, no request context).
const { mockGetServerSession } = vi.hoisted(() => ({ mockGetServerSession: vi.fn() }));
vi.mock('next-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-auth')>();
  return { ...actual, getServerSession: mockGetServerSession };
});

import {
  PASSWORD_CHANGE_REQUIRED,
  PasswordChangeRequiredError,
  isPasswordChangeRequiredError,
  sessionRequiresPasswordChange,
  assertPasswordRotationClear,
  passwordRotationGate,
  tokenIsRevokedByPasswordChange,
} from '@/lib/auth/password-rotation';
import { switchActiveOrganization } from '@/server/actions/organizations';
import { GET as portfolioCsvGET } from '@/app/api/reports/portfolio-csv/route';

const clean = { user: { id: 'u1', mustChangePassword: false } };
const rotating = { user: { id: 'u1', mustChangePassword: true } };

beforeEach(() => mockGetServerSession.mockReset());

describe('PasswordChangeRequiredError', () => {
  it('carries the code and a 403 mapping', () => {
    const err = new PasswordChangeRequiredError();
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe(PASSWORD_CHANGE_REQUIRED);
    expect(err.status).toBe(403);
  });

  it('isPasswordChangeRequiredError recognises the class and a duck-typed value', () => {
    expect(isPasswordChangeRequiredError(new PasswordChangeRequiredError())).toBe(true);
    expect(isPasswordChangeRequiredError({ code: PASSWORD_CHANGE_REQUIRED })).toBe(true);
    expect(isPasswordChangeRequiredError(new Error('nope'))).toBe(false);
    expect(isPasswordChangeRequiredError(null)).toBe(false);
    expect(isPasswordChangeRequiredError('PASSWORD_CHANGE_REQUIRED')).toBe(false);
  });
});

describe('tokenIsRevokedByPasswordChange', () => {
  it('revokes a token issued before the change', () => {
    expect(tokenIsRevokedByPasswordChange(1_000, new Date(2_000_000))).toBe(true);
  });
  it('keeps a token issued after the change', () => {
    expect(tokenIsRevokedByPasswordChange(3_000, new Date(2_000_000))).toBe(false);
  });
  it('keeps a token issued in the same second as the change (the fresh mint)', () => {
    // change at 1000.400s → floor 1000; fresh token iat 1000
    expect(tokenIsRevokedByPasswordChange(1_000, new Date(1_000_400))).toBe(false);
  });
  it('never revokes when there is no passwordChangedAt or no iat', () => {
    expect(tokenIsRevokedByPasswordChange(1_000, null)).toBe(false);
    expect(tokenIsRevokedByPasswordChange(undefined, new Date())).toBe(false);
    expect(tokenIsRevokedByPasswordChange('x', new Date())).toBe(false);
  });
});

describe('sessionRequiresPasswordChange / assertPasswordRotationClear / passwordRotationGate', () => {
  it('detects a forced-rotation session, and ignores clean / absent ones', async () => {
    mockGetServerSession.mockResolvedValueOnce(rotating);
    expect(await sessionRequiresPasswordChange()).toBe(true);
    mockGetServerSession.mockResolvedValueOnce(clean);
    expect(await sessionRequiresPasswordChange()).toBe(false);
    mockGetServerSession.mockResolvedValueOnce(null);
    expect(await sessionRequiresPasswordChange()).toBe(false);
  });

  it('assertPasswordRotationClear throws only for a rotation session', async () => {
    mockGetServerSession.mockResolvedValueOnce(rotating);
    await expect(assertPasswordRotationClear()).rejects.toBeInstanceOf(PasswordChangeRequiredError);
    mockGetServerSession.mockResolvedValueOnce(clean);
    await expect(assertPasswordRotationClear()).resolves.toBeUndefined();
  });

  it('passwordRotationGate returns a 403 PASSWORD_CHANGE_REQUIRED response, else null', async () => {
    mockGetServerSession.mockResolvedValueOnce(rotating);
    const blocked = await passwordRotationGate();
    expect(blocked).not.toBeNull();
    expect(blocked!.status).toBe(403);
    expect(await blocked!.json()).toMatchObject({ error: PASSWORD_CHANGE_REQUIRED });

    mockGetServerSession.mockResolvedValueOnce(clean);
    expect(await passwordRotationGate()).toBeNull();
  });
});

describe('direct action / route calls are rejected in rotation state', () => {
  it('a Server Action (switchActiveOrganization) returns PASSWORD_CHANGE_REQUIRED, does no work', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 'u1', mustChangePassword: true },
      memberships: [{ organizationId: 'org-1' }],
    });
    const res = await switchActiveOrganization('org-1');
    expect(res).toEqual({ ok: false, error: PASSWORD_CHANGE_REQUIRED });
  });

  it('a Route Handler (GET /api/reports/portfolio-csv) responds 403 without touching the DB', async () => {
    mockGetServerSession.mockResolvedValue(rotating);
    const res = await portfolioCsvGET(new Request('http://localhost/api/reports/portfolio-csv'), undefined);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: PASSWORD_CHANGE_REQUIRED });
  });
});
