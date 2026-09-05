'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { grantStaffAction, revokeStaffAction } from '@/server/actions/staff-access';
import { useSafeAction } from '@/lib/client/safe-action';
import { useToast } from '@/components/ui/toast';

export interface StaffGrantRow {
  id: string;
  userEmail: string;
  userName: string | null;
  reason: string;
  grantedByEmail: string | null;
  grantedAt: string;
}

export function StaffAccessManager({
  grants,
  currentUserEmail,
}: {
  grants: StaffGrantRow[];
  currentUserEmail: string;
}) {
  const router = useRouter();
  const runAction = useSafeAction();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  function submitGrant(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const outcome = await runAction(() => grantStaffAction({ email, reason }), {
        errorTitle: 'Couldn’t grant staff access',
      });
      if (!outcome.ok) return;
      if (!outcome.data.ok) {
        setFormError(outcome.data.error);
        return;
      }
      toast({ variant: 'success', title: `Staff access granted to ${email.trim().toLowerCase()}` });
      setEmail('');
      setReason('');
      router.refresh();
    });
  }

  function revoke(targetEmail: string) {
    if (!window.confirm(`Revoke Operator Control Plane access for ${targetEmail}?`)) return;
    startTransition(async () => {
      const outcome = await runAction(() => revokeStaffAction({ email: targetEmail }), {
        errorTitle: `Couldn’t revoke ${targetEmail}`,
      });
      if (!outcome.ok) return;
      if (!outcome.data.ok) {
        toast({ variant: 'error', title: outcome.data.error });
        return;
      }
      toast({ variant: 'success', title: `Staff access revoked for ${targetEmail}` });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={submitGrant} className="card flex flex-col gap-3">
        <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">Grant access</div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr_auto] gap-3 items-start">
          <div className="flex flex-col gap-1">
            <label htmlFor="staff-email" className="text-[11px] text-ink-faint font-semibold">
              Account email
            </label>
            <input
              id="staff-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="person@company.com"
              className="input"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="staff-reason" className="text-[11px] text-ink-faint font-semibold">
              Reason (audit trail)
            </label>
            <input
              id="staff-reason"
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Platform on-call rotation"
              className="input"
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="btn-primary !w-auto self-end px-4 whitespace-nowrap disabled:opacity-50"
          >
            {pending ? '…' : 'Grant access'}
          </button>
        </div>
        <p className="text-[11px] text-ink-faint">
          The account must have signed in at least once. Granting is idempotent.
        </p>
        {formError && <p className="text-critical text-xs">{formError}</p>}
      </form>

      <div className="card">
        <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-3">
          Current operators — {grants.length}
        </div>
        {grants.length === 0 ? (
          <p className="text-ink-muted text-sm py-6 text-center">
            No accounts hold operator access. (You are viewing this via a grant that will still be listed
            after a refresh.)
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide border-b border-border">
                  <th className="py-2 pr-4">Account</th>
                  <th className="py-2 pr-4">Reason</th>
                  <th className="py-2 pr-4">Granted by</th>
                  <th className="py-2 pr-4">Granted</th>
                  <th className="py-2 pr-4" />
                </tr>
              </thead>
              <tbody>
                {grants.map((g) => {
                  const isSelf = g.userEmail === currentUserEmail;
                  return (
                    <tr key={g.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2.5 pr-4 font-semibold">
                        {g.userName ?? g.userEmail}
                        <span className="block font-mono text-[10px] text-ink-faint">{g.userEmail}</span>
                      </td>
                      <td className="py-2.5 pr-4 text-ink-muted">{g.reason}</td>
                      <td className="py-2.5 pr-4 text-ink-muted font-mono text-[11px]">
                        {g.grantedByEmail ?? 'system / seed'}
                      </td>
                      <td className="py-2.5 pr-4 text-ink-muted tabular-nums">
                        {new Date(g.grantedAt).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 pr-4 text-right">
                        {isSelf ? (
                          <span className="text-[10px] text-ink-faint">you</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => revoke(g.userEmail)}
                            disabled={pending}
                            className="text-xs font-semibold px-2.5 py-1 rounded-sm border border-critical/40 text-critical hover:bg-critical/10 transition-colors disabled:opacity-50"
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
