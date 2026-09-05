import type { Metadata } from 'next';
import Link from 'next/link';
import { requireOpsContext } from '@/lib/ops-auth';
import { OpsNav } from '@/components/ops/OpsNav';
import { BrandMark } from '@/components/ui/brand-mark';
import { OpsVersionPanel } from '@/components/ops/OpsVersionPanel';
import { RbacPersonaSwitcher } from '@/components/ops/RbacPersonaSwitcher';
import { AutoDemoLaunchModal } from '@/components/demo/AutoDemoLaunchModal';
import { Container } from '@/components/ui/container';

export const metadata: Metadata = {
  title: 'A2R Ops Console',
};

/**
 * A2R Operator Control Plane shell. Deliberately a separate route group
 * from (dashboard): no tenant context, its own chrome, and a hard staff
 * gate (requireOpsContext) at the top of every render.
 */
export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const ops = await requireOpsContext();

  return (
    <div className="flex min-h-screen">
      <aside className="flex-none w-[248px] bg-surface-1 border-r border-border flex flex-col sticky top-0 h-screen overflow-y-auto">
        <div className="flex items-center gap-3 px-4 py-[18px] border-b border-border">
          <BrandMark size="md" />
          <div className="min-w-0">
            <div className="font-display font-bold text-[14.5px] leading-tight text-ink">Ops Console</div>
            <div className="text-[10px] text-ink-faint uppercase tracking-wide">Operator Control Plane</div>
          </div>
        </div>

        <div className="px-2.5 py-2.5 flex-1">
          <OpsNav />
        </div>

        <div className="border-t border-border px-2.5 py-2.5">
          <Link
            href="/launch"
            className="block rounded-sm px-3 py-2.5 text-[13px] font-semibold text-ink-muted hover:bg-surface-2 hover:text-ink transition-colors"
          >
            ← Client Workspace
          </Link>
          <div className="px-3 pt-2 text-[10px] text-ink-faint truncate">{ops.email}</div>
          <OpsVersionPanel />
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header id="global-header" className="sticky top-0 z-40 bg-bg/90 backdrop-blur-md border-b border-border px-7 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Left, beside the shell's own identity text — the closest
                analog this header has to "next to the logo" (the actual
                BrandMark for this shell lives in the sidebar above). */}
            <AutoDemoLaunchModal />
            <span className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">
              A2R Ventures · Internal
            </span>
          </div>
          <div className="flex items-center gap-3">
            <RbacPersonaSwitcher />
            <span className="text-xs text-ink-faint">Signed in as {ops.name}</span>
          </div>
        </header>
        <main className="flex-1 w-full">
          <Container>{children}</Container>
        </main>
      </div>
    </div>
  );
}
