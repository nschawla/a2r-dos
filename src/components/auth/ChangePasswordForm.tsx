'use client';

/**
 * Change-password form. Used both for a forced first-sign-in change (an
 * operator-provisioned admin, redirected here by src/middleware.ts) and a
 * voluntary change by any signed-in user.
 *
 * On success (P0 #3) the server has already revoked every other session and
 * minted a fresh one for this device, so we just hard-navigate into the
 * app. If the server couldn't mint (`sessionRefreshed: false`), we fall
 * back to signing out and back in.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { signOut } from 'next-auth/react';
import { changePasswordAction } from '@/server/actions/auth';
import { validatePasswordStrength, MIN_PASSWORD_LENGTH } from '@/lib/auth/password-policy';

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [refreshed, setRefreshed] = useState(false);

  const strengthHint = useMemo(() => (next ? validatePasswordStrength(next) : null), [next]);
  const mismatch = confirm.length > 0 && confirm !== next;
  const canSubmit =
    current.length > 0 && next.length > 0 && !strengthHint && !mismatch && !submitting;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError('The two new-password fields don’t match.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await changePasswordAction({ currentPassword: current, newPassword: next });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(true);
      setRefreshed(result.sessionRefreshed);
      setTimeout(() => {
        if (result.sessionRefreshed) {
          // Fresh session already set server-side — go straight into the app.
          window.location.assign('/launch');
        } else {
          // Couldn't mint — sign out and back in with the new password.
          void signOut({ callbackUrl: '/login' });
        }
      }, 1200);
    } catch {
      setError('Couldn’t reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col gap-2 text-center">
        <h2 className="text-[15px] font-bold">Password updated</h2>
        <p className="text-sm text-ink-muted">
          {refreshed
            ? 'All other sessions have been signed out. Taking you into the workspace…'
            : 'All sessions have been signed out — please sign in again with your new password.'}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {forced ? 'Temporary password' : 'Current password'}
        </span>
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">New password</span>
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
        />
        <span className={`text-[11px] ${strengthHint ? 'text-warning' : 'text-ink-faint'}`}>
          {strengthHint ?? `At least ${MIN_PASSWORD_LENGTH} characters, with an upper- and lowercase letter and a number.`}
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Confirm new password</span>
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
        {mismatch && <span className="text-[11px] text-warning">The two fields don’t match yet.</span>}
      </label>

      {error && <p className="text-critical text-sm">{error}</p>}

      <button type="submit" disabled={!canSubmit} className="btn-primary mt-2">
        {submitting ? 'Updating…' : 'Update password'}
      </button>

      {!forced && (
        <button
          type="button"
          onClick={() => history.back()}
          className="text-ink-faint hover:text-ink text-xs"
        >
          Cancel
        </button>
      )}
    </form>
  );
}
