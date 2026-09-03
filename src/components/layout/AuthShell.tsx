import type { ReactNode } from 'react';
import { BrandMark } from '@/components/ui/brand-mark';

/**
 * Shared framing for the unauthenticated screens (sign in / create
 * organization): the integrated A2R mark on the light canvas, a consistent
 * title/subtitle block, one card, and the IP footer line.
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
    <main className="min-h-screen flex flex-col items-center justify-center bg-bg px-5 py-16">
      <div className="w-full max-w-md flex flex-col">
        <div className="flex flex-col items-center text-center gap-4 mb-8">
          <BrandMark size="lg" />
          <div>
            <h1 className="font-display font-bold text-[22px] tracking-tight text-balance">{title}</h1>
            <p className="text-ink-muted text-[13px] mt-2 leading-snug">{subtitle}</p>
          </div>
        </div>

        <div className="card">{children}</div>

        <p className="text-ink-faint text-[11px] text-center mt-8">
          © {year} A2R Ventures LLC. All rights reserved.
        </p>
      </div>
    </main>
  );
}
