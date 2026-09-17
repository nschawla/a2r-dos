'use client';

/**
 * Enterprise Identity Federation — A2R Ops Console panel (/ops/identity).
 *
 * As of v1.2.1 identity federation is a PLATFORM-level infrastructure
 * capability: an A2R operator configures a tenant's SSO IdP (Azure AD /
 * Okta / Google Workspace / generic SAML or OIDC), verifies its published
 * metadata, maps IdP security groups to delivery roles for JIT
 * provisioning, and switches federation on / enforces it. Every action
 * carries the target `organizationId` and is staff-gated server-side.
 */
import { useMemo, useState, type FormEvent } from 'react';
import clsx from 'clsx';
import { useBusyAction, PanelHead, Field } from '@/components/ui/panel-kit';
import { VENDOR_PRESETS } from '@/lib/identity/vendors';
import type { IdentityProviderView } from '@/lib/identity/service';
import type { SsoLoginErrorView } from '@/server/queries/pages/admin';
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
type DeliveryRole = 'ADMIN' | 'VP_EXECUTIVE' | 'PRACTICE_DIRECTOR' | 'DELIVERY_MANAGER' | 'PROJECT_MANAGER' | 'VIEWER';
type MembershipRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

// All six real DeliveryAccessRole tiers — the six RBAC Master Matrix
// personas (src/lib/governance/rbacMatrix.ts) map 1:1 onto these.
const DELIVERY_ROLE_LABELS: Record<DeliveryRole, string> = {
  ADMIN: 'Admin (Global Admin)',
  VP_EXECUTIVE: 'VP / Executive (Executive Board)',
  PRACTICE_DIRECTOR: 'Practice Director (Engagement / Practice Manager)',
  DELIVERY_MANAGER: 'Delivery Manager (Delivery Executive)',
  PROJECT_MANAGER: 'Project Manager',
  VIEWER: 'Viewer / Guest',
};

const VENDOR_LABELS: Record<Vendor, string> = {
  AZURE_AD: 'Microsoft Entra ID',
  OKTA: 'Okta',
  GOOGLE_WORKSPACE: 'Google Workspace',
  GENERIC: 'Generic SAML / OIDC',
};

