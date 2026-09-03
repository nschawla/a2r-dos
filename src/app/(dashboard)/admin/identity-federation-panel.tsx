'use client';

/**
 * Enterprise Identity Federation — Admin & Org Setup panel. Configure a
 * tenant's SSO IdP (Azure AD / Okta / Google Workspace / generic SAML or
 * OIDC), verify its published metadata, map IdP security groups to A2R
 * delivery roles for JIT provisioning, and switch federation on / enforce
 * it for the tenant's email domains.
 */
import { useMemo, useState, type FormEvent } from 'react';
import clsx from 'clsx';
import { useBusyAction, PanelHead, Field } from './admin-panels';
import { VENDOR_PRESETS } from '@/lib/identity/vendors';
import type { IdentityProviderView } from '@/lib/identity/service';
import {
  upsertIdentityProvider,
  verifyIdpMetadata,
  setIdpEnabled,
  setIdpEnforced,
  deleteIdentityProvider,
  upsertGroupMapping,
  deleteGroupMapping,
} from '@/server/actions/identity';

type VerifyResult = { ok: true; summary: Record<string, string> } | { ok: false; error: string };

type Protocol = 'SAML' | 'OIDC';
type Vendor = 'AZURE_AD' | 'OKTA' | 'GOOGLE_WORKSPACE' | 'GENERIC';
type DeliveryRole = 'ADMIN' | 'VP_EXECUTIVE' | 'PRACTICE_DIRECTOR' | 'DELIVERY_MANAGER' | 'PROJECT_MANAGER';
type MembershipRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

const DELIVERY_ROLE_LABELS: Record<DeliveryRole, string> = {
  ADMIN: 'Admin',
  VP_EXECUTIVE: 'VP / Executive',
  PRACTICE_DIRECTOR: 'Practice Director',
  DELIVERY_MANAGER: 'Delivery Manager',
  PROJECT_MANAGER: 'Project Manager',
};

const VENDOR_LABELS: Record<Vendor, string> = {
  AZURE_AD: 'Microsoft Entra ID',
  OKTA: 'Okta',
  GOOGLE_WORKSPACE: 'Google Workspace',
  GENERIC: 'Generic SAML / OIDC',
};

