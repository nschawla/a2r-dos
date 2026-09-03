'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { BrandMark } from '@/components/ui/brand-mark';

interface NavItem {
  href: string;
  label: string;
  /** 2-letter tag shown when the sidebar is collapsed. */
  abbr: string;
}

interface NavGroup {
  heading: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    heading: 'Portfolio',
    items: [
      { href: '/command', label: 'Command Center', abbr: 'CC' },
      { href: '/', label: 'Control Tower', abbr: 'CT' },
      { href: '/capacity', label: 'Resource & Capacity', abbr: 'RC' },
    ],
  },
  {
    heading: 'Engagement Governance',
    // Ordered to follow the delivery workflow: size the deal, track its
    // financial realization, run the schedule, manage RAID, then audit.
    items: [
      { href: '/commercial-baseline', label: 'Commercial Baseline', abbr: 'CB' },
      { href: '/financials', label: 'Financial Realization', abbr: 'FR' },
      { href: '/schedule', label: 'Schedule & Milestones', abbr: 'SM' },
      { href: '/raid', label: 'RAID Cockpit', abbr: 'RD' },
      { href: '/audit', label: 'Control Audit', abbr: 'CA' },
    ],
  },
  {
    heading: 'Reporting',
    items: [
      { href: '/steerco', label: 'SteerCo Briefing', abbr: 'SC' },
      { href: '/reports', label: 'Executive Hub', abbr: 'EX' },
      { href: '/methodology', label: 'Methodology Reference', abbr: 'MR' },
    ],
  },
];

// Org setup / compliance sit apart from the three executive groups —
// reachable, but not day-to-day governance surfaces.
const SETUP_ITEMS: NavItem[] = [
  { href: '/admin', label: 'Admin & Org Setup', abbr: 'AD' },
  { href: '/admin/audit-log', label: 'Compliance Ledger', abbr: 'CL' },
];

const COLLAPSE_STORAGE_KEY = 'a2r_sidebar_collapsed';

function isActive(pathname: string | null, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || (pathname?.startsWith(`${href}/`) ?? false);
}

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1');
    } catch {
      // ignore
    } finally {
      setHydrated(true);
    }
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  }

  return (
    <aside
      className={clsx(
        'flex-none bg-surface-1 border-r border-border flex flex-col sticky top-0 h-screen overflow-y-auto transition-[width]',
        hydrated ? 'duration-150' : 'duration-0',
        collapsed ? 'w-[72px]' : 'w-[252px]'
      )}
    >
      <div className={clsx('flex items-center gap-3 py-[18px] border-b border-border', collapsed ? 'justify-center px-2' : 'px-4')}>
        <BrandMark size="md" />
        {!collapsed && (
          <div className="min-w-0 overflow-hidden">
            <div className="font-display font-bold text-[14.5px] whitespace-nowrap">
              A2R Delivery OS<span className="text-ink-faint text-[10px] align-top ml-0.5">™</span>
            </div>
          </div>
        )}
      </div>

      <nav className={clsx('py-2.5 flex flex-col flex-1', collapsed ? 'px-2 gap-1.5' : 'px-2.5 gap-3')}>
        {NAV_GROUPS.map((group) => (
          <div key={group.heading} className="flex flex-col gap-0.5">
            {collapsed ? (
              <div className="h-px bg-border/70 mx-1 my-1 first:hidden" />
            ) : (
              <div className="px-3 pt-1 pb-1 font-mono text-[9.5px] tracking-[0.14em] uppercase text-ink-faint font-semibold">
                {group.heading}
              </div>
            )}
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} collapsed={collapsed} />
            ))}
          </div>
        ))}

        <div className="mt-auto flex flex-col gap-0.5">
          {!collapsed && <div className="h-px bg-border/70 mx-3 mb-1" />}
          {SETUP_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={
                item.href === '/admin'
                  ? pathname === '/admin'
                  : isActive(pathname, item.href)
              }
              collapsed={collapsed}
            />
          ))}
        </div>
      </nav>

      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className={clsx(
          'flex items-center gap-2 py-3 border-t border-border text-[11px] text-ink-faint hover:text-ink-muted transition-colors',
          collapsed ? 'justify-center px-2' : 'px-4'
        )}
      >
        <span className={clsx('inline-block transition-transform', collapsed && 'rotate-180')}>&larr;</span>
        {!collapsed && <span>Collapse</span>}
      </button>
    </aside>
  );
}

function NavLink({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={clsx(
        'relative flex items-center gap-3 rounded-sm font-semibold text-[13px] transition-colors',
        collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2',
        active ? 'bg-surface-2 text-ink' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
      )}
    >
      {active && (
        <span
          className={clsx(
            'absolute top-2 bottom-2 w-[3px] rounded-full bg-brand',
            collapsed ? '-left-2' : '-left-2.5'
          )}
        />
      )}
      {collapsed ? (
        <span className="text-[11px] font-mono font-bold">{item.abbr}</span>
      ) : (
        <span className="overflow-hidden text-ellipsis whitespace-nowrap">{item.label}</span>
      )}
    </Link>
  );
}
