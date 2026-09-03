'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  setTenantStatus,
  impersonateTenant,
  exportTenantData,
  purgeTenant,
  issueTenantApiKey,
  revokeTenantApiKey,
  listTenantApiKeys,
  type TenantExportResult,
  type TenantPurgeResult,
  type ApiKeyRow,
} from '@/server/actions/ops';
import { useSafeAction } from '@/lib/client/safe-action';
import { useToast } from '@/components/ui/toast';

type Status = 'ACTIVE' | 'SUSPENDED' | 'GRACE_PERIOD';

export interface TenantMenuTarget {
  id: string;
  name: string;
  slug: string;
  status: Status;
}

type OpenModal = null | 'impersonate' | 'export' | 'purge' | 'apikeys';

export function TenantActionsMenu({ tenant }: { tenant: TenantMenuTarget }) {
  const router = useRouter();
  const runAction = useSafeAction();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<OpenModal>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function changeStatus(to: Status, verb: string) {
    setOpen(false);
    if (!window.confirm(`${verb} "${tenant.name}"?`)) return;
    setError(null);
    startTransition(async () => {
      const outcome = await runAction(() => setTenantStatus({ organizationId: tenant.id, status: to }), {
        errorTitle: `Couldn’t update ${tenant.name}`,
      });
      if (!outcome.ok) return;
      const res = outcome.data;
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast({ variant: 'success', title: `${tenant.name} → ${to.replace('_', ' ').toLowerCase()}` });
      router.refresh();
    });
  }

  const items: { label: string; onClick: () => void; tone?: 'critical' }[] = [];
  if (tenant.status !== 'SUSPENDED') items.push({ label: 'Suspend', onClick: () => changeStatus('SUSPENDED', 'Suspend') });
  if (tenant.status === 'SUSPENDED' || tenant.status === 'GRACE_PERIOD')
    items.push({ label: 'Reactivate', onClick: () => changeStatus('ACTIVE', 'Reactivate') });
  if (tenant.status === 'ACTIVE')
    items.push({ label: 'Move to grace period', onClick: () => changeStatus('GRACE_PERIOD', 'Move to grace period for') });
  items.push({ label: 'Impersonate (View As)', onClick: () => { setOpen(false); setModal('impersonate'); } });
  items.push({ label: 'Manage API keys', onClick: () => { setOpen(false); setModal('apikeys'); } });
  items.push({ label: 'Export Data', onClick: () => { setOpen(false); setModal('export'); } });
  items.push({ label: 'Execute Purge', tone: 'critical', onClick: () => { setOpen(false); setModal('purge'); } });

  return (
    <span className="relative inline-block" ref={ref}>
      <button
        type="button"
        aria-label={`Tenant actions for ${tenant.name}`}
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        className="ml-2 w-6 h-6 rounded-sm border border-border-soft text-ink-muted hover:text-ink hover:border-ink-faint inline-flex items-center justify-center text-sm leading-none disabled:opacity-50"
      >
        &#8942;
      </button>
      {open && (
        <div
          role="menu"
          aria-label={`Actions for ${tenant.name}`}
          className="absolute right-0 top-full mt-1 w-52 bg-surface-1 border border-border-soft rounded-md shadow-card z-50 py-1"
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={it.onClick}
              className={clsx(
                'w-full text-left px-3 py-1.5 text-xs font-semibold hover:bg-surface-2 transition-colors',
                it.tone === 'critical' ? 'text-critical' : 'text-ink-muted hover:text-ink'
              )}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
      {error && <span className="block text-critical text-[10px] mt-1">{error}</span>}

      {modal === 'impersonate' && <ImpersonateModal tenant={tenant} onClose={() => setModal(null)} />}
      {modal === 'apikeys' && <ApiKeysModal tenant={tenant} onClose={() => setModal(null)} />}
      {modal === 'export' && <ExportModal tenant={tenant} onClose={() => setModal(null)} />}
      {modal === 'purge' && <PurgeModal tenant={tenant} onClose={() => setModal(null)} />}
    </span>
  );
}

// ─────────────────────────────────────────────────────────── shells

function ModalShell({
  title,
  label,
  onClose,
  children,
}: {
  title: string;
  /** stable aria-label — defaults to `title`; pass this when `title` changes on success */
  label?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-label={label ?? title}
      onClick={onClose}
    >
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto text-left" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 className="text-[15.5px] font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 flex-none rounded-sm border border-border-soft text-ink-muted hover:text-ink flex items-center justify-center"
          >
            &times;
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────── impersonate

function ImpersonateModal({ tenant, onClose }: { tenant: TenantMenuTarget; onClose: () => void }) {
  const router = useRouter();
  const runAction = useSafeAction();
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function go() {
    setError(null);
    startTransition(async () => {
      const outcome = await runAction(() => impersonateTenant({ organizationId: tenant.id, reason }), {
        errorTitle: `Couldn’t start impersonation of ${tenant.name}`,
      });
      if (!outcome.ok) return;
      const res = outcome.data;
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push('/');
      router.refresh();
    });
  }

  return (
    <ModalShell title={`Impersonate ${tenant.name}`} onClose={onClose}>
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-ink-muted">
          Opens a <span className="font-semibold text-ink">read-only</span> operator session inside this tenant&rsquo;s
          workspace for up to 20 minutes. Every impersonation is written to the tenant&rsquo;s Immutable Audit Ledger
          (<code className="text-xs">ADMIN_IMPERSONATION_ACCESS</code>).
        </p>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-ink-muted">Reason (recorded in the audit ledger)</span>
          <textarea
            className="input min-h-[64px]"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Investigating support ticket #4821 — EAC totals not matching"
          />
        </label>
        {error && <p className="text-critical text-xs">{error}</p>}
        <div className="flex justify-end gap-2 mt-1">
          <button type="button" className="text-ink-faint hover:text-ink text-xs px-3 py-2" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || reason.trim().length < 4}
            onClick={go}
            className="btn-primary !w-auto px-5 text-xs disabled:opacity-50"
          >
            {pending ? 'Starting…' : 'Start read-only session'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────── type-to-confirm base

function useTypeToConfirm(tenant: TenantMenuTarget) {
  const [confirmName, setConfirmName] = useState('');
  const matches = confirmName.trim() === tenant.name;
  return { confirmName, setConfirmName, matches };
}

function ConfirmNameField({
  tenant,
  confirmName,
  setConfirmName,
}: {
  tenant: TenantMenuTarget;
  confirmName: string;
  setConfirmName: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-ink-muted">
        Type <span className="font-mono text-ink">{tenant.name}</span> to confirm
      </span>
      <input
        className="input"
        value={confirmName}
        onChange={(e) => setConfirmName(e.target.value)}
        placeholder={tenant.name}
        autoComplete="off"
      />
    </label>
  );
}

function jsonDownloadHref(json: string): string {
  return `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
}

// ─────────────────────────────────────────────────────────── export

function ExportModal({ tenant, onClose }: { tenant: TenantMenuTarget; onClose: () => void }) {
  const runAction = useSafeAction();
  const { confirmName, setConfirmName, matches } = useTypeToConfirm(tenant);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TenantExportResult | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const outcome = await runAction(() => exportTenantData({ organizationId: tenant.id, confirmName }), {
        errorTitle: `Couldn’t build the export for ${tenant.name}`,
      });
      if (!outcome.ok) return;
      const res = outcome.data;
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(res.data);
    });
  }

  return (
    <ModalShell title={result ? 'Data export ready' : `Export ${tenant.name} data`} label={`Export ${tenant.name} data`} onClose={onClose}>
      {result ? (
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-ink-muted">
            Cryptographic export package generated. The manifest below carries a SHA-256 digest of the payload — a
            recipient re-hashes the payload to verify nothing was altered.
          </p>
          <div className="bg-surface-2 rounded-sm px-3 py-3 text-xs flex flex-col gap-1.5">
            <div><span className="text-ink-muted">Records:</span>{' '}
              {Object.entries(result.manifest.recordCounts).reduce((s, [, n]) => s + n, 0)} across{' '}
              {Object.keys(result.manifest.recordCounts).length} collections
            </div>
            <div><span className="text-ink-muted">Projects:</span> {result.manifest.recordCounts.projects ?? 0}</div>
            <div className="break-all">
              <span className="text-ink-muted">Payload digest:</span>{' '}
              <span className="font-mono text-ink select-all">{result.manifest.payloadDigest}</span>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <a
              href={jsonDownloadHref(result.bundleJson)}
              download={`${tenant.slug}-export.json`}
              className="btn-secondary !w-auto px-4 text-xs"
            >
              Download .json
            </a>
            <button type="button" className="btn-primary !w-auto px-4 text-xs" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-ink-muted">
            Generates a portable JSON bundle of every record this tenant owns — projects, baselines, roster, governance
            config, the audit trail and the compliance ledger. Logged as{' '}
            <code className="text-xs">TENANT_DATA_EXPORT</code>. No password hashes or cross-tenant data are included.
          </p>
          <ConfirmNameField tenant={tenant} confirmName={confirmName} setConfirmName={setConfirmName} />
          {error && <p className="text-critical text-xs">{error}</p>}
          <div className="flex justify-end gap-2 mt-1">
            <button type="button" className="text-ink-faint hover:text-ink text-xs px-3 py-2" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              disabled={pending || !matches}
              onClick={run}
              className="btn-primary !w-auto px-5 text-xs disabled:opacity-50"
            >
              {pending ? 'Building…' : 'Generate export package'}
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────── purge

function PurgeModal({ tenant, onClose }: { tenant: TenantMenuTarget; onClose: () => void }) {
  const router = useRouter();
  const runAction = useSafeAction();
  const { confirmName, setConfirmName, matches } = useTypeToConfirm(tenant);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TenantPurgeResult | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const outcome = await runAction(() => purgeTenant({ organizationId: tenant.id, confirmName }), {
        errorTitle: `Purge of ${tenant.name} didn’t complete`,
      });
      if (!outcome.ok) return;
      const res = outcome.data;
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // NOTE: don't refresh here — the purged row would unmount this modal
      // before the operator sees the certificate. Refresh on close instead.
      setResult(res.data);
    });
  }

  function close() {
    if (result) router.refresh();
    onClose();
  }

  return (
    <ModalShell
      title={result ? 'Certificate of Destruction' : `Execute Purge Protocol — ${tenant.name}`}
      label={`Execute Purge Protocol — ${tenant.name}`}
      onClose={close}
    >
      {result ? (
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-ink-muted">
            <span className="text-success font-semibold">{tenant.name} purged.</span> The tenant is soft-deleted
            (recoverable only by a DBA) and removed from every operator and client surface. Certificate:
          </p>
          <div className="bg-surface-2 rounded-sm px-3 py-3 text-xs flex flex-col gap-1.5">
            <div><span className="text-ink-muted">Certificate ID:</span>{' '}
              <span className="font-mono text-ink select-all">{result.certificate.certificateId}</span>
            </div>
            <div><span className="text-ink-muted">Executed:</span> {new Date(result.certificate.executedAt).toLocaleString()}</div>
            <div><span className="text-ink-muted">By:</span> {result.certificate.executedBy}</div>
            <div><span className="text-ink-muted">Method:</span> {result.certificate.method}</div>
            <div className="break-all">
              <span className="text-ink-muted">Certificate hash:</span>{' '}
              <span className="font-mono text-ink select-all">{result.certificate.certificateHash}</span>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <a
              href={jsonDownloadHref(result.certificateJson)}
              download={`${tenant.slug}-certificate-of-destruction.json`}
              className="btn-secondary !w-auto px-4 text-xs"
            >
              Download certificate
            </a>
            <button type="button" className="btn-primary !w-auto px-4 text-xs" onClick={close}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <div className="rounded-sm border border-critical/30 bg-critical-soft px-3 py-2 text-critical text-xs font-semibold">
            Destructive. This soft-deletes {tenant.name} and immediately locks every member out. Logged as{' '}
            <code>TENANT_PURGE_EXECUTED</code>. Take a data export first if the tenant may need to be restored.
          </div>
          <ConfirmNameField tenant={tenant} confirmName={confirmName} setConfirmName={setConfirmName} />
          {error && <p className="text-critical text-xs">{error}</p>}
          <div className="flex justify-end gap-2 mt-1">
            <button type="button" className="text-ink-faint hover:text-ink text-xs px-3 py-2" onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              disabled={pending || !matches}
              onClick={run}
              className="btn-primary !w-auto px-5 text-xs !bg-gradient-to-br !from-critical !to-critical disabled:opacity-50"
            >
              {pending ? 'Purging…' : 'Execute Purge Protocol'}
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────── api keys

function ApiKeysModal({ tenant, onClose }: { tenant: TenantMenuTarget; onClose: () => void }) {
  const router = useRouter();
  const runAction = useSafeAction();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [name, setName] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('');
  const [freshPlaintext, setFreshPlaintext] = useState<string | null>(null);

  const reload = useCallback(() => {
    startTransition(async () => {
      const outcome = await runAction(() => listTenantApiKeys(tenant.id), {
        errorTitle: 'Couldn’t load API keys',
      });
      if (!outcome.ok) return;
      const res = outcome.data;
      if (res.ok) setKeys(res.data);
      else setError(res.error);
    });
  }, [tenant.id, runAction]);
  useEffect(() => {
    reload();
  }, [reload]);

  function issue() {
    setError(null);
    startTransition(async () => {
      const outcome = await runAction(
        () =>
          issueTenantApiKey({
            organizationId: tenant.id,
            name,
            expiresInDays: expiresInDays ? Number(expiresInDays) : null,
          }),
        { errorTitle: 'Couldn’t issue the API key' }
      );
      if (!outcome.ok) return;
      const res = outcome.data;
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setFreshPlaintext(res.data.plaintext);
      toast({ variant: 'success', title: `API key issued — ${res.data.name}` });
      setName('');
      setExpiresInDays('');
      reload();
      router.refresh();
    });
  }
  function revoke(id: string) {
    if (!window.confirm('Revoke this API key? Any integration using it stops working immediately.')) return;
    setError(null);
    startTransition(async () => {
      const outcome = await runAction(() => revokeTenantApiKey({ apiKeyId: id, organizationId: tenant.id }), {
        errorTitle: 'Couldn’t revoke the API key',
      });
      if (!outcome.ok) return;
      const res = outcome.data;
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast({ variant: 'success', title: 'API key revoked' });
      reload();
      router.refresh();
    });
  }

  return (
    <ModalShell title={`API keys — ${tenant.name}`} label={`API keys — ${tenant.name}`} onClose={onClose}>
      <div className="flex flex-col gap-4 text-sm">
        <p className="text-ink-muted">
          Tenant-scoped Bearer credentials for the Data Ingestion API Bridge
          (<code className="text-xs">POST /api/v1/ingest/timesheets</code>). A request made with a key can only ever
          write into <span className="text-ink font-semibold">{tenant.name}</span>. Issuing / revoking is logged to the
          Immutable Audit Ledger.
        </p>

        {freshPlaintext && (
          <div className="rounded-sm border border-success/40 bg-success-soft px-3 py-3 text-xs flex flex-col gap-1.5">
            <div className="text-success font-semibold uppercase tracking-wide text-[10px]">
              New key — copy it now, it is not shown again
            </div>
            <code className="font-mono text-ink select-all break-all">{freshPlaintext}</code>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-ink-faint uppercase tracking-wide border-b border-border">
                <th className="py-1.5 pr-3">Name</th>
                <th className="py-1.5 pr-3">Prefix</th>
                <th className="py-1.5 pr-3">Last used</th>
                <th className="py-1.5 pr-3">Status</th>
                <th className="py-1.5" />
              </tr>
            </thead>
            <tbody>
              {(keys ?? []).map((k) => {
                const revoked = !!k.revokedAt;
                const expired = !revoked && k.expiresAt !== null && new Date(k.expiresAt).getTime() < Date.now();
                return (
                  <tr key={k.id} className="border-b border-border/60 last:border-0">
                    <td className="py-1.5 pr-3 font-semibold">{k.name}</td>
                    <td className="py-1.5 pr-3 font-mono text-ink-muted">{k.keyPrefix}…</td>
                    <td className="py-1.5 pr-3 text-ink-muted">
                      {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : 'never'}
                    </td>
                    <td className="py-1.5 pr-3">
                      <span
                        className={clsx(
                          'badge !py-0.5 !px-2 text-[10px]',
                          revoked || expired ? '!text-critical !border-critical/40' : '!text-success !border-success/40'
                        )}
                      >
                        {revoked ? 'Revoked' : expired ? 'Expired' : 'Active'}
                      </span>
                    </td>
                    <td className="py-1.5 text-right">
                      {!revoked && (
                        <button type="button" className="text-critical font-semibold" disabled={pending} onClick={() => revoke(k.id)}>
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {keys !== null && keys.length === 0 && (
                <tr>
                  <td className="py-3 text-ink-muted" colSpan={5}>
                    No API keys yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-end gap-2 pt-3 border-t border-border/60">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-ink-muted">Key name</span>
            <input className="input !w-48" value={name} onChange={(e) => setName(e.target.value)} placeholder="Workday timesheet sync" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-ink-muted">Expires (days, optional)</span>
            <input className="input !w-32" value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)} placeholder="e.g. 365" />
          </label>
          <button type="button" className="btn-secondary !w-auto px-4 text-xs" disabled={pending || name.trim().length < 2} onClick={issue}>
            Issue key
          </button>
        </div>

        {error && <p className="text-critical text-xs">{error}</p>}
        <div className="flex justify-end">
          <button type="button" className="btn-primary !w-auto px-4 text-xs" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
