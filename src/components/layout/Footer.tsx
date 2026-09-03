/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 * Proprietary and confidential. Licensed, not sold, under the A2R Delivery
 * OS Terms of Service & EULA (/terms) — see that document for the full
 * customer-data vs. A2R-IP ownership split and reverse-engineering
 * restrictions this software is licensed under.
 */

/**
 * WP8 — the app-wide copyright/IP footer. A plain server component (no
 * interactivity needed) so it can be reused unmodified in both the
 * authenticated dashboard shell (src/app/(dashboard)/layout.tsx) and the
 * public marketing shell (src/app/(public)/layout.tsx) — the two places
 * this app renders a page frame at all. Deliberately does NOT surface a
 * "Contact Support" action itself: the spec routes support access through
 * HelpDrawer.tsx and the Header's own support trigger, both of which
 * depend on DashboardUIProvider client context that a public, logged-out
 * page never has.
 */
import Link from 'next/link';

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border px-6 py-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 text-[11.5px] text-ink-faint">
      <span>
        A2R Delivery OS™ &middot; &copy; {year} A2R Ventures LLC. All rights reserved.
      </span>
      <nav className="flex items-center gap-4">
        <Link href="/terms" className="hover:text-ink-muted transition-colors">
          Terms of Service
        </Link>
        <Link href="/privacy" className="hover:text-ink-muted transition-colors">
          Privacy Policy
        </Link>
      </nav>
    </footer>
  );
}
