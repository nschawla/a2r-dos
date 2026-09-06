/**
 * P0 #3 — deep server-side enforcement of forced password rotation.
 *
 * `middleware.ts` redirects browser navigations to /change-password while a
 * session carries `mustChangePassword: true`, but middleware is only a
 * navigation guard. A script holding a valid temporary-password session
 * could call Server Actions / Route Handlers directly. This module is the
 * server-side backstop: EVERY authenticated server-action and route-handler
 * path treats a `mustChangePassword` session as strictly restricted and
 * rejects it with 403 `PASSWORD_CHANGE_REQUIRED` — no redirect, no work.
 *
 * The only exemptions are the password-change submission itself
 * (`changePasswordAction`) and NextAuth sign-out.
 *
 * Wiring:
 *   - src/lib/session.ts   — requireOrgContext / getOrgContextOrNull throw
 *   - src/lib/ops-auth.ts   — requireOpsContext / getOpsContextOrNull throw
 *   - src/server/authz.ts   — authorizeProjectEdit / authorizeAdminAction
 *                             catch the throw → { ok:false, error: … }
 *   - every route handler   — passwordRotationGate() early → 403 JSON
 *   - the few actions that read the session directly call
 *     assertPasswordRotationClear()
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';

export class PasswordChangeRequiredError extends Error {
  readonly code = PASSWORD_CHANGE_REQUIRED;
  /** So a 403 is the natural HTTP mapping wherever one is emitted. */
  readonly status = 403;
  constructor() {
    super('This session must set a new password before it can perform any other action.');
    this.name = 'PasswordChangeRequiredError';
  }
}

export function isPasswordChangeRequiredError(err: unknown): err is PasswordChangeRequiredError {
  return (
    err instanceof PasswordChangeRequiredError ||
    (typeof err === 'object' && err !== null && (err as { code?: unknown }).code === PASSWORD_CHANGE_REQUIRED)
  );
}

// The pure session-token revocation predicate lives in ./token-revocation.ts
// so the NextAuth config can import it without a cycle back through this
// module (which imports `authOptions`).
export { tokenIsRevokedByPasswordChange } from './token-revocation';

/** True when the current request's session is a forced-rotation session. */
export async function sessionRequiresPasswordChange(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  return session?.user?.mustChangePassword === true;
}

/**
 * Throw `PasswordChangeRequiredError` if the session is mid-rotation.
 * Call from any server-action auth path that reads the session directly.
 */
export async function assertPasswordRotationClear(): Promise<void> {
  if (await sessionRequiresPasswordChange()) {
    throw new PasswordChangeRequiredError();
  }
}

/**
 * Route-handler gate. Returns a ready 403 response to short-circuit with,
 * or null when the session is clear. Put it right after the rate-limit
 * check and before any auth resolution:
 *
 *   const blocked = await passwordRotationGate();
 *   if (blocked) return blocked;
 */
export async function passwordRotationGate(): Promise<NextResponse | null> {
  if (await sessionRequiresPasswordChange()) {
    return NextResponse.json(
      {
        error: PASSWORD_CHANGE_REQUIRED,
        message: 'This account must set a new password before it can use the API.',
      },
      { status: 403 },
    );
  }
  return null;
}
