import type { Metadata } from 'next';
import { requireOpsContext } from '@/lib/ops-auth';
import { getMfaStatus } from '@/lib/ops/operator-mfa';
import { OperatorMfaPanel } from '@/components/ops/OperatorMfaPanel';

export const metadata: Metadata = {
  title: 'Operator Security · A2R Ops',
};

/**
 * A2R Operator Control Plane — your own second factor.
 *
 * Batch 2: a JIT privilege elevation now requires an **activated**
 * authenticator (TOTP) plus a fresh password re-check. This page is the
 * only place to enroll one. Enrollment is deliberately reachable with just
 * a standing grant (no elevation) — you cannot MFA-gate the MFA setup.
 */
export default async function OperatorSecurityPage() {
  const ops = await requireOpsContext();
  const status = await getMfaStatus(ops.userId);

  return (
    <>
      <div>
        <h1 className="text-2xl font-display font-bold">Operator Security</h1>
        <p className="text-ink-muted text-sm mt-1 max-w-2xl">
          Every privileged operation runs under a Just-In-Time elevation, and every elevation now requires a
          second factor: a 6-digit code from an authenticator app (Google Authenticator, 1Password, Authy, …)
          on top of your password. Set yours up here.
        </p>
      </div>

      <div id="operator-mfa-panel">
        <OperatorMfaPanel
          initialStatus={status}
          operatorEmail={ops.email}
        />
      </div>

      <section className="card text-[12.5px] text-ink-muted leading-relaxed">
        <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">
          If you lose your device
        </div>
        <p>
          Use one of your <strong>recovery codes</strong> in place of the 6-digit code when you elevate — each
          works once. If you have none left, an A2R platform administrator can reset your factor with{' '}
          <code className="text-ink">npm run ops:mfa:reset -- {ops.email}</code> (direct database access,
          like the initial staff-access bootstrap). Rotating an <em>active</em> authenticator (e.g. new phone)
          from here needs a live elevation.
        </p>
      </section>
    </>
  );
}
