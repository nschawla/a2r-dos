'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Practice, DeliveryRole, Resource } from '@prisma/client';
import type { ControlDef } from '@/lib/constants';
import clsx from 'clsx';
import Link from 'next/link';
import { ControlGuidanceButton } from '@/components/audit/ControlGuidance';
import { MaskedValue } from '@/components/security/Masked';
import { useSafeAction } from '@/lib/client/safe-action';
import { useToast } from '@/components/ui/toast';
import {
  createPractice,
  deletePractice,
  createDeliveryRole,
  deleteDeliveryRole,
  setDeliveryRoleEmploymentType,
  createResource,
  deleteResource,
  updateOrgPolicy,
  updateControlLabel,
  applyGovernanceTemplate,
  updateGovernanceConfig,
} from '@/server/actions/admin';
import {
  GOVERNANCE_TEMPLATES,
  HIDEABLE_MODULES,
  TEMPLATE_ORDER,
  applyTemplate,
  detectTemplate,
  type GovernanceTemplateKey,
  type ResolvedGovernanceConfig,
} from '@/lib/governance/config';

interface RunOpts {
  /** Toast shown on success. Omit for a silent success (still refreshes). */
  success?: string;
  /** Toast heading + inline label used on failure. */
  errorTitle?: string;
}

export function useBusyAction() {
  const router = useRouter();
  const runSafe = useSafeAction();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, opts: RunOpts = {}) {
    setBusy(true);
    setError(null);
    try {
      const outcome = await runSafe(fn, { errorTitle: opts.errorTitle ?? 'Couldn’t save changes' });
      if (!outcome.ok) return; // threw — error toast already shown + logged
      const result = outcome.data;
      if (!result.ok) {
        const message = result.error ?? 'Something went wrong';
        setError(message);
        toast({ variant: 'error', title: opts.errorTitle ?? 'Change not saved', description: message });
        return;
      }
      if (opts.success) toast({ variant: 'success', title: opts.success });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, run };
}

// ------------------------------------------------------------------ Practices

export function PracticesPanel({ practices, canEdit }: { practices: Practice[]; canEdit: boolean }) {
  const [name, setName] = useState('');
  const { busy, error, run } = useBusyAction();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await run(
      async () => {
        const r = await createPractice({ name });
        if (r.ok) setName('');
        return r;
      },
      { success: 'Practice added', errorTitle: 'Couldn’t add practice' }
    );
  }

  return (
    <section className="card">
      <PanelHead eyebrow="Enterprise Roster" title="Functional Practices" desc="The practice domains delivery staff and roles roll up into." />
      <ul className="flex flex-col gap-2 mb-4">
        {practices.map((p) => (
          <li key={p.id} className="flex items-center justify-between bg-surface-2 rounded-sm px-3 py-2 text-sm">
            <span>{p.name}</span>
            {canEdit && (
              <button
                onClick={() => run(() => deletePractice(p.id), { success: 'Practice removed', errorTitle: 'Couldn’t remove practice' })}
                className="text-critical text-xs font-semibold"
                type="button"
              >
                Remove
              </button>
            )}
          </li>
        ))}
        {practices.length === 0 && <li className="text-ink-muted text-sm">No practices yet.</li>}
      </ul>
      {canEdit && (
        <form onSubmit={onSubmit} className="flex gap-2">
          <input className="input" placeholder="New practice name" value={name} onChange={(e) => setName(e.target.value)} required />
          <button className="btn-secondary !w-auto px-4" disabled={busy} type="submit">
            Add
          </button>
        </form>
      )}
      {error && <p className="text-critical text-xs mt-2">{error}</p>}
    </section>
  );
}

// ----------------------------------------------------------------------- Roles

