'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { BrandMark } from '@/components/ui/brand-mark';
import { useDashboardUI } from './dashboard-ui-context';
import { rbacHiddenHrefs } from '@/lib/governance/rbacMatrix';

interface NavItem {
  href: string;
  label: string;
  /**
   * Minimalist 24-unit line glyph — just the inner shapes; the shared
   * <svg> shell (currentColor, 1.75 stroke, round caps) lives in NavLink so
   * every icon inherits the link's ink colour and the single blue accent.
   */
  icon: ReactNode;
}

interface NavGroup {
  heading: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    heading: 'Portfolio',
    items: [
      {
        href: '/command',
        label: 'Command Center',
        // terminal chevron + prompt line
        icon: (
          <>
            <path d="M5 8l4 4-4 4" />
            <path d="M13 16h6" />
          </>
        ),
      },
      {
        href: '/',
        label: 'Control Tower',
        // 2×2 portfolio grid
        icon: (
          <>
            <rect x="4" y="4" width="7" height="7" rx="1" />
            <rect x="13" y="4" width="7" height="7" rx="1" />
            <rect x="4" y="13" width="7" height="7" rx="1" />
            <rect x="13" y="13" width="7" height="7" rx="1" />
          </>
        ),
      },
      {
        href: '/capacity',
        label: 'Resource & Capacity',
        // utilization gauge
        icon: (
          <>
            <path d="M4 18a8 8 0 1 1 16 0" />
            <path d="M12 18l4-4.5" />
          </>
        ),
      },
    ],
  },
  {
    heading: 'Engagement Governance',
    // Ordered to follow the delivery workflow: size the deal, track its
    // financial realization, run the schedule, manage RAID, then audit.
    items: [
      {
        href: '/commercial-baseline',
        label: 'Commercial Baseline',
        // contract document
        icon: (
          <>
            <path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
            <path d="M14 3v5h5" />
            <path d="M9 13h6M9 16h4" />
          </>
        ),
      },
      {
        href: '/financials',
        label: 'Financial Realization',
        // trending line + arrow head
        icon: (
          <>
            <path d="M4 16l5-5 4 4 7-7" />
            <path d="M16 8h4v4" />
          </>
        ),
      },
      {
        href: '/schedule',
        label: 'Schedule & Milestones',
        // calendar
        icon: (
          <>
            <rect x="4" y="5" width="16" height="16" rx="1.5" />
            <path d="M8 3v4M16 3v4M4 10h16" />
          </>
        ),
      },
      {
        href: '/raid',
        label: 'RAID Cockpit',
        // risk triangle
        icon: (
          <>
            <path d="M12 4l9 16H3z" />
            <path d="M12 10v4M12 17.5h.01" />
          </>
        ),
      },
      {
        href: '/audit',
        label: 'Control Audit',
        // shield check — governance integrity
        icon: (
          <>
            <path d="M12 3l8 3v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6z" />
            <path d="M9 12l2 2 4-4" />
          </>
        ),
      },
    ],
  },
  {
    heading: 'Reporting',
    items: [
      {
        href: '/steerco',
        label: 'SteerCo Briefing',
        // presentation board
        icon: (
          <>
            <rect x="3" y="4" width="18" height="12" rx="1.5" />
            <path d="M12 16v4M8 20h8" />
            <path d="M8 12v-2M12 12v-4M16 12v-3" />
          </>
        ),
      },
      {
        href: '/reports',
        label: 'Executive Hub',
        // analytics wedge
        icon: (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 12V3M12 12l7.8 4.5" />
          </>
        ),
      },
      // Methodology Reference is intentionally NOT a top-level Reporting item —
      // it lives in-context under Control Audit (the control-guidance drawer
      // and the /audit page link to /methodology), and stays reachable via ⌘K.
    ],
  },
];

