/**
 * P1 — restricted-session state machine.
 *
 * An explicit, immutable state machine for the lifecycle of a NextAuth
 * session token. The state is DERIVED — never stored as a mutable field —
 * from the token's claims plus the authoritative database record, on every
 * authenticated request (src/lib/auth.ts's jwt callback).
 *
 *      ┌─────────┐  password set by an operator     ┌──────────────────────────┐
 *      │ ACTIVE  │ ───────────────────────────────▶ │ PENDING_PASSWORD_CHANGE  │
 *      │         │ ◀─────────────────────────────── │  (mustChangePassword)     │
 *      └────┬────┘   flag cleared without a bump    └────────────┬─────────────┘
 *           │                                                    │
 *           │  sessionVersion bump  /  user deleted  /           │
 *           │  token predates passwordChangedAt  /               │
 *           │  DB lookup failed or timed out (FAIL-CLOSED)        │
 *           ▼                                                     ▼
 *      ┌──────────────────────────────────────────────────────────────┐
 *      │                          REVOKED  (terminal)                  │
 *      │  the token is dead; the user must re-authenticate for a new   │
 *      │  one — a REVOKED token never transitions back                 │
 *      └──────────────────────────────────────────────────────────────┘
 *
 * Fail-closed: ANY uncertainty (DB error, timeout, missing user, version
 * mismatch, malformed token) resolves to REVOKED. There is no code path
 * that resolves an uncertain session to ACTIVE.
 *
 * Pure — unit-tested exhaustively by tests/session-state.test.ts.
 */
import { tokenIsRevokedByPasswordChange } from './token-revocation';

export const SESSION_STATES = ['ACTIVE', 'PENDING_PASSWORD_CHANGE', 'REVOKED'] as const;
export type SessionState = (typeof SESSION_STATES)[number];

/**
 * The immutable transition table. `from -> to` is allowed iff `to` is in
 * `SESSION_TRANSITIONS[from]` (a self-transition `from === to` is always
 * allowed — a refresh that observes no change).
 *
 *   ACTIVE                  → PENDING_PASSWORD_CHANGE | REVOKED
 *   PENDING_PASSWORD_CHANGE → ACTIVE | REVOKED
 *   REVOKED                 → (nothing — terminal)
 */
export const SESSION_TRANSITIONS: Readonly<Record<SessionState, readonly SessionState[]>> = {
  ACTIVE: ['PENDING_PASSWORD_CHANGE', 'REVOKED'],
  PENDING_PASSWORD_CHANGE: ['ACTIVE', 'REVOKED'],
  REVOKED: [],
};

export function isValidTransition(from: SessionState, to: SessionState): boolean {
  return from === to || SESSION_TRANSITIONS[from].includes(to);
}

export class InvalidSessionTransitionError extends Error {
  readonly from: SessionState;
  readonly to: SessionState;
  constructor(from: SessionState, to: SessionState) {
    super(`Illegal session-state transition: ${from} → ${to}`);
    this.name = 'InvalidSessionTransitionError';
    this.from = from;
    this.to = to;
  }
}

/** Throws `InvalidSessionTransitionError` when `from → to` is not allowed. */
export function assertTransition(from: SessionState, to: SessionState): void {
  if (!isValidTransition(from, to)) {
    throw new InvalidSessionTransitionError(from, to);
  }
}

// ── State derivation ───────────────────────────────────────────────────

/** The authoritative account record — or the fact that it could not be read. */
export type AccountSnapshot =
  | {
      exists: true;
      sessionVersion: number;
      mustChangePassword: boolean;
      /** null when the password has never been changed. */
      passwordChangedAt: Date | null;
    }
  | { exists: false };

export interface SessionStateInput {
  token: {
    userId: string | null | undefined;
    /** The `sessionVersion` claim baked in when the token was minted.
     * Undefined for a legacy token issued before this feature — compared
     * as 0 so it stays valid until the account's first version bump. */
    sessionVersion: number | null | undefined;
    /** The JWT `iat` (seconds). */
    issuedAtSec: number | null | undefined;
    /** A token the jwt callback has already marked dead. Sticky. */
    revoked?: boolean;
  };
  account: AccountSnapshot;
  /** True when the DB lookup itself errored or timed out — FAIL CLOSED. */
  lookupFailed: boolean;
}

/**
 * The single source of truth for "what state is this session in?". Called
 * on every authenticated request. Every branch that is not provably ACTIVE
 * or PENDING returns REVOKED.
 */
export function deriveSessionState(input: SessionStateInput): SessionState {
  // 1. Fail-closed: the DB check could not be completed.
  if (input.lookupFailed) return 'REVOKED';

  // 2. Structurally invalid / already-dead tokens.
  if (!input.token.userId) return 'REVOKED';
  if (input.token.revoked === true) return 'REVOKED';

  // 3. The account is gone.
  if (!input.account.exists) return 'REVOKED';

  // 4. Token-version / epoch check — the account's sessions were
  //    invalidated (password change, forced logout) after this token was
  //    minted. Legacy tokens (undefined) are treated as version 0.
  const tokenVersion = input.token.sessionVersion ?? 0;
  if (tokenVersion !== input.account.sessionVersion) return 'REVOKED';

  // 5. Belt-and-suspenders — the token predates the last password change
  //    even though the version happened to match (e.g. a change applied by
  //    a path that did not bump the version). Whole-second comparison so
  //    the one fresh token minted alongside a change survives.
  if (tokenIsRevokedByPasswordChange(input.token.issuedAtSec, input.account.passwordChangedAt)) {
    return 'REVOKED';
  }

  // 6. Valid token — is the account required to rotate its password?
  if (input.account.mustChangePassword) return 'PENDING_PASSWORD_CHANGE';

  return 'ACTIVE';
}

/** Convenience for guards: is this a state that may touch protected resources? */
export function stateAllowsAccess(state: SessionState): boolean {
  return state === 'ACTIVE';
}
