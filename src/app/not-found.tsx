/**
 * UX-3 (GA-readiness audit) — root not-found page.
 *
 * Catches URLs that match no route at all. This renders inside the root
 * layout only (no session, so no sidebar/header), so it's a self-contained
 * branded shell rather than the full app chrome — with a clear route back
 * into the product.
 */
import Link from 'next/link';

export default function RootNotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md card text-center">
        <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-2">
          404 — Page not found
        </div>
        <h1 className="text-xl font-display font-bold mb-1">A2R Delivery OS</h1>
        <p className="text-ink-muted text-sm mb-6">
          This address doesn&rsquo;t match anything in the workspace. It may have changed, or the link may be
          incomplete.
        </p>
        <Link href="/" className="btn-primary !w-auto px-5 inline-block text-sm">
          Go to the Control Tower
        </Link>
      </div>
    </main>
  );
}