// Org setup / compliance sit apart from the three executive groups —
// reachable, but not day-to-day governance surfaces.
const SETUP_ITEMS: NavItem[] = [
  {
    href: '/admin',
    label: 'Admin & Org Setup',
    // sliders
    icon: (
      <>
        <path d="M4 7h16M4 12h16M4 17h16" />
        <circle cx="9" cy="7" r="2" />
        <circle cx="15" cy="12" r="2" />
        <circle cx="8" cy="17" r="2" />
      </>
    ),
  },
  {
    href: '/admin/audit-log',
    label: 'Compliance Ledger',
    // hash-chain link
    icon: (
      <>
        <path d="M10 13a3 3 0 0 1 0-4l2-2a3 3 0 0 1 4 4l-1 1" />
        <path d="M14 11a3 3 0 0 1 0 4l-2 2a3 3 0 0 1-4-4l1-1" />
      </>
    ),
  },
];

// A2R Operator Control Plane — visible only to A2R staff, and deliberately
// separated from every other nav item: it's the one link in this sidebar
// that leaves the tenant workspace entirely for the internal /ops shell,
// so it sits alone at the very bottom behind its own divider rather than
// among the day-to-day Setup items above it. Used to live as a pill in
// the header (see Header.tsx's git history) — moved here so it stays
// reachable for staff without occupying header real estate every client
// user sees. The reverse link ("← Client Workspace") lives in the ops
// shell itself.
const OPS_CONSOLE_ITEM: NavItem = {
  href: '/ops',
  label: 'A2R Ops Console',
  // monitor / console
  icon: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
};

const COLLAPSE_STORAGE_KEY = 'a2r_sidebar_collapsed';

function isActive(pathname: string | null, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || (pathname?.startsWith(`${href}/`) ?? false);
}

export function Sidebar({ hiddenHrefs = [], isA2rStaff = false }: { hiddenHrefs?: string[]; isA2rStaff?: boolean }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const { rbacPersona } = useDashboardUI();

  // Two independent restrictions over the same module registry, unioned:
  // (1) Enterprise Governance — modules the tenant switched off in Admin
  //     (core modules never in this list — src/lib/governance/config.ts).
  // (2) The RBAC master matrix — modules this persona isn't allowed to see
  //     at all (src/lib/governance/rbacMatrix.ts; includes core modules
  //     like Admin, which is GLOBAL_ADMIN-only). `rbacPersona` reflects a
  //     demo preview override when one is active — display-only, never
  //     the actual route gate (middleware.ts reads the real session role).
  const hidden = new Set([...hiddenHrefs, ...rbacHiddenHrefs(rbacPersona)]);
  const visibleGroups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !hidden.has(i.href)),
  })).filter((g) => g.items.length > 0);
  const visibleSetup = SETUP_ITEMS.filter((i) => !hidden.has(i.href));

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
      <Link
        href="/launch"
        title="Go to my landing view"
        className={clsx(
          'flex items-center gap-3 py-[18px] border-b border-border hover:bg-surface-2 transition-colors',
          collapsed ? 'justify-center px-2' : 'px-4'
        )}
      >
        <BrandMark size="md" />
        {!collapsed && (
          <div className="min-w-0 overflow-hidden">
            <div className="font-display font-bold text-[14.5px] whitespace-nowrap text-ink">
              Delivery OS<span className="text-ink-faint text-[10px] align-top ml-0.5">™</span>
            </div>
          </div>
        )}
      </Link>

      <nav className={clsx('py-2.5 flex flex-col flex-1', collapsed ? 'px-2 gap-1.5' : 'px-2.5 gap-3')}>
        {visibleGroups.map((group) => (
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
          {visibleSetup.map((item) => (
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

        {isA2rStaff && (
          <div className="flex flex-col gap-0.5 pt-1.5 mt-1.5 border-t border-border">
            <NavLink item={OPS_CONSOLE_ITEM} active={isActive(pathname, '/ops')} collapsed={collapsed} />
          </div>
        )}
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
        'relative flex items-center gap-2.5 rounded-sm font-semibold text-[13px] transition-colors',
        // Expanded: the icon holds the indent slot past the outdented section
        // heading (which sits at px-3) so the parent-child relationship — and
        // the destination — both read at a glance.
        collapsed ? 'justify-center px-2 py-2.5' : 'pl-6 pr-3 py-2',
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
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className={clsx('flex-none', collapsed ? 'h-[19px] w-[19px]' : 'h-[17px] w-[17px]')}
      >
        {item.icon}
      </svg>
      {!collapsed && (
        <span className="overflow-hidden text-ellipsis whitespace-nowrap">{item.label}</span>
      )}
    </Link>
  );
}