export function RolesPanel({
  roles,
  practices,
  canEdit,
  canViewCost = true,
}: {
  roles: DeliveryRole[];
  practices: Practice[];
  canEdit: boolean;
  canViewCost?: boolean;
}) {
  const [name, setName] = useState('');
  const [billRate, setBillRate] = useState('');
  const [costRate, setCostRate] = useState('');
  const [practiceId, setPracticeId] = useState('');
  // WP6 — Employee (FTE) vs. Contractor/Vendor classification at creation.
  const [employmentType, setEmploymentType] = useState<'FTE' | 'CONTRACTOR'>('FTE');
  const { busy, error, run } = useBusyAction();
  const practiceName = (id: string | null) => practices.find((p) => p.id === id)?.name ?? '—';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await run(
      async () => {
        const r = await createDeliveryRole({ name, billRate, costRate, practiceId, employmentType });
        if (r.ok) {
          setName('');
          setBillRate('');
          setCostRate('');
          setPracticeId('');
          setEmploymentType('FTE');
        }
        return r;
      },
      { success: 'Role added', errorTitle: 'Couldn’t add role' }
    );
  }

  return (
    <section className="card">
      <PanelHead
        eyebrow="Enterprise Roster"
        title="Roles & Rate Card Matrix"
        desc="Standard delivery roles with bill and cost rates. These become the rows of every project's Phase-Effort Matrix."
      />
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide border-b border-border">
              <th className="py-2 pr-4">Role</th>
              <th className="py-2 pr-4">Practice</th>
              <th className="py-2 pr-4">Bill Rate</th>
              <th className="py-2 pr-4">Cost Rate</th>
              <th className="py-2 pr-4">Employment</th>
              {canEdit && <th className="py-2 pr-4" />}
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <RoleRow
                key={r.id}
                role={r}
                practiceName={practiceName(r.practiceId)}
                canEdit={canEdit}
                canViewCost={canViewCost}
                run={run}
              />
            ))}
            {roles.length === 0 && (
              <tr>
                <td colSpan={6} className="text-ink-muted text-sm py-3">
                  No roles yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <form onSubmit={onSubmit} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
          <input className="input" placeholder="Role name" value={name} onChange={(e) => setName(e.target.value)} required />
          <select className="input" value={practiceId} onChange={(e) => setPracticeId(e.target.value)}>
            <option value="">No practice</option>
            {practices.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input className="input" type="number" min={0} placeholder="Bill rate" value={billRate} onChange={(e) => setBillRate(e.target.value)} required />
          <input className="input" type="number" min={0} placeholder="Cost rate" value={costRate} onChange={(e) => setCostRate(e.target.value)} required />
          <select className="input" value={employmentType} onChange={(e) => setEmploymentType(e.target.value as 'FTE' | 'CONTRACTOR')}>
            <option value="FTE">Employee (FTE)</option>
            <option value="CONTRACTOR">Contractor / Vendor</option>
          </select>
          <button className="btn-secondary" disabled={busy} type="submit">
            Add role
          </button>
        </form>
      )}
      {error && <p className="text-critical text-xs mt-2">{error}</p>}
    </section>
  );
}

