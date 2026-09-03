'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { setTenantStatus } from '@/server/actions/ops';
import { useSafeAction } from '@/lib/client/safe-action';
import { useToast } from '@/components/ui/toast';

export function TenantStatusToggle({
  organizationId,
  organizationName,
  status,
}: {
  organizationId: string;
  organizationName: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'GRACE_PERIOD';
}) {
  const router = useRouter();
  const runAction = useSafeAction();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const next: 'ACTIVE' | 'SUSPENDED' = status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';

  function toggle() {
    const verb = next === 'SUSPENDED' ? 'Suspend' : 'Reactivate';
    if (!window.confirm(`${verb} "${organizationName}"?`)) return;
    setError(null);
    startTransition(async () => {
      const outcome = await runAction(() => setTenantStatus({ organizationId, status: next }), {
        errorTitle: `Couldn’t ${verb.toLowerCase()} ${organizationName}`,
      });
      if (!outcome.ok) return;
      const res = outcome.data;
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast({
        variant: 'success',
        title: next === 'SUSPENDED' ? `${organizationName} suspended` : `${organizationName} reactivated`,
      });
      router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={clsx(
          'text-xs font-semibold px-2.5 py-1 rounded-sm border transition-colors disabled:opacity-50',
          next === 'SUSPENDED'
            ? 'border-warning/40 text-warning hover:bg-warning/10'
            : 'border-success/40 text-success hover:bg-success/10'
        )}
      >
        {pending ? '…' : next === 'SUSPENDED' ? 'Suspend' : 'Reactivate'}
      </button>
      {error && <span className="text-critical text-[10px]">{error}</span>}
    </span>
  );
}