export function IdentityFederationPanel({
  idp,
  practices,
  canEdit,
}: {
  idp: IdentityProviderView | null;
  practices: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const { busy, error, run } = useBusyAction();

  const [protocol, setProtocol] = useState<Protocol>(idp?.protocol ?? 'OIDC');
  const [vendor, setVendor] = useState<Vendor>(idp?.vendor ?? 'AZURE_AD');
  const [displayName, setDisplayName] = useState(idp?.displayName ?? '');
  const [emailDomains, setEmailDomains] = useState((idp?.emailDomains ?? []).join(', '));
  const [jitEnabled, setJitEnabled] = useState(idp?.jitEnabled ?? true);
  const [defaultDeliveryRole, setDefaultDeliveryRole] = useState<DeliveryRole>(
    (idp?.defaultDeliveryRole as DeliveryRole) ?? 'PROJECT_MANAGER'
  );
  const [defaultMembershipRole, setDefaultMembershipRole] = useState<MembershipRole>(
    (idp?.defaultMembershipRole as MembershipRole) ?? 'MEMBER'
  );

  // protocol-specific
  const [oidcDiscoveryUrl, setOidcDiscoveryUrl] = useState(idp?.oidcDiscoveryUrl ?? '');
  const [oidcClientId, setOidcClientId] = useState(idp?.oidcClientId ?? '');
  const [oidcClientSecret, setOidcClientSecret] = useState('');
  const [samlMetadataXml, setSamlMetadataXml] = useState('');

  const [verify, setVerify] = useState<VerifyResult | null>(null);

  const preset = VENDOR_PRESETS[vendor];

  async function saveConfig(e: FormEvent) {
    e.preventDefault();
    await run(
      () =>
        upsertIdentityProvider({
          protocol,
          vendor,
          displayName,
          emailDomains,
          jitEnabled,
          defaultDeliveryRole,
          defaultMembershipRole,
          oidcDiscoveryUrl,
          oidcClientId,
          oidcClientSecret,
        }),
      { success: 'Identity provider saved', errorTitle: 'Couldn’t save provider' }
    );
  }

  async function doVerify() {
    setVerify(null);
    await run(
      async () => {
        const r = await verifyIdpMetadata(
          protocol === 'SAML' ? { samlMetadataXml } : { oidcDiscoveryUrl }
        );
        setVerify(r);
        return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
      },
      { success: 'Metadata verified', errorTitle: 'Metadata verification failed' }
    );
  }

  return (
    <section className="card">
      <PanelHead
        eyebrow="Enterprise Identity"
        title="Single Sign-On & Identity Federation"
        desc="Federate this workspace with your identity provider. Configure the connection, verify the published metadata, map security groups to delivery roles, then enable — and optionally enforce — SSO for your domains."
      />

      {idp && <StatusRow idp={idp} />}

      {/* connection config */}
      <form onSubmit={saveConfig} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
        <Field label="Identity provider">
          <select className="input" value={vendor} onChange={(e) => setVendor(e.target.value as Vendor)} disabled={!canEdit}>
            {(Object.keys(VENDOR_LABELS) as Vendor[]).map((v) => (
              <option key={v} value={v}>
                {VENDOR_LABELS[v]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Protocol">
          <select className="input" value={protocol} onChange={(e) => setProtocol(e.target.value as Protocol)} disabled={!canEdit}>
            <option value="OIDC">OpenID Connect (OIDC)</option>
            <option value="SAML">SAML 2.0</option>
          </select>
        </Field>
        <Field label="Connection name">
          <input
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Contoso Entra ID"
            disabled={!canEdit}
            required
          />
        </Field>
        <Field label="Email domains (comma-separated)">
          <input
            className="input"
            value={emailDomains}
            onChange={(e) => setEmailDomains(e.target.value)}
            placeholder="contoso.com, contoso.co.uk"
            disabled={!canEdit}
          />
        </Field>

        <div className="sm:col-span-2 border-t border-border pt-3 mt-1">
          <div className="text-[12px] font-semibold mb-1">
            {protocol === 'OIDC' ? 'OIDC connection' : 'SAML connection'}
          </div>
          <p className="text-[11.5px] text-ink-faint mb-2">{preset.groupClaimHint}</p>
        </div>

        {protocol === 'OIDC' ? (
          <>
            <Field label="Discovery URL (.well-known/openid-configuration)">
              <input
                className="input"
                value={oidcDiscoveryUrl}
                onChange={(e) => setOidcDiscoveryUrl(e.target.value)}
                placeholder={preset.discoveryTemplate ?? 'https://idp.example.com/.well-known/openid-configuration'}
                disabled={!canEdit}
              />
            </Field>
            <Field label="Client ID">
              <input className="input" value={oidcClientId} onChange={(e) => setOidcClientId(e.target.value)} disabled={!canEdit} />
            </Field>
            <Field label={idp?.oidcClientSecretHint ? 'Client secret (leave blank to keep stored)' : 'Client secret'}>
              <input
                className="input"
                type="password"
                value={oidcClientSecret}
                onChange={(e) => setOidcClientSecret(e.target.value)}
                placeholder={idp?.oidcClientSecretHint ? '•••••••• stored' : ''}
                disabled={!canEdit}
                autoComplete="off"
              />
            </Field>
          </>
        ) : (
          <div className="sm:col-span-2">
            <Field label="IdP metadata XML (paste the EntityDescriptor)">
              <textarea
                className="input font-mono text-[11px] min-h-[120px]"
                value={samlMetadataXml}
                onChange={(e) => setSamlMetadataXml(e.target.value)}
                placeholder="<EntityDescriptor entityID=… >"
                disabled={!canEdit}
              />
            </Field>
          </div>
        )}

        <div className="sm:col-span-2 border-t border-border pt-3 mt-1">
          <div className="text-[12px] font-semibold mb-1">Just-in-time provisioning</div>
          <p className="text-[11.5px] text-ink-faint mb-2">
            Create (and keep in sync) a membership on first federated login. Group mappings below decide the
            role; these defaults apply when no group matches.
          </p>
        </div>
        <Field label="JIT provisioning">
          <select
            className="input"
            value={jitEnabled ? 'on' : 'off'}
            onChange={(e) => setJitEnabled(e.target.value === 'on')}
            disabled={!canEdit}
          >
            <option value="on">Enabled — auto-provision members</option>
            <option value="off">Disabled — pre-existing members only</option>
          </select>
        </Field>
        <Field label="Default delivery role">
          <select
            className="input"
            value={defaultDeliveryRole}
            onChange={(e) => setDefaultDeliveryRole(e.target.value as DeliveryRole)}
            disabled={!canEdit}
          >
            {(Object.keys(DELIVERY_ROLE_LABELS) as DeliveryRole[]).map((r) => (
              <option key={r} value={r}>
                {DELIVERY_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>

        {canEdit && (
          <div className="sm:col-span-2 flex items-center gap-3">
            <button className="btn-secondary !w-auto px-5" type="submit" disabled={busy}>
              {busy ? 'Saving…' : idp ? 'Save configuration' : 'Create connection'}
            </button>
            {idp && (
              <button
                type="button"
                className="text-critical text-xs font-semibold"
                onClick={() =>
                  run(() => deleteIdentityProvider(), {
                    success: 'Identity provider removed',
                    errorTitle: 'Couldn’t remove provider',
                  })
                }
              >
                Remove connection
              </button>
            )}
          </div>
        )}
      </form>

      {/* verification */}
      {idp && (
        <div className="border-t border-border pt-4 mt-4">
          <div className="flex items-center justify-between">
            <div className="text-[12px] font-semibold">Metadata verification</div>
            {canEdit && (
              <button type="button" className="btn-secondary !w-auto !py-1.5 px-3 text-xs" disabled={busy} onClick={doVerify}>
                {busy ? 'Verifying…' : 'Verify IdP metadata'}
              </button>
            )}
          </div>
          <p className="text-[11.5px] text-ink-faint mt-1">
            {idp.lastVerifiedAt
              ? `Last verified ${new Date(idp.lastVerifiedAt).toLocaleString()}${
                  idp.metadataFingerprint ? ` · fingerprint ${idp.metadataFingerprint.slice(0, 16)}…` : ''
                }`
              : 'Not verified yet — federation can’t be enabled until the metadata checks out.'}
          </p>

          {verify && (
            <div
              className={clsx(
                'mt-2 rounded-md border p-3 text-[12px]',
                verify.ok ? 'border-success/40 bg-success-soft' : 'border-critical/40 bg-critical-soft'
              )}
            >
              {verify.ok ? (
                <ul className="flex flex-col gap-1">
                  {Object.entries(verify.summary).map(([k, v]) => (
                    <li key={k} className="flex gap-2">
                      <span className="text-ink-faint w-40 flex-none">{k}</span>
                      <span className="font-mono text-[11px] break-all">{v}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-critical">{verify.error}</span>
              )}
            </div>
          )}

          {protocol === 'OIDC' && idp.oidcIssuer && (
            <ResolvedRow
              rows={{
                Issuer: idp.oidcIssuer,
                'Authorization endpoint': idp.oidcAuthEndpoint,
                'Token endpoint': idp.oidcTokenEndpoint,
                'JWKS URI': idp.oidcJwksUri,
              }}
            />
          )}
          {protocol === 'SAML' && idp.samlEntityId && (
            <ResolvedRow rows={{ 'Entity ID': idp.samlEntityId, 'SSO URL': idp.samlSsoUrl }} />
          )}
        </div>
      )}

      {/* group mappings */}
      {idp && (
        <GroupMappings idp={idp} practices={practices} canEdit={canEdit} run={run} busy={busy} />
      )}

      {/* enable / enforce */}
      {idp && canEdit && (
        <div className="border-t border-border pt-4 mt-4 flex flex-wrap items-center gap-2.5">
          <ToggleButton
            on={idp.enabled}
            onLabel="Federation enabled"
            offLabel="Enable federation"
            disabled={busy || !idp.lastVerifiedAt}
            onClick={() =>
              run(() => setIdpEnabled({ enabled: !idp.enabled }), {
                success: idp.enabled ? 'Federation disabled' : 'Federation enabled',
                errorTitle: 'Couldn’t change federation',
              })
            }
          />
          <ToggleButton
            on={idp.enforced}
            onLabel="SSO enforced"
            offLabel="Enforce SSO (block password login)"
            disabled={busy || !idp.enabled || idp.emailDomains.length === 0}
            danger
            onClick={() =>
              run(() => setIdpEnforced({ enforced: !idp.enforced }), {
                success: idp.enforced ? 'Enforcement lifted' : 'SSO enforced for your domains',
                errorTitle: 'Couldn’t change enforcement',
              })
            }
          />
          {!idp.lastVerifiedAt && (
            <span className="text-[11.5px] text-warning">Verify metadata to enable.</span>
          )}
        </div>
      )}

      {!canEdit && <p className="text-warning text-xs mt-3">Identity federation is view-only for your role.</p>}
      {error && <p className="text-critical text-xs mt-2">{error}</p>}
    </section>
  );
}

function StatusRow({ idp }: { idp: IdentityProviderView }) {
  const chips: { label: string; on: boolean; danger?: boolean }[] = [
    { label: 'Configured', on: true },
    { label: idp.lastVerifiedAt ? 'Verified' : 'Unverified', on: !!idp.lastVerifiedAt },
    { label: idp.enabled ? 'Enabled' : 'Disabled', on: idp.enabled },
    { label: idp.enforced ? 'Enforced' : 'Optional', on: idp.enforced, danger: idp.enforced },
  ];
  return (
    <div className="flex flex-wrap gap-1.5 mb-3">
      {chips.map((c) => (
        <span
          key={c.label}
          className={clsx(
            'badge !py-0.5 !px-2 !text-[10.5px]',
            !c.on
              ? '!text-ink-faint !border-border'
              : c.danger
                ? '!text-warning !border-warning/40'
                : '!text-success !border-success/40'
          )}
        >
          {c.label}
        </span>
      ))}
      <span className="badge !py-0.5 !px-2 !text-[10.5px] !text-ink-muted !border-border">
        {idp.protocol} · {idp.vendor}
      </span>
    </div>
  );
}

function ResolvedRow({ rows }: { rows: Record<string, string | null> }) {
  return (
    <ul className="mt-2 flex flex-col gap-1 text-[11.5px]">
      {Object.entries(rows)
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <li key={k} className="flex gap-2">
            <span className="text-ink-faint w-40 flex-none">{k}</span>
            <span className="font-mono text-[11px] break-all text-ink-muted">{v}</span>
          </li>
        ))}
    </ul>
  );
}

function ToggleButton({
  on,
  onLabel,
  offLabel,
  onClick,
  disabled,
  danger,
}: {
  on: boolean;
  onLabel: string;
  offLabel: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'text-xs font-semibold rounded-sm px-3 py-1.5 border transition-colors disabled:opacity-50',
        on
          ? danger
            ? 'border-warning/50 bg-warning-soft text-warning'
            : 'border-brand bg-brand/10 text-brand'
          : 'border-border text-ink-muted hover:text-ink hover:border-ink-faint'
      )}
    >
      {on ? `✓ ${onLabel}` : offLabel}
    </button>
  );
}

function GroupMappings({
  idp,
  practices,
  canEdit,
  run,
  busy,
}: {
  idp: IdentityProviderView;
  practices: { id: string; name: string }[];
  canEdit: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, opts?: { success?: string; errorTitle?: string }) => Promise<void>;
  busy: boolean;
}) {
  const [claimValue, setClaimValue] = useState('');
  const [deliveryRole, setDeliveryRole] = useState<DeliveryRole>('PROJECT_MANAGER');
  const [membershipRole, setMembershipRole] = useState<MembershipRole>('MEMBER');
  const [practiceId, setPracticeId] = useState('');
  const [priority, setPriority] = useState('100');

  const practiceName = useMemo(() => {
    const m = new Map(practices.map((p) => [p.id, p.name]));
    return (id: string | null) => (id ? (m.get(id) ?? '—') : '—');
  }, [practices]);

  async function add(e: FormEvent) {
    e.preventDefault();
    await run(
      async () => {
        const r = await upsertGroupMapping({ claimValue, deliveryRole, membershipRole, practiceId, priority });
        if (r.ok) setClaimValue('');
        return r;
      },
      { success: 'Group mapping saved', errorTitle: 'Couldn’t save mapping' }
    );
  }

  return (
    <div className="border-t border-border pt-4 mt-4">
      <div className="text-[12px] font-semibold mb-1">Security-group → role mapping</div>
      <p className="text-[11.5px] text-ink-faint mb-2">
        On federated login, the assertion’s group / role claims are matched (case-insensitively). Lowest
        priority wins; no match uses the default role ({DELIVERY_ROLE_LABELS[idp.defaultDeliveryRole as DeliveryRole]}).
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide border-b border-border">
              <th className="py-2 pr-3">Group / claim</th>
              <th className="py-2 pr-3">Delivery role</th>
              <th className="py-2 pr-3">Console role</th>
              <th className="py-2 pr-3">Practice</th>
              <th className="py-2 pr-3">Priority</th>
              {canEdit && <th className="py-2" />}
            </tr>
          </thead>
          <tbody>
            {idp.groupMappings.map((m) => (
              <tr key={m.id} className="border-b border-border/60 last:border-0">
                <td className="py-2 pr-3 font-mono text-[11px]">{m.claimValue}</td>
                <td className="py-2 pr-3">{DELIVERY_ROLE_LABELS[m.deliveryRole as DeliveryRole]}</td>
                <td className="py-2 pr-3 text-ink-muted">{m.membershipRole}</td>
                <td className="py-2 pr-3 text-ink-muted">{practiceName(m.practiceId)}</td>
                <td className="py-2 pr-3 tabular-nums">{m.priority}</td>
                {canEdit && (
                  <td className="py-2">
                    <button
                      type="button"
                      className="text-critical text-xs font-semibold"
                      onClick={() =>
                        run(() => deleteGroupMapping(m.id), {
                          success: 'Mapping removed',
                          errorTitle: 'Couldn’t remove mapping',
                        })
                      }
                    >
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {idp.groupMappings.length === 0 && (
              <tr>
                <td colSpan={6} className="py-3 text-ink-muted text-sm">
                  No mappings — every federated login gets the default role.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <form onSubmit={add} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end mt-3">
          <input
            className="input"
            placeholder="Group name / id"
            value={claimValue}
            onChange={(e) => setClaimValue(e.target.value)}
            required
          />
          <select className="input" value={deliveryRole} onChange={(e) => setDeliveryRole(e.target.value as DeliveryRole)}>
            {(Object.keys(DELIVERY_ROLE_LABELS) as DeliveryRole[]).map((r) => (
              <option key={r} value={r}>
                {DELIVERY_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <select className="input" value={membershipRole} onChange={(e) => setMembershipRole(e.target.value as MembershipRole)}>
            {(['MEMBER', 'ADMIN', 'VIEWER', 'OWNER'] as MembershipRole[]).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select className="input" value={practiceId} onChange={(e) => setPracticeId(e.target.value)}>
            <option value="">No practice</option>
            {practices.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            className="input"
            type="number"
            min={1}
            max={999}
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          />
          <button className="btn-secondary" type="submit" disabled={busy}>
            Add mapping
          </button>
        </form>
      )}
    </div>
  );
}
