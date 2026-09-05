/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 * Proprietary and confidential. Licensed, not sold, under the A2R Delivery
 * OS Terms of Service & EULA (/terms).
 */

/**
 * WP8 — the unauthenticated public shell for the legal pages: /terms and
 * /privacy (both excluded from the middleware auth gate). Deliberately a
 * separate, lighter frame from src/app/(dashboard)/layout.tsx — no
 * Sidebar/Header/RBAC-scoped data fetch, since a page here must render
 * for a visitor who isn't signed in at all, which requireOrgContext()
 * would otherwise redirect away from. Shares Footer.tsx with the
 * dashboard shell so the copyright/legal-links line never drifts.
 *
 * The site root `/` (the "Coming Soon" landing page) is NOT in this group
 * — it commits to its own dark theme and self-contained header, and
 * lives at src/app/page.tsx under the root layout only.
 *
 * /terms and /privacy each wrap their own `<Container size="prose">` for
 * reading width, so this shell imposes none.
 */
import Link from 'next/link';
import { Footer } from '@/components/layout/Footer';
import { BrandMark } from '@/components/ui/brand-mark';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <header className="border-b border-border bg-surface-1/80 backdrop-blur-sm sticky top-0 z-40 px-6 py-3.5 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandMark size="md" />
          <span className="font-display font-bold text-[15px] text-ink">
            A2R Delivery OS<span className="text-ink-faint text-[10px] align-top ml-0.5">™</span>
          </span>
        </Link>
        <nav className="flex items-center gap-2 sm:gap-5 text-sm">
          <Link href="/terms" className="hidden sm:inline text-ink-muted hover:text-ink transition-colors">
            Terms
          </Link>
          <Link href="/privacy" className="hidden sm:inline text-ink-muted hover:text-ink transition-colors">
            Privacy
          </Link>
          <Link href="/login" className="btn-secondary !w-auto px-4 !py-1.5">
            Sign in
          </Link>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
