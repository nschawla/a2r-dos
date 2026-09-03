'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { provisionTenant, type ProvisionedTenant } from '@/server/actions/ops';
import { useSafeAction } from '@/lib/client/safe-action';

const TIERS = [
  { value: 'TRIAL', label: 'Trial' },
  { value: 'STANDARD', label: 'Standard' },
  { value: 'ENTERPRISE', label: 'Enterprise' },
] as const;

export function ProvisionTenantModal() {
  const router = useRouter();
  const runAction = useSafeAction();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [orgName, setOrgName] = useState('');
  const [contractTier, setContractTier] = useState<(typeof TIERS)[number]['value']>('STANDARD');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProvisionedTenant | null>(null);

  function reset() {
    setOrgName('');
    setContractTier('STANDARD');
    setAdminName('');
    setAdminEmail('');
    setError(null);
    setResult(null);
  }

  function close() {
    setOpen(false);
    if (result) router.refresh();
    reset();
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const outcome = await runAction(
        () => provisionTenant({ orgName, contractTier, adminName, adminEmail }),
        { errorTitle: 'Couldn’t provision tenant' }
      );
      if (!outcome.ok) return; // unexpected failure — toast already shown + logged
      const res = outcome.data;
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(res.data);
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" className="btn-primary !w-auto px-5" onClick={() => setOpen(true)}>
        Provision New Tenant
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 px-4"
          role="dialog"
          aria-modal="true"
          onClick={close}
        >
          <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">
                  A2R Operator
                </div>
                <h2 className="text-[15.5px] font-bold">
                  {result ? 'Tenant provisioned' : 'Provision New Tenant'}
                </h2>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="w-7 h-7 flex-none rounded-sm border border-border-soft text-ink-muted hover:text-ink hover:border-ink-faint flex items-center justify-center"
              >
                &times;
              </button>
            </div>

            {result ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-ink-muted">
                  <span className="text-ink font-semibold">{orgName}</span> is live on the{' '}
                  {TIERS.find((t) => t.value === contractTier)?.label} tier, seeded with the default governance
                  policy, control labels, and rate-card roster.
                </p>
                <div className="bg-surface-2 rounded-sm px-3 py-3 text-xs flex flex-col gap-1.5">
                  <div className="text-ink-faint uppercase tracking-wide text-[10px] font-semibold">
                    Admin invite — relay these once
                  </div>
                  <div>
                    <span className="text-ink-muted">Email:</span>{' '}
                    <span className="font-mono text-ink">{result.adminEmail}</span>
                  </div>
                  <div>
                    <span className="text-ink-muted">Temp password:</span>{' '}
                    <span className="font-mono text-ink select-all">{result.tempPassword}</span>
                  </div>
                  <div>
                    <span className="text-ink-muted">Workspace slug:</span>{' '}
                    <span className="font-mono text-ink">{result.organizationSlug}</span>
                  </div>
                </div>
                <p className="text-[11px] text-ink-faint">
                  This password is shown only now — it is stored hashed. The admin should change it on first
                  sign-in.
                </p>
                <div className="flex justify-end mt-1">
                  <button type="button" className="btn-secondary !w-auto px-5 text-xs" onClick={close}>
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-ink-muted">Organization name</span>
                  <input
                    className="input"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="Contoso Health"
                    maxLength={120}
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-ink-muted">Contract tier</span>
                  <select
                    className="input"
                    value={contractTier}
                    onChange={(e) => setContractTier(e.target.value as (typeof TIERS)[number]['value'])}
                  >
                    {TIERS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-ink-muted">Initial admin name</span>
                    <input
                      className="input"
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      placeholder="Jordan Reyes"
                      maxLength={120}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-ink-muted">Initial admin email</span>
                    <input
                      className="input"
                      type="email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="admin@contoso.com"
                    />
                  </label>
                </div>

                <p className="text-[11px] text-ink-faint -mt-1">
                  Creates the org, an OWNER membership for the admin, and seeds the default templates. A one-time
                  password is returned for you to pass on.
                </p>

                {error && <p className="text-critical text-xs">{error}</p>}

                <div className="flex items-center justify-end gap-2 mt-1">
                  <button type="button" className="text-ink-faint hover:text-ink text-xs px-3 py-2" onClick={close}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={pending || !orgName.trim() || !adminName.trim() || !adminEmail.trim()}
                    onClick={submit}
                    className={clsx('btn-primary !w-auto px-5 text-xs', pending && 'opacity-60')}
                  >
                    {pending ? 'Provisioning…' : 'Provision tenant'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
