'use client';

/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Tabbed Multi-Tasking Workspaces — wraps an ordinary Next.js `<Link>` so
 * clicking into a project's detail view from the Control Tower / portfolio
 * grid also registers a workspace tab (WorkspaceTabsBar.tsx). Navigation
 * itself is untouched (no preventDefault) — a plain click, a middle-click,
 * cmd/ctrl-click for a new tab, and "Open in new tab" from the context menu
 * all still work exactly as a normal link would; opening the tab strip
 * entry is a side effect on top, not a replacement for real navigation.
 *
 * A separate client component rather than making the whole row-building
 * code in portfolio/page.tsx a Client Component, since that file does real
 * server-side data fetching (its own Server Component tree) and only this
 * one small piece needs an event handler.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useDashboardUI } from '@/components/layout/dashboard-ui-context';

export function TrackedProjectLink({
  href,
  label,
  className,
  children,
}: {
  href: string;
  /** The tab's pill text — the project's own name, so the strip reads like
   * a real list of open work, not a row of opaque ids. */
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const { openWorkspaceTab } = useDashboardUI();
  return (
    <Link href={href} className={className} onClick={() => openWorkspaceTab(href, label)}>
      {children}
    </Link>
  );
}
