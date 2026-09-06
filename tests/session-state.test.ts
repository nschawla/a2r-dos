import { describe, it, expect } from 'vitest';
import {
  SESSION_STATES,
  SESSION_TRANSITIONS,
  isValidTransition,
  assertTransition,
  InvalidSessionTransitionError,
  deriveSessionState,
  stateAllowsAccess,
  type SessionState,
  type SessionStateInput,
} from '@/lib/auth/session-state';

// A baseline ACTIVE input; each test overrides just what it exercises.
function input(over: {
  token?: Partial<SessionStateInput['token']>;
  account?: SessionStateInput['account'];
  lookupFailed?: boolean;
} = {}): SessionStateInput {
  return {
    token: { userId: 'u1', sessionVersion: 3, issuedAtSec: 2_000, revoked: false, ...over.token },
    account: over.account ?? {
      exists: true,
      sessionVersion: 3,
      mustChangePassword: false,
      passwordChangedAt: null,
    },
    lookupFailed: over.lookupFailed ?? false,
  };
}

describe('deriveSessionState — the happy paths', () => {
  it('a fully-valid token → ACTIVE', () => {
    expect(deriveSessionState(input())).toBe('ACTIVE');
  });

  it('a valid token whose account must rotate its password → PENDING_PASSWORD_CHANGE', () => {
    expect(
      deriveSessionState(
        input({ account: { exists: true, sessionVersion: 3, mustChangePassword: true, passwordChangedAt: null } }),
      ),
    ).toBe('PENDING_PASSWORD_CHANGE');
  });
});

describe('deriveSessionState — REVOKED, fail-closed on every uncertainty', () => {
  it('the DB lookup failed / timed out', () => {
    expect(deriveSessionState(input({ lookupFailed: true }))).toBe('REVOKED');
    // ...even if the (stale) account snapshot would have been fine:
    expect(
      deriveSessionState({
        token: { userId: 'u1', sessionVersion: 3, issuedAtSec: 2_000 },
        account: { exists: true, sessionVersion: 3, mustChangePassword: false, passwordChangedAt: null },
        lookupFailed: true,
      }),
    ).toBe('REVOKED');
  });

  it('the account row is gone (deleted user)', () => {
    expect(deriveSessionState(input({ account: { exists: false } }))).toBe('REVOKED');
  });

  it('the token carries no userId', () => {
    expect(deriveSessionState(input({ token: { userId: undefined } }))).toBe('REVOKED');
    expect(deriveSessionState(input({ token: { userId: null } }))).toBe('REVOKED');
  });

  it('the token is already flagged revoked (sticky)', () => {
    expect(deriveSessionState(input({ token: { revoked: true } }))).toBe('REVOKED');
  });

  it('sessionVersion mismatch — the account was bumped after this token was minted', () => {
    expect(
      deriveSessionState(
        input({
          token: { sessionVersion: 3 },
          account: { exists: true, sessionVersion: 4, mustChangePassword: false, passwordChangedAt: null },
        }),
      ),
    ).toBe('REVOKED');
  });

  it('a far-behind token (concurrent double password change) is still REVOKED', () => {
    expect(
      deriveSessionState(
        input({
          token: { sessionVersion: 3 },
          account: { exists: true, sessionVersion: 5, mustChangePassword: false, passwordChangedAt: null },
        }),
      ),
    ).toBe('REVOKED');
  });

  it('the token predates passwordChangedAt even though the version matched', () => {
    expect(
      deriveSessionState(
        input({
          token: { sessionVersion: 3, issuedAtSec: 1_000 },
          account: {
            exists: true,
            sessionVersion: 3,
            mustChangePassword: false,
            passwordChangedAt: new Date(1_500_000), // 1500s → token iat 1000 < 1500
          },
        }),
      ),
    ).toBe('REVOKED');
  });
});

