/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 * Proprietary and confidential. Licensed, not sold, under the A2R Delivery
 * OS Terms of Service & EULA (/terms).
 */

/**
 * WP8 — the unauthenticated public shell: currently just /terms and
 * /privacy (see middleware.ts's matcher exclusion for both). Deliberately
 * a separate, lighter frame from src/app/(dashboard)/layout.tsx — no
 * Sidebar/Header/RBAC-scoped data fetch, since a page here must render for
 * a visitor who isn't signed in at all, which requireOrgContext() would
 * otherwise redirect away from. Shares only the same Footer.tsx the
 * dashboard shell uses, so the copyright/legal-links line never drifts
 * between the two.
 */
import Link from 'next/link';
import { Footer } from '@/components/layout/Footer';
import { BrandMark } from '@/components/ui/brand-mark';
import { Container } from '@/components/ui/container';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandMark size="md" />
          <span className="font-display font-bold text-[15px]">
            A2R Delivery OS<span className="text-ink-faint text-[10px] align-top ml-0.5">™</span>
          </span>
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/terms" className="text-ink-muted hover:text-ink transition-colors">
            Terms
          </Link>
          <Link href="/privacy" className="text-ink-muted hover:text-ink transition-colors">
            Privacy
          </Link>
          <Link href="/login" className="btn-secondary !w-auto px-4 !py-1.5">
            Sign in
          </Link>
        </nav>
      </header>
      <main className="flex-1">
        <Container size="prose">{children}</Container>
      </main>
      <Footer />
    </div>
  );
}
