'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import {
  type OperatorRole,
  type OperatorCapability,
  operatorCan,
  OPERATOR_ROLE_LABEL,
} from '@/lib/ops/operator-roles';

const OPS_NAV: ReadonlyArray<{ href: string; label: string; desc: string; capability: OperatorCapability }> = [
  { href: '/ops/telemetry', label: 'Telemetry', desc: 'Platform-wide metrics', capability: 'telemetry:view' },
  { href: '/ops/pulse', label: 'Platform Pulse', desc: 'Build · tests · health', capability: 'pulse:view' },
  { href: '/ops/tenants', label: 'Tenants', desc: 'Client organizations', capability: 'tenants:view' },
  { href: '/ops/billing', label: 'Billing', desc: 'Subscriptions · contract tiers', capability: 'billing:view' },
  { href: '/ops/audit', label: 'Audit & Compliance', desc: 'Immutable ledger · elevation history', capability: 'audit:view' },
  { href: '/ops/identity', label: 'Identity Federation', desc: 'Tenant SSO · SAML / OIDC', capability: 'identity:manage' },
  { href: '/ops/staff', label: 'Staff Access', desc: 'Who can reach this console', capability: 'staff:manage' },
  { href: '/ops/access', label: 'Role & Access', desc: 'Operator roles & permissions', capability: 'roles:manage' },
  { href: '/ops/security', label: 'Operator Security', desc: 'Your authenticator (2FA)', capability: 'ops:view' },
  { href: '/ops/ingestion', label: 'Ingestion & Templates', desc: 'Intake schemas & downloads', capability: 'ingestion:manage' },
  { href: '/ops/dev-docs', label: 'Developer Docs', desc: 'Build · architecture · setup', capability: 'devdocs:view' },
];

export function OpsNav({ role }: { role: OperatorRole }) {
  const pathname = usePathname();
  const items = OPS_NAV.filter((item) => operatorCan(role, item.capability));

  return (
    <nav className="flex flex-col gap-0.5">
      <div className="px-3 pb-1.5 text-[9.5px] uppercase tracking-wide text-ink-faint font-mono font-medium">
        {OPERATOR_ROLE_LABEL[role]}
      </div>
      {items.map((item) => {
        const active = pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              'relative rounded-sm px-3 py-2.5 text-[13px] font-semibold transition-colors',
              active ? 'bg-surface-2 text-ink' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
            )}
          >
            {active && (
              <span className="absolute -left-2.5 top-2 bottom-2 w-[3px] rounded-full bg-brand" />
            )}
            <span className="block">{item.label}</span>
            <span className="block font-mono text-[9.5px] uppercase tracking-wide text-ink-faint font-medium mt-px">
              {item.desc}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