describe('deriveSessionState — edge cases', () => {
  it('a legacy token (no sessionVersion claim) is accepted while the account is still at 0', () => {
    expect(
      deriveSessionState({
        token: { userId: 'u1', sessionVersion: undefined, issuedAtSec: 2_000 },
        account: { exists: true, sessionVersion: 0, mustChangePassword: false, passwordChangedAt: null },
        lookupFailed: false,
      }),
    ).toBe('ACTIVE');
  });

  it('a legacy token is REVOKED once the account has been bumped', () => {
    expect(
      deriveSessionState({
        token: { userId: 'u1', sessionVersion: undefined, issuedAtSec: 2_000 },
        account: { exists: true, sessionVersion: 1, mustChangePassword: false, passwordChangedAt: null },
        lookupFailed: false,
      }),
    ).toBe('REVOKED');
  });

  it('the fresh token minted in the SAME second as a password change survives', () => {
    // change at 1000.400s → floor 1000; fresh token iat 1000; versions match.
    expect(
      deriveSessionState({
        token: { userId: 'u1', sessionVersion: 4, issuedAtSec: 1_000 },
        account: {
          exists: true,
          sessionVersion: 4,
          mustChangePassword: false,
          passwordChangedAt: new Date(1_000_400),
        },
        lookupFailed: false,
      }),
    ).toBe('ACTIVE');
  });

  it('a token with no iat and an account that never changed its password → ACTIVE', () => {
    expect(
      deriveSessionState({
        token: { userId: 'u1', sessionVersion: 3, issuedAtSec: undefined },
        account: { exists: true, sessionVersion: 3, mustChangePassword: false, passwordChangedAt: null },
        lookupFailed: false,
      }),
    ).toBe('ACTIVE');
  });
});

describe('the transition table', () => {
  it('is exactly the documented set', () => {
    expect(SESSION_TRANSITIONS).toEqual({
      ACTIVE: ['PENDING_PASSWORD_CHANGE', 'REVOKED'],
      PENDING_PASSWORD_CHANGE: ['ACTIVE', 'REVOKED'],
      REVOKED: [],
    });
  });

  const cases: Array<[SessionState, SessionState, boolean]> = [
    ['ACTIVE', 'ACTIVE', true],
    ['ACTIVE', 'PENDING_PASSWORD_CHANGE', true],
    ['ACTIVE', 'REVOKED', true],
    ['PENDING_PASSWORD_CHANGE', 'ACTIVE', true],
    ['PENDING_PASSWORD_CHANGE', 'PENDING_PASSWORD_CHANGE', true],
    ['PENDING_PASSWORD_CHANGE', 'REVOKED', true],
    ['REVOKED', 'REVOKED', true], // idempotent self-transition
    ['REVOKED', 'ACTIVE', false], // terminal
    ['REVOKED', 'PENDING_PASSWORD_CHANGE', false],
  ];

  it.each(cases)('isValidTransition(%s → %s) === %s', (from, to, expected) => {
    expect(isValidTransition(from, to)).toBe(expected);
  });

  it('assertTransition throws InvalidSessionTransitionError for a terminal escape', () => {
    expect(() => assertTransition('REVOKED', 'ACTIVE')).toThrow(InvalidSessionTransitionError);
    try {
      assertTransition('REVOKED', 'ACTIVE');
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidSessionTransitionError);
      expect((e as InvalidSessionTransitionError).from).toBe('REVOKED');
      expect((e as InvalidSessionTransitionError).to).toBe('ACTIVE');
    }
  });

  it('assertTransition is a no-op for every allowed move', () => {
    for (const from of SESSION_STATES) {
      for (const to of SESSION_STATES) {
        if (isValidTransition(from, to)) expect(() => assertTransition(from, to)).not.toThrow();
      }
    }
  });
});

describe('race conditions (modelled through the pure function)', () => {
  it('a request in flight when the password changes loses the race → REVOKED', () => {
    // token minted at version 3; by the time the jwt callback reads the DB
    // the user has completed a password change → version 4.
    expect(
      deriveSessionState({
        token: { userId: 'u1', sessionVersion: 3, issuedAtSec: 2_000 },
        account: { exists: true, sessionVersion: 4, mustChangePassword: false, passwordChangedAt: new Date() },
        lookupFailed: false,
      }),
    ).toBe('REVOKED');
  });

  it('a PENDING token that completes the change elsewhere → its next refresh is REVOKED (version moved)', () => {
    // old token: PENDING, version 3. The user set their own password on the
    // fresh session → account is now version 4, mustChangePassword false.
    expect(
      deriveSessionState({
        token: { userId: 'u1', sessionVersion: 3, issuedAtSec: 2_000, revoked: false },
        account: { exists: true, sessionVersion: 4, mustChangePassword: false, passwordChangedAt: new Date() },
        lookupFailed: false,
      }),
    ).toBe('REVOKED');
  });

  it('the DB blips for one request → that request is REVOKED, not served stale', () => {
    expect(
      deriveSessionState({
        token: { userId: 'u1', sessionVersion: 3, issuedAtSec: 2_000 },
        account: { exists: false },
        lookupFailed: true,
      }),
    ).toBe('REVOKED');
  });
});

describe('stateAllowsAccess', () => {
  it('only ACTIVE may touch protected resources', () => {
    expect(stateAllowsAccess('ACTIVE')).toBe(true);
    expect(stateAllowsAccess('PENDING_PASSWORD_CHANGE')).toBe(false);
    expect(stateAllowsAccess('REVOKED')).toBe(false);
  });
});