// WP6 — split out so the FTE/Contractor toggle can carry its own busy
// state per row without a role-wide `run()` disabling every other row's
// controls while one save is in flight.
function RoleRow({
  role,
  practiceName,
  canEdit,
  canViewCost,
  run,
}: {
  role: DeliveryRole;
  practiceName: string;
  canEdit: boolean;
  canViewCost: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, opts?: RunOpts) => Promise<void>;
}) {
  const router = useRouter();
  const runSafe = useSafeAction();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function handleToggle() {
    if (!canEdit || busy) return;
    const next = role.employmentType === 'CONTRACTOR' ? 'FTE' : 'CONTRACTOR';
    setBusy(true);
    try {
      const outcome = await runSafe(
        () => setDeliveryRoleEmploymentType({ id: role.id, employmentType: next }),
        { errorTitle: `Couldn’t update ${role.name}` }
      );
      if (!outcome.ok) return;
      const r = outcome.data;
      if (!r.ok) {
        toast({ variant: 'error', title: 'Change not saved', description: r.error ?? 'Something went wrong' });
        return;
      }
      toast({ variant: 'success', title: `${role.name} → ${next === 'CONTRACTOR' ? 'Contractor' : 'FTE'}` });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className="py-2 pr-4 font-semibold">{role.name}</td>
      <td className="py-2 pr-4 text-ink-muted">{practiceName}</td>
      <td className="py-2 pr-4 tabular-nums">${role.billRate.toFixed(0)}</td>
      <td className="py-2 pr-4 tabular-nums">
        <MaskedValue canView={canViewCost} value={`$${role.costRate.toFixed(0)}`} />
      </td>
      <td className="py-2 pr-4">
        <button
          type="button"
          onClick={handleToggle}
          disabled={!canEdit || busy}
          className={clsx(
            'text-[10.5px] font-semibold rounded-full px-2 py-0.5 border transition-colors disabled:opacity-60',
            role.employmentType === 'CONTRACTOR'
              ? 'border-warning/40 bg-warning-soft text-warning'
              : 'border-na/30 bg-na-soft text-na',
            canEdit && 'hover:opacity-80'
          )}
          title={canEdit ? 'Click to toggle Employee / Contractor' : undefined}
        >
          {busy ? 'Saving…' : role.employmentType === 'CONTRACTOR' ? 'Contractor' : 'FTE'}
        </button>
      </td>
      {canEdit && (
        <td className="py-2 pr-4">
          <button
            onClick={() => run(() => deleteDeliveryRole(role.id), { success: 'Role removed', errorTitle: 'Couldn’t remove role' })}
            className="text-critical text-xs font-semibold"
            type="button"
          >
            Remove
          </button>
        </td>
      )}
    </tr>
  );
}

// ------------------------------------------------------------------- Resources

type ResourceRow = Resource & { role: DeliveryRole | null; practice: Practice | null };

export function ResourcesPanel({
  resources,
  roles,
  practices,
  canEdit,
}: {
  resources: ResourceRow[];
  roles: DeliveryRole[];
  practices: Practice[];
  canEdit: boolean;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [practiceId, setPracticeId] = useState('');
  const { busy, error, run } = useBusyAction();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await run(
      async () => {
        const r = await createResource({ name, email, roleId, practiceId });
        if (r.ok) {
          setName('');
          setEmail('');
          setRoleId('');
          setPracticeId('');
        }
        return r;
      },
      { success: 'Resource added', errorTitle: 'Couldn’t add resource' }
    );
  }

  return (
    <section className="card">
      <PanelHead
        eyebrow="Enterprise Roster"
        title="Resource Directory"
        desc="Delivery personnel mapped to a role and practice, available for assignment as PD, DM, or PM on any project."
      />
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide border-b border-border">
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Role</th>
              <th className="py-2 pr-4">Practice</th>
              {canEdit && <th className="py-2 pr-4" />}
            </tr>
          </thead>
          <tbody>
            {resources.map((r) => (
              <tr key={r.id} className="border-b border-border/60 last:border-0">
                <td className="py-2 pr-4 font-semibold">{r.name}</td>
                <td className="py-2 pr-4 text-ink-muted">{r.email || '—'}</td>
                <td className="py-2 pr-4 text-ink-muted">{r.role?.name ?? '—'}</td>
                <td className="py-2 pr-4 text-ink-muted">{r.practice?.name ?? '—'}</td>
                {canEdit && (
                  <td className="py-2 pr-4">
                    <button
                      onClick={() => run(() => deleteResource(r.id), { success: 'Resource removed', errorTitle: 'Couldn’t remove resource' })}
                      className="text-critical text-xs font-semibold"
                      type="button"
                    >
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {resources.length === 0 && (
              <tr>
                <td colSpan={5} className="text-ink-muted text-sm py-3">
                  No resources yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <form onSubmit={onSubmit} className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
          <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <select className="input" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            <option value="">No role</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
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
          <button className="btn-secondary" disabled={busy} type="submit">
            Add resource
          </button>
        </form>
      )}
      {error && <p className="text-critical text-xs mt-2">{error}</p>}
    </section>
  );
}

// --------------------------------------------------------------------- Policy

export function PolicyPanel({
  policy,
  canEdit,
}: {
  policy: { slipWarnDays: number; slipCritDays: number; marginCritPct: number; methodology: string };
  canEdit: boolean;
}) {
  const [slipWarnDays, setSlipWarnDays] = useState(String(policy.slipWarnDays));
  const [slipCritDays, setSlipCritDays] = useState(String(policy.slipCritDays));
  const [marginCritPct, setMarginCritPct] = useState(String(policy.marginCritPct));
  const [methodology, setMethodology] = useState(policy.methodology);
  const { busy, error, run } = useBusyAction();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await run(() => updateOrgPolicy({ slipWarnDays, slipCritDays, marginCritPct, methodology }), {
      success: 'Governance thresholds saved',
      errorTitle: 'Couldn’t save thresholds',
    });
  }

  return (
    <section className="card">
      <PanelHead
        eyebrow="Governance Tolerances"
        title="Milestone & Margin Thresholds"
        desc="These thresholds drive warning and critical states used across delivery reporting."
      />
      <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3">
        <Field label="Slip warning (days)">
          <input className="input" type="number" min={0} value={slipWarnDays} onChange={(e) => setSlipWarnDays(e.target.value)} disabled={!canEdit} />
        </Field>
        <Field label="Slip critical (days)">
          <input className="input" type="number" min={0} value={slipCritDays} onChange={(e) => setSlipCritDays(e.target.value)} disabled={!canEdit} />
        </Field>
        <Field label="Margin critical (%)">
          <input className="input" type="number" min={0} value={marginCritPct} onChange={(e) => setMarginCritPct(e.target.value)} disabled={!canEdit} />
        </Field>
        <Field label="Methodology preset">
          <select className="input" value={methodology} onChange={(e) => setMethodology(e.target.value)} disabled={!canEdit}>
            <option value="WATERFALL">Waterfall</option>
            <option value="AGILE">Agile</option>
            <option value="HYBRID">Hybrid</option>
          </select>
        </Field>
        {canEdit && (
          <button className="btn-secondary col-span-2 !w-auto justify-self-start px-5" disabled={busy} type="submit">
            Save thresholds
          </button>
        )}
      </form>
      {error && <p className="text-critical text-xs mt-2">{error}</p>}
    </section>
  );
}

// ------------------------------------------------------------- Control labels

export function ControlLabelsPanel({
  controls,
  labelByKey,
  canEdit,
}: {
  controls: ControlDef[];
  labelByKey: Map<string, string>;
  canEdit: boolean;
}) {
  return (
    <section className="card">
      <PanelHead
        eyebrow="Methodology Overlay"
        title="Delivery Controls & Governance Standards"
        desc="Rename how each control appears across the org without altering its underlying system key."
      />
      <p className="text-[12px] text-ink-faint -mt-2 mb-3">
        Open the{' '}
        <Link href="/methodology" className="text-brand hover:text-brand">
          Methodology Reference
        </Link>{' '}
        for the full delivery standard, or use the <span className="font-serif italic">i</span> on any control below.
      </p>
      <ul className="flex flex-col gap-2">
        {controls.map((c) => (
          <ControlLabelRow key={c.id} control={c} currentLabel={labelByKey.get(c.id) ?? c.labels.waterfall} canEdit={canEdit} />
        ))}
      </ul>
    </section>
  );
}

function ControlLabelRow({ control, currentLabel, canEdit }: { control: ControlDef; currentLabel: string; canEdit: boolean }) {
  const [label, setLabel] = useState(currentLabel);
  const { busy, error, run } = useBusyAction();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await run(() => updateControlLabel({ controlKey: control.id, label }), {
      success: 'Control label updated',
      errorTitle: 'Couldn’t update label',
    });
  }

  return (
    <li className="bg-surface-2 rounded-sm px-3 py-2.5">
      <form onSubmit={onSubmit} className="flex items-center gap-2.5">
        <span className="font-mono text-[11px] text-ink-faint w-16 flex-none">{control.id}</span>
        <ControlGuidanceButton controlKey={control.id} label={label} size="xs" />
        <input className="input flex-1" value={label} onChange={(e) => setLabel(e.target.value)} disabled={!canEdit} />
        {canEdit && (
          <button className="btn-secondary !w-auto !py-1.5 px-3 text-xs" disabled={busy || label === currentLabel} type="submit">
            Save
          </button>
        )}
      </form>
      {error && <p className="text-critical text-xs mt-1">{error}</p>}
    </li>
  );
}

// -------------------------------------------------- Enterprise Governance (Step 1)

const TEMPLATE_LABEL: Record<GovernanceTemplateKey, string> = {
  STANDARD: GOVERNANCE_TEMPLATES.STANDARD.label,
  STRICT_FINANCIAL: GOVERNANCE_TEMPLATES.STRICT_FINANCIAL.label,
  AGILE_DELIVERY: GOVERNANCE_TEMPLATES.AGILE_DELIVERY.label,
  BOARD_ONLY: GOVERNANCE_TEMPLATES.BOARD_ONLY.label,
  CUSTOM: 'Custom configuration',
};

export function GovernancePanel({
  config,
  canEdit,
}: {
  config: ResolvedGovernanceConfig;
  canEdit: boolean;
}) {
  const { busy, error, run } = useBusyAction();
  const [hidden, setHidden] = useState<string[]>(config.hiddenModules);
  const [maskDelivery, setMaskDelivery] = useState(config.maskFinancialsForDelivery);

  const detected = detectTemplate({ hiddenModules: hidden, maskFinancialsForDelivery: maskDelivery });
  const dirty =
    maskDelivery !== config.maskFinancialsForDelivery ||
    hidden.length !== config.hiddenModules.length ||
    hidden.some((k) => !config.hiddenModules.includes(k));

  function toggleModule(key: string) {
    if (!canEdit) return;
    setHidden((h) => (h.includes(key) ? h.filter((k) => k !== key) : [...h, key]));
  }

  async function pickTemplate(key: Exclude<GovernanceTemplateKey, 'CUSTOM'>) {
    await run(
      async () => {
        const r = await applyGovernanceTemplate({ template: key });
        if (r.ok) {
          const t = applyTemplate(key);
          setHidden(t.hiddenModules);
          setMaskDelivery(t.maskFinancialsForDelivery);
        }
        return r;
      },
      { success: `Applied "${GOVERNANCE_TEMPLATES[key].label}"`, errorTitle: 'Couldn’t apply template' }
    );
  }

  async function saveOverrides() {
    await run(
      () => updateGovernanceConfig({ hiddenModules: hidden, maskFinancialsForDelivery: maskDelivery }),
      { success: 'Governance configuration saved', errorTitle: 'Couldn’t save configuration' }
    );
  }

  return (
    <section className="card">
      <PanelHead
        eyebrow="Enterprise Governance"
        title="Hybrid Configuration Model"
        desc="Start from a pre-tested compliance template, then tune route visibility and financial masking on top. Changes apply tenant-wide and are recorded in the Compliance Ledger."
      />

      {/* Layer 1 — template */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
            Layer 1 · Compliance Template
          </span>
          <span
            className={clsx(
              'badge !py-0.5 !px-2 !text-[10.5px]',
              detected === 'CUSTOM' ? '!text-warning !border-warning/40' : '!text-brand !border-brand/40'
            )}
          >
            Active: {TEMPLATE_LABEL[detected]}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {TEMPLATE_ORDER.map((key) => {
            const t = GOVERNANCE_TEMPLATES[key];
            const active = detected === key;
            return (
              <button
                key={key}
                type="button"
                disabled={!canEdit || busy}
                onClick={() => pickTemplate(key)}
                className={clsx(
                  'text-left rounded-md border p-3 transition-colors disabled:opacity-60',
                  active
                    ? 'border-brand bg-brand/5'
                    : 'border-border hover:border-border-soft hover:bg-surface-2'
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold">{t.label}</span>
                  {active && <span className="text-brand text-xs">✓</span>}
                </div>
                <p className="text-[11.5px] text-ink-faint leading-snug mt-1">{t.blurb}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Layer 2 — overrides */}
      <div className="border-t border-border pt-4">
        <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
          Layer 2 · Tenant Overrides
        </span>

        <div className="mt-3">
          <div className="text-[12px] font-semibold mb-1.5">Route visibility</div>
          <p className="text-[11.5px] text-ink-faint mb-2">
            Hidden modules are removed from every user's navigation. Core modules (Control Tower, Admin,
            Compliance Ledger) can't be switched off.
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {HIDEABLE_MODULES.map((m) => {
              const isHidden = hidden.includes(m.key);
              return (
                <li key={m.key}>
                  <button
                    type="button"
                    disabled={!canEdit || busy}
                    onClick={() => toggleModule(m.key)}
                    className={clsx(
                      'w-full flex items-center justify-between gap-2 rounded-sm px-3 py-2 text-[13px] border transition-colors disabled:opacity-60',
                      isHidden
                        ? 'border-border bg-surface-2 text-ink-faint'
                        : 'border-border bg-surface-1 text-ink'
                    )}
                  >
                    <span className={clsx(isHidden && 'line-through')}>{m.label}</span>
                    <span
                      className={clsx(
                        'text-[10px] font-semibold uppercase tracking-wide flex-none',
                        isHidden ? 'text-ink-faint' : 'text-success'
                      )}
                    >
                      {isHidden ? 'Hidden' : 'Visible'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="mt-4">
          <div className="text-[12px] font-semibold mb-1.5">Sensitive financial data</div>
          <button
            type="button"
            disabled={!canEdit || busy}
            onClick={() => canEdit && setMaskDelivery((v) => !v)}
            className={clsx(
              'w-full flex items-start justify-between gap-3 rounded-sm px-3 py-2.5 text-left border transition-colors disabled:opacity-60',
              maskDelivery ? 'border-brand bg-brand/5' : 'border-border bg-surface-1 hover:bg-surface-2'
            )}
          >
            <span>
              <span className="block text-[13px] font-semibold">
                Scrub margins &amp; EAC for delivery roles
              </span>
              <span className="block text-[11.5px] text-ink-faint leading-snug mt-0.5">
                Blended margin, EAC and cost variance are masked for Practice Director and below, on top of
                the standard role-based masking. VP / Executive and Partners are unaffected.
              </span>
            </span>
            <span
              className={clsx(
                'flex-none mt-0.5 text-[10px] font-semibold uppercase tracking-wide',
                maskDelivery ? 'text-brand' : 'text-ink-faint'
              )}
            >
              {maskDelivery ? 'On' : 'Off'}
            </span>
          </button>
        </div>

        {canEdit && (
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              className="btn-secondary !w-auto px-5"
              disabled={busy || !dirty}
              onClick={saveOverrides}
            >
              {busy ? 'Saving…' : 'Save configuration'}
            </button>
            {dirty && <span className="text-[11.5px] text-warning">Unsaved changes</span>}
          </div>
        )}
      </div>

      {!canEdit && (
        <p className="text-warning text-xs mt-3">Governance configuration is view-only for your role.</p>
      )}
      {error && <p className="text-critical text-xs mt-2">{error}</p>}
    </section>
  );
}

// ----------------------------------------------------------------- Shared UI

export function PanelHead({ eyebrow, title, desc }: { eyebrow: string; title: string; desc: string }) {
  return (
    <div className="mb-4">
      <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">{eyebrow}</div>
      <h2 className="text-[15.5px] font-bold">{title}</h2>
      <p className="text-[12.5px] text-ink-muted mt-1">{desc}</p>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}
