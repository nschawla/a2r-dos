'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Forces the window to the top of the document on every sidebar / route
 * navigation.
 *
 * Root cause: `(dashboard)/layout.tsx` is a genuine Next.js App Router
 * layout (correctly — it must persist the sidebar/header across pages, not
 * remount them), and the dashboard route group has its own `loading.tsx`
 * skeleton. Next's built-in scroll-to-top fires once when that skeleton
 * (or the final content) first commits — but the skeleton is short and
 * generic, nowhere near as tall as a scrolled-deep page like the Resource
 * Cockpit or a long Executive Briefing. When the *real* page content then
 * streams in and replaces the skeleton, nothing re-triggers a scroll
 * reset: the browser simply leaves the scrollbar wherever it already was,
 * so a page opened from partway down a previous page's scroll renders
 * already scrolled, not at the top. Reported 2026-10-04.
 *
 * Fixed with an explicit reset keyed on the pathname, mounted once in the
 * shared dashboard layout rather than per-page — every sidebar/module
 * navigation goes through this same layout, so one mount covers all of
 * them. `instant`, not `smooth`: a new page should read as a new page
 * immediately, not animate down from wherever the old scroll position was.
 */
export function ScrollToTop() {
  const pathname = usePathname();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  return null;
}
