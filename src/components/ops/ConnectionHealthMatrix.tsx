'use client';

/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * The Connection Health Matrix — every tenant's external-integration
 * connections, one row each, with an expandable error log and inline
 * Test / Retry Sync / Delete actions. The "add a connection" form at the
 * bottom is how an operator configures a new one (platform infrastructure,
 * same model as /ops/identity — see the file-level comment on
 * src/server/actions/integrations.ts).
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { useSafeAction } from '@/lib/client/safe-action';
import { useToast } from '@/components/ui/toast';
import {
  upsertIntegrationConnection,
  testIntegrationConnection,
  retrySyncAction,
  deleteIntegrationConnection,
  loadConnectionErrorsAction,
} from '@/server/actions/integrations';
import { PROVIDER_META } from '@/lib/integrations/provider-meta';
import type { ConnectionRow, ErrorLogRow } from '@/server/queries/pages/ops-integrations';

const STATUS_META: Record<string, { label: string; className: string }> = {
  NOT_CONFIGURED: { label: 'Not configured', className: 'bg-na-soft text-na' },
  CONNECTED: { label: 'Connected', className: 'bg-success-soft text-success' },
  SYNCING: { label: 'Syncing…', className: 'bg-brand/10 text-brand' },
  ERROR: { label: 'Error', className: 'bg-critical-soft text-critical' },
};

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function ConnectionHealthMatrix({
  connections,
  tenants,
}: {
  connections: ConnectionRow[];
  tenants: { id: string; name: string; slug: string }[];
}) {
  const router = useRouter();
  const runAction = useSafeAction();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [errorLog, setErrorLog] = useState<Record<string, ErrorLogRow[]>>({});
  const [formOpen, setFormOpen] = useState(false);

  function toggleExpand(row: ConnectionRow) {
    if (expanded === row.id) {
      setExpanded(null);
      return;
    }
    setExpanded(row.id);
    if (!errorLog[row.id]) {
      startTransition(async () => {
        const outcome = await runAction(() => loadConnectionErrorsAction(row.organizationId, row.id), {
          errorTitle: "Couldn't load the error log",
        });
        if (outcome.ok && outcome.data.ok) {
          setErrorLog((prev) => ({ ...prev, [row.id]: outcome.data.ok ? outcome.data.errors : [] }));
        }
      });
    }
  }

  function retry(row: ConnectionRow) {
    startTransition(async () => {
      const outcome = await runAction(() => retrySyncAction({ organizationId: row.organizationId, connectionId: row.id }), {
        errorTitle: "Couldn't retry the sync",
      });
      if (!outcome.ok) return;
      if (!outcome.data.ok) {
        toast({ variant: 'error', title: outcome.data.error });
      } else {
        toast({ variant: 'success', title: 'Sync retried.' });
      }
      setErrorLog((prev) => {
        const { [row.id]: _drop, ...rest } = prev;
        return rest;
      });
      router.refresh();
    });
  }

  function test(row: ConnectionRow) {
    startTransition(async () => {
      const outcome = await runAction(
        () => testIntegrationConnection({ organizationId: row.organizationId, connectionId: row.id }),
        { errorTitle: "Couldn't test the connection" },
      );
      if (!outcome.ok) return;
      if (!outcome.data.ok) {
        toast({ variant: 'error', title: outcome.data.error });
      } else {
        toast({ variant: 'success', title: `Connected as ${outcome.data.accountLabel}.` });
      }
      router.refresh();
    });
  }

  function remove(row: ConnectionRow) {
    if (!confirm(`Remove the ${row.providerLabel} connection for ${row.organizationName}? This can't be undone.`)) return;
    startTransition(async () => {
      const outcome = await runAction(() => deleteIntegrationConnection(row.organizationId, row.id), {
        errorTitle: "Couldn't remove the connection",
      });
      if (!outcome.ok) return;
      toast({ variant: 'success', title: 'Connection removed.' });
      router.refresh();
    });
  }

  return (
    <>
      <section className="card" id="integration-health-matrix">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-[15.5px] font-bold">Connection Health Matrix</h2>
          <button type="button" className="btn-primary !w-auto px-4 text-xs" onClick={() => setFormOpen((o) => !o)}>
            {formOpen ? 'Cancel' : '+ Add connection'}
          </button>
        </div>

        {connections.length === 0 ? (
          <p className="text-sm text-ink-muted">No external connections configured yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-ink-faint font-semibold border-b border-border">
                  <th className="py-2 pr-4">Tenant</th>
                  <th className="py-2 pr-4">Provider</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Last sync</th>
                  <th className="py-2 pr-4">Records</th>
                  <th className="py-2 pr-4">Avg duration</th>
                  <th className="py-2 pr-4">Rate limit</th>
                  <th className="py-2 pr-4">Errors</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {connections.map((row) => {
                  const status = STATUS_META[row.status] ?? STATUS_META.NOT_CONFIGURED!;
                  return (
                    <>
                      <tr key={row.id} className="border-b border-border/60">
                        <td className="py-2.5 pr-4 font-medium">{row.organizationName}</td>
                        <td className="py-2.5 pr-4">{row.providerLabel}</td>
                        <td className="py-2.5 pr-4">
                          <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-semibold', status.className)}>
                            {status.label}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 text-ink-muted">{relativeTime(row.lastSyncAt)}</td>
                        <td className="py-2.5 pr-4 tabular-nums">{row.lastSyncRecordCount ?? '—'}</td>
                        <td className="py-2.5 pr-4 tabular-nums text-ink-muted">
                          {row.avgSyncDurationMs ? `${(row.avgSyncDurationMs / 1000).toFixed(1)}s` : '—'}
                        </td>
                        <td className="py-2.5 pr-4 tabular-nums text-ink-muted">{row.rateLimitRemaining ?? '—'}</td>
                        <td className="py-2.5 pr-4">
                          {row.openErrorCount > 0 ? (
                            <button
                              type="button"
                              onClick={() => toggleExpand(row)}
                              className="rounded-full bg-critical-soft text-critical px-2 py-0.5 text-[11px] font-semibold"
                            >
                              {row.openErrorCount} open
                            </button>
                          ) : (
                            <span className="text-ink-faint">0</span>
                          )}
                        </td>
                        <td className="py-2.5 flex items-center gap-1.5 justify-end">
                          <button type="button" disabled={pending} onClick={() => test(row)} className="text-ink-muted hover:text-ink text-xs px-2 py-1">
                            Test
                          </button>
                          <button type="button" disabled={pending} onClick={() => retry(row)} className="text-brand hover:text-brand text-xs px-2 py-1 font-semibold">
                            Retry Sync
                          </button>
                          <button type="button" disabled={pending} onClick={() => toggleExpand(row)} className="text-ink-muted hover:text-ink text-xs px-2 py-1">
                            {expanded === row.id ? 'Hide log' : 'Log'}
                          </button>
                          <button type="button" disabled={pending} onClick={() => remove(row)} className="text-critical hover:text-critical text-xs px-2 py-1">
                            Remove
                          </button>
                        </td>
                      </tr>
                      {expanded === row.id && (
                        <tr key={`${row.id}-detail`} className="border-b border-border/60 bg-surface-2/40">
                          <td colSpan={9} className="py-3 px-4">
                            <ErrorLogPanel rows={errorLog[row.id]} />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {formOpen && (
        <NewConnectionForm
          tenants={tenants}
          onSaved={() => {
            setFormOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function ErrorLogPanel({ rows }: { rows: ErrorLogRow[] | undefined }) {
  if (rows === undefined) return <p className="text-xs text-ink-faint">Loading…</p>;
  if (rows.length === 0) return <p className="text-xs text-ink-faint">No errors logged.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((e) => (
        <li key={e.id} className="text-xs">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-critical-soft text-critical px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
              {e.category.replace(/_/g, ' ')}
            </span>
            <span className="text-ink-faint">{new Date(e.occurredAt).toLocaleString()}</span>
          </div>
          <p className="mt-1 text-ink">{e.humanMessage}</p>
        </li>
      ))}
    </ul>
  );
}

function NewConnectionForm({
  tenants,
  onSaved,
}: {
  tenants: { id: string; name: string; slug: string }[];
  onSaved: () => void;
}) {
  const runAction = useSafeAction();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [organizationId, setOrganizationId] = useState('');
  const [providerKey, setProviderKey] = useState(PROVIDER_META[0]!.provider);
  const [displayName, setDisplayName] = useState('');
  const [config, setConfig] = useState<Record<string, string>>({});
  const [credential, setCredential] = useState('');
  const [syncIntervalMinutes, setSyncIntervalMinutes] = useState(60);

  const meta = PROVIDER_META.find((m) => m.provider === providerKey)!;

  function submit() {
    if (!organizationId || !displayName.trim()) {
      toast({ variant: 'error', title: 'Pick a tenant and name the connection first.' });
      return;
    }
    startTransition(async () => {
      const outcome = await runAction(
        () =>
          upsertIntegrationConnection({
            organizationId,
            provider: providerKey,
            displayName: displayName.trim(),
            config,
            credential: credential.trim() || undefined,
            syncIntervalMinutes,
          }),
        { errorTitle: "Couldn't save the connection" },
      );
      if (!outcome.ok) return;
      if (!outcome.data.ok) {
        toast({ variant: 'error', title: outcome.data.error });
        return;
      }
      toast({ variant: 'success', title: 'Connection saved.' });
      onSaved();
    });
  }

  return (
    <section className="card flex flex-col gap-4">
      <h2 className="text-[15.5px] font-bold">New connection</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Tenant</span>
          <select className="input" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
            <option value="">Select a tenant…</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.slug})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Provider</span>
          <select
            className="input"
            value={providerKey}
            onChange={(e) => {
              setProviderKey(e.target.value as typeof providerKey);
              setConfig({});
            }}
          >
            {PROVIDER_META.map((m) => (
              <option key={m.provider} value={m.provider}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Connection name</span>
        <input
          type="text"
          className="input"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={`e.g. ${meta.label} — Delivery`}
        />
      </label>

      {meta.configFields.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {meta.configFields.map((f) => (
            <label key={f.key} className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">{f.label}</span>
              <input
                type="text"
                className="input"
                value={config[f.key] ?? ''}
                onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
              />
            </label>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">API token / key</span>
          <input
            type="password"
            className="input"
            value={credential}
            onChange={(e) => setCredential(e.target.value)}
            placeholder="Sealed at rest — never shown again after saving"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Sync every (minutes)</span>
          <input
            type="number"
            min={15}
            max={1440}
            className="input"
            value={syncIntervalMinutes}
            onChange={(e) => setSyncIntervalMinutes(Number(e.target.value))}
          />
        </label>
      </div>

      <div>
        <button type="button" className="btn-primary !w-auto px-4 text-xs" disabled={pending} onClick={submit}>
          {pending ? 'Saving…' : 'Save connection'}
        </button>
      </div>
    </section>
  );
}
