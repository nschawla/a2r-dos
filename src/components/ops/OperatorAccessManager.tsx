'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useSafeAction } from '@/lib/client/safe-action';
import { useToast } from '@/components/ui/toast';
import { setOperatorRoleAction } from '@/server/actions/ops-roles';
import {
  OPERATOR_ROLES,
  OPERATOR_ROLE_LABEL,
  OPERATOR_ROLE_DESCRIPTION,
  ROLE_CAPABILITIES,
  OPERATOR_CAPABILITIES,
  type OperatorRole,
} from '@/lib/ops/operator-roles';

interface OperatorRow {
  userId: string;
  userEmail: string;
  userName: string | null;
  role: OperatorRole;
}

export function OperatorAccessManager({
  operators,
  currentUserId,
}: {
  operators: OperatorRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const runAction = useSafeAction();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Record<string, OperatorRole>>({});

  function apply(userId: string, role: OperatorRole) {
    startTransition(async () => {
      const outcome = await runAction(() => setOperatorRoleAction({ targetUserId: userId, role }), {
        errorTitle: 'Couldn’t change the role',
      });
      if (!outcome.ok) return;
      if (!outcome.data.ok) {
        toast({ variant: 'error', title: outcome.data.error });
        return;
      }
      toast({ variant: 'success', title: `Role updated to ${OPERATOR_ROLE_LABEL[role]}.` });
      setDraft((d) => {
        const { [userId]: _drop, ...rest } = d;
        return rest;
      });
      router.refresh();
    });
  }

  return (
    <>
      <section className="card">
        <h2 className="text-[15.5px] font-bold mb-1">Operators &amp; roles</h2>
        <p className="text-[12.5px] text-ink-muted mb-4">
          One role per operator. A change is a re-grant — the old grant is revoked and a fresh one recorded,
          so the audit trail keeps the full history. You cannot change your own role.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide border-b border-border">
                <th className="py-2 pr-4">Account</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {operators.map((op) => {
                const isSelf = op.userId === currentUserId;
                const selected = draft[op.userId] ?? op.role;
                const changed = selected !== op.role;
                return (
                  <tr key={op.userId} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5 pr-4">
                      <div className="font-semibold">{op.userName ?? op.userEmail}</div>
                      {op.userName && <div className="text-ink-faint text-xs">{op.userEmail}</div>}
                      {isSelf && <div className="text-ink-faint text-[10px] uppercase tracking-wide">you</div>}
                    </td>
                    <td className="py-2.5 pr-4">
                      <select
                        className="input !py-1 !text-xs"
                        value={selected}
                        disabled={isSelf || pending}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, [op.userId]: e.target.value as OperatorRole }))
                        }
                      >
                        {OPERATOR_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {OPERATOR_ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5 pr-4">
                      {changed && !isSelf && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => apply(op.userId, selected)}
                          className="btn-primary !w-auto px-4 !py-1 text-xs"
                        >
                          Apply
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" id="operator-capability-matrix">
        <h2 className="text-[15.5px] font-bold mb-1">What each role can do</h2>
        <p className="text-[12.5px] text-ink-muted mb-4">
          The capability matrix (`src/lib/ops/operator-roles.ts`). A mutating action also requires a live
          Just-In-Time elevation regardless of role.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-ink-faint uppercase tracking-wide border-b border-border">
                <th className="py-2 pr-3 font-mono">Capability</th>
                {OPERATOR_ROLES.map((r) => (
                  <th key={r} className="py-2 px-2 text-center whitespace-nowrap" title={OPERATOR_ROLE_DESCRIPTION[r]}>
                    {OPERATOR_ROLE_LABEL[r].split(' / ')[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {OPERATOR_CAPABILITIES.map((cap) => (
                <tr key={cap} className="border-b border-border/50 last:border-0">
                  <td className="py-1.5 pr-3 font-mono text-ink-muted">{cap}</td>
                  {OPERATOR_ROLES.map((r) => (
                    <td key={r} className="py-1.5 px-2 text-center">
                      {ROLE_CAPABILITIES[r].has(cap) ? (
                        <span className="text-success">●</span>
                      ) : (
                        <span className="text-ink-faint/40">–</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
