'use client';

/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Tabbed Multi-Tasking Workspaces — the dismissible tab strip along the top
 * of the workspace, below the main header. Renders `workspaceTabs` from
 * DashboardUIContext (see that file's doc comment, and
 * src/lib/client/workspace-tabs.ts, for the deliberate scope: this is a
 * navigational convenience layer, not an in-memory multi-instance shell —
 * clicking a tab is a real route transition, not a kept-alive component
 * swap). Renders nothing at all until the first tab is opened — no empty
 * chrome taking up a row for a viewer who never uses this.
 *
 * "Control Tower" is always the first, pinned entry and is never itself a
 * closable tab — it's the home base every tab was opened *from*, so it's
 * always one click away regardless of how many tabs are open.
 */
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';
import { useDashboardUI } from './dashboard-ui-context';

const HOME_HREF = '/portfolio';

export function WorkspaceTabsBar() {
  const { workspaceTabs, closeWorkspaceTab } = useDashboardUI();
  const pathname = usePathname();
  const router = useRouter();

  if (workspaceTabs.length === 0) return null;

  function handleClose(e: React.MouseEvent, href: string) {
    e.preventDefault();
    e.stopPropagation();
    closeWorkspaceTab(href);
    // Closing the tab you're currently sitting on: land back on the home
    // base rather than leaving the viewer on a now-tabless page with no
    // way back except the sidebar.
    if (pathname === href) router.push(HOME_HREF);
  }

  return (
    <div
      role="tablist"
      aria-label="Open workspace tabs"
      className="flex items-stretch gap-0.5 px-2 bg-surface-1 border-b border-border-soft overflow-x-auto"
    >
      <Link
        href={HOME_HREF}
        role="tab"
        aria-selected={pathname === HOME_HREF}
        className={clsx(
          'flex-none text-[12px] font-semibold px-3 py-1.5 border-b-2 -mb-px transition-colors whitespace-nowrap',
          pathname === HOME_HREF
            ? 'text-brand border-brand'
            : 'text-ink-faint border-transparent hover:text-ink hover:border-border'
        )}
      >
        Control Tower
      </Link>

      {workspaceTabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          // A <button> can't nest inside the <Link>'s <a> (invalid HTML,
          // and a real click-bubbling hazard) — the label and the close
          // control are siblings instead, same pattern as the Decision
          // Center's local triage row (TriageRowActions.tsx's TriageRow).
          <div
            key={tab.href}
            className={clsx(
              'group flex-none flex items-center gap-1 max-w-[200px] border-b-2 -mb-px transition-colors',
              active ? 'border-brand bg-surface-2' : 'border-transparent hover:bg-surface-2/60'
            )}
          >
            <Link
              href={tab.href}
              role="tab"
              aria-selected={active}
              title={tab.label}
              className={clsx(
                'min-w-0 text-[12px] font-medium pl-2.5 py-1.5 whitespace-nowrap truncate',
                active ? 'text-brand' : 'text-ink-muted hover:text-ink'
              )}
            >
              {tab.label}
            </Link>
            <button
              type="button"
              onClick={(e) => handleClose(e, tab.href)}
              aria-label={`Close ${tab.label} tab`}
              className="flex-none w-3.5 h-3.5 mr-2 rounded-sm flex items-center justify-center leading-none text-ink-faint opacity-0 group-hover:opacity-100 hover:text-critical hover:bg-critical-soft transition-colors focus:opacity-100"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
