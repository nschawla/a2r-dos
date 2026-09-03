'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { endImpersonationAction } from '@/server/actions/ops';

function minutesLeft(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60_000));
}

/** Fixed top strip shown while an A2R operator is inside a tenant via the
 * read-only Impersonation Gateway. */
export function ImpersonationBanner({
  organizationName,
  expiresAt,
}: {
  organizationName: string;
  expiresAt: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mins, setMins] = useState(() => minutesLeft(expiresAt));

  useEffect(() => {
    const t = setInterval(() => setMins(minutesLeft(expiresAt)), 30_000);
    return () => clearInterval(t);
  }, [expiresAt]);

  function exit() {
    startTransition(async () => {
      await endImpersonationAction();
      router.push('/ops/tenants');
      router.refresh();
    });
  }

  return (
    <div className="sticky top-0 z-[120] bg-warning text-black text-[12.5px] font-semibold px-4 py-1.5 flex items-center justify-center gap-3 flex-wrap">
      <span className="inline-flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" aria-hidden />
        Impersonating <span className="underline">{organizationName}</span> · read-only · A2R operator session
      </span>
      <span className="text-black/70">expires in {mins}m</span>
      <button
        type="button"
        onClick={exit}
        disabled={pending}
        className="rounded-sm border border-black/40 px-2 py-0.5 hover:bg-black/10 disabled:opacity-50"
      >
        {pending ? 'Exiting…' : 'Exit impersonation'}
      </button>
    </div>
  );
}