export function IdentityFederationPanel({
  organizationId,
  tenantName,
  idp,
  practices,
  loginErrors,
  spEntityId,
  spAcsUrl,
}: {
  organizationId: string;
  tenantName: string;
  idp: IdentityProviderView | null;
  practices: { id: string; name: string }[];
  loginErrors: SsoLoginErrorView[];
  spEntityId: string;
  spAcsUrl: string;
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
          organizationId,
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
          protocol === 'SAML'
            ? { organizationId, samlMetadataXml }
            : { organizationId, oidcDiscoveryUrl }
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
        eyebrow="Platform Infrastructure · Identity"
        title={`SSO & Identity Federation — ${tenantName}`}
        desc="Federate this tenant with its identity provider. Configure the connection, verify the published metadata, map security groups to delivery roles, then enable — and optionally enforce — SSO for the tenant's email domains."
      />

      {idp && <StatusRow idp={idp} />}

      {protocol === 'SAML' && (
        <div className="rounded-md border border-border bg-surface-2 p-3 mb-3 text-[11.5px]">
          <div className="font-semibold text-[12px] mb-1.5">PS-DOS Service Provider details</div>
          <p className="text-ink-faint mb-2">
            Give these three values to the IdP admin — most SAML setup wizards ask for exactly this. One SP
            identity is shared across every PS-DOS tenant; what makes this connection tenant-specific is the
            IdP metadata configured below.
          </p>
          <CopyRow label="SP Entity ID / Audience" value={spEntityId} />
          <CopyRow label="ACS URL (Assertion Consumer Service)" value={spAcsUrl} />
          <CopyRow label="SP metadata URL" value={`${spAcsUrl.replace(/\/acs$/, '/metadata')}`} />
        </div>
      )}

      {/* connection config */}
      <form onSubmit={saveConfig} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
        <Field label="Identity provider">
          <select className="input" value={vendor} onChange={(e) => setVendor(e.target.value as Vendor)}>
            {(Object.keys(VENDOR_LABELS) as Vendor[]).map((v) => (
              <option key={v} value={v}>
                {VENDOR_LABELS[v]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Protocol">
          <select className="input" value={protocol} onChange={(e) => setProtocol(e.target.value as Protocol)}>
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
            required
          />
        </Field>
        <Field label="Email domains (comma-separated)">
          <input
            className="input"
            value={emailDomains}
            onChange={(e) => setEmailDomains(e.target.value)}
            placeholder="contoso.com, contoso.co.uk"
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
              />
            </Field>
            <Field label="Client ID">
              <input className="input" value={oidcClientId} onChange={(e) => setOidcClientId(e.target.value)} />
            </Field>
            <Field label={idp?.oidcClientSecretHint ? 'Client secret (leave blank to keep stored)' : 'Client secret'}>
              <input
                className="input"
                type="password"
                value={oidcClientSecret}
                onChange={(e) => setOidcClientSecret(e.target.value)}
                placeholder={idp?.oidcClientSecretHint ? '•••••••• stored' : ''}
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
          >
            {(Object.keys(DELIVERY_ROLE_LABELS) as DeliveryRole[]).map((r) => (
              <option key={r} value={r}>
                {DELIVERY_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>

        <div className="sm:col-span-2 flex items-center gap-3">
          <button className="btn-secondary !w-auto px-5" type="submit" disabled={busy}>
            {busy ? 'Saving…' : idp ? 'Save configuration' : 'Create connection'}
          </button>
          {idp && (
            <button
              type="button"
              className="text-critical text-xs font-semibold"
              onClick={() =>
                run(() => deleteIdentityProvider(organizationId), {
                  success: 'Identity provider removed',
                  errorTitle: 'Couldn’t remove provider',
                })
              }
            >
              Remove connection
            </button>
          )}
        </div>
      </form>

      {/* verification */}
      {idp && (
        <div className="border-t border-border pt-4 mt-4">
          <div className="flex items-center justify-between">
            <div className="text-[12px] font-semibold">Metadata verification</div>
            <button type="button" className="btn-secondary !w-auto !py-1.5 px-3 text-xs" disabled={busy} onClick={doVerify}>
              {busy ? 'Verifying…' : 'Verify IdP metadata'}
            </button>
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
        <GroupMappings organizationId={organizationId} idp={idp} practices={practices} run={run} busy={busy} />
      )}

      {/* enable / enforce */}
      {idp && (
        <div className="border-t border-border pt-4 mt-4 flex flex-wrap items-center gap-2.5">
          <ToggleButton
            on={idp.enabled}
            onLabel="Federation enabled"
            offLabel="Enable federation"
            disabled={busy || !idp.lastVerifiedAt}
            onClick={() =>
              run(() => setIdpEnabled({ organizationId, enabled: !idp.enabled }), {
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
              run(() => setIdpEnforced({ organizationId, enforced: !idp.enforced }), {
                success: idp.enforced ? 'Enforcement lifted' : 'SSO enforced for the tenant’s domains',
                errorTitle: 'Couldn’t change enforcement',
              })
            }
          />
          {!idp.lastVerifiedAt && <span className="text-[11.5px] text-warning">Verify metadata to enable.</span>}
        </div>
      )}

      {/* sign-in failure log */}
      {idp?.protocol === 'SAML' && <SsoLoginFailuresLog errors={loginErrors} />}

      {error && <p className="text-critical text-xs mt-2">{error}</p>}
    </section>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-ink-faint w-56 flex-none">{label}</span>
      <span className="font-mono text-[11px] break-all text-ink-muted flex-1">{value}</span>
      <button
        type="button"
        className="text-brand font-semibold flex-none"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard permission denied — the value is still selectable text */
          }
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

const SSO_ERROR_CATEGORY_LABEL: Record<string, string> = {
  INVALID_SIGNATURE: 'Invalid signature',
  EXPIRED_ASSERTION: 'Expired assertion',
  REPLAY_DETECTED: 'Replay detected',
  ISSUER_MISMATCH: 'Issuer mismatch',
  NO_IDP_CONFIGURED: 'Not configured',
  IDP_DISABLED: 'Federation disabled',
  MAPPING_DENIED: 'Access denied',
  MALFORMED_RESPONSE: 'Malformed response',
  UNKNOWN: 'Unknown',
};

function SsoLoginFailuresLog({ errors }: { errors: SsoLoginErrorView[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="border-t border-border pt-4 mt-4">
      <div className="text-[12px] font-semibold mb-1">Recent federated sign-in failures</div>
      <p className="text-[11.5px] text-ink-faint mb-2">
        Every failed SAML handshake attempt for this tenant, most recent first — signature and replay checks,
        provisioning refusals, and configuration mismatches. Never a raw stack trace.
      </p>
      {errors.length === 0 ? (
        <p className="text-ink-muted text-sm py-2">No sign-in failures logged for this tenant.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60">
          {errors.map((e) => (
            <li key={e.id} className="py-2">
              <button
                type="button"
                className="w-full flex items-start justify-between gap-3 text-left"
                onClick={() => setExpanded((cur) => (cur === e.id ? null : e.id))}
              >
                <span className="flex-1 min-w-0">
                  <span className="badge !py-0.5 !px-2 !text-[10.5px] !text-critical !border-critical/40 mr-2">
                    {SSO_ERROR_CATEGORY_LABEL[e.category] ?? e.category}
                  </span>
                  <span className="text-[12.5px]">{e.humanMessage}</span>
                </span>
                <span className="text-ink-faint text-[11px] flex-none tabular-nums">
                  {new Date(e.occurredAt).toLocaleString()}
                </span>
              </button>
              {expanded === e.id && (
                <div className="mt-1.5 ml-1 text-[11px] text-ink-muted flex flex-col gap-0.5">
                  {e.emailAttempted && (
                    <span>
                      <span className="text-ink-faint">Email attempted:</span> {e.emailAttempted}
                    </span>
                  )}
                  {e.rawDetail && (
                    <span className="font-mono break-all">
                      <span className="text-ink-faint font-sans">Detail:</span> {e.rawDetail}
                    </span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
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
  organizationId,
  idp,
  practices,
  run,
  busy,
}: {
  organizationId: string;
  idp: IdentityProviderView;
  practices: { id: string; name: string }[];
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, opts?: { success?: string; errorTitle?: string }) => Promise<boolean>;
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
        const r = await upsertGroupMapping({
          organizationId,
          claimValue,
          deliveryRole,
          membershipRole,
          practiceId,
          priority,
        });
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
              <th className="py-2" />
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
                <td className="py-2">
                  <button
                    type="button"
                    className="text-critical text-xs font-semibold"
                    onClick={() =>
                      run(() => deleteGroupMapping(organizationId, m.id), {
                        success: 'Mapping removed',
                        errorTitle: 'Couldn’t remove mapping',
                      })
                    }
                  >
                    Remove
                  </button>
                </td>
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
    </div>
  );
}
