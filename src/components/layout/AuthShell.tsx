import type { ReactNode } from 'react';
import { BrandMark } from '@/components/ui/brand-mark';

/**
 * Shared framing for the unauthenticated screens (sign in / create
 * organization) so both carry the same branded treatment: the A2R mark on
 * a slate-dark canvas with a single soft brand glow behind the card, a
 * consistent title/subtitle block, and the IP footer line.
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const year = new Date().getFullYear();
  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center bg-bg px-4 py-12 overflow-hidden">
      {/* one soft brand glow — the only brand color on the canvas */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 h-[420px] w-[720px] max-w-[120vw] rounded-full opacity-[0.16] blur-3xl"
        style={{ background: 'radial-gradient(closest-side, #19CBDA, #1575BF 45%, transparent 78%)' }}
      />

      <div className="relative w-full max-w-md flex flex-col">
        <div className="flex flex-col items-center text-center gap-3 mb-6">
          <BrandMark size="lg" />
          <div>
            <h1 className="font-display font-bold text-xl tracking-tight text-balance">{title}</h1>
            <p className="text-ink-muted text-[13px] mt-1.5 leading-snug">{subtitle}</p>
          </div>
        </div>

        <div className="card shadow-brand">{children}</div>

        <p className="text-ink-faint text-[11px] text-center mt-6">
          © {year} A2R Ventures LLC. All rights reserved.
        </p>
      </div>
    </main>
  );
}
