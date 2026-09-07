'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

const OPS_NAV = [
  { href: '/ops/telemetry', label: 'Telemetry', desc: 'Platform-wide metrics' },
  { href: '/ops/pulse', label: 'Platform Pulse', desc: 'Build · tests · health' },
  { href: '/ops/tenants', label: 'Tenants', desc: 'Client organizations' },
  { href: '/ops/identity', label: 'Identity Federation', desc: 'Tenant SSO · SAML / OIDC' },
  { href: '/ops/staff', label: 'Staff Access', desc: 'Who can reach this console' },
  { href: '/ops/security', label: 'Operator Security', desc: 'Your authenticator (2FA)' },
  { href: '/ops/ingestion', label: 'Ingestion & Templates', desc: 'Intake schemas & downloads' },
  { href: '/ops/dev-docs', label: 'Developer Docs', desc: 'Build · architecture · setup' },
] as const;

export function OpsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {OPS_NAV.map((item) => {
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
