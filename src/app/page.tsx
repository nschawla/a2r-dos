/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * The site root `/`. In the default ("coming-soon") mode it serves the
 * public dark early-access page. A deploy that wants the full app as its
 * front door instead — e.g. an internal preview deployment — sets
 * `NEXT_PUBLIC_COMING_SOON` to a falsy string (`0` / `false` / `off` /
 * `no`), and `/` then forwards every visitor to `/launch`.
 *
 * Same codebase either way: coming-soon mode ON is production's front
 * door; OFF is the preview branch's. See `.env.example`.
 *
 * Top-level (uses only src/app/layout.tsx — html/body/providers, no app
 * chrome) rather than the (public) group, because it commits to its own
 * dark theme and self-contained header; /terms and /privacy keep the
 * light (public) shell. The middleware auth gate already excludes the
 * bare root (the `|$` in its matcher).
 *
 * A signed-in visitor is always sent straight into the app via /launch.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { BrandMark } from '@/components/ui/brand-mark';
import { SneakPeekModal } from '@/components/marketing/SneakPeekModal';
import { EarlyAccessForm } from '@/components/marketing/EarlyAccessForm';

export const metadata = {
  title: 'A2R Delivery OS™ — Coming Soon',
  description:
    'A2R Delivery OS is the delivery operating system for professional-services organizations. Request early access.',
};

/** Coming-soon mode is ON by default (the product is pre-launch, and a
 * missing env var must not accidentally expose the app's front door).
 * A deploy opts OUT with NEXT_PUBLIC_COMING_SOON = 0 / false / off / no. */
function comingSoonEnabled(): boolean {
  const v = (process.env.NEXT_PUBLIC_COMING_SOON ?? '').trim().toLowerCase();
  return !['0', 'false', 'off', 'no'].includes(v);
}

const VALUE_PROPS = [
  ['Real-time engagement visibility', 'Margin, schedule, risk and utilization across the portfolio — in one view.'],
  ['AI-automated status reporting', 'Paste a status email; get a structured report and RAID rows back.'],
  ['One governed workspace', 'Baselining, financials, resourcing, RAID and a tamper-evident audit trail.'],
] as const;

export default async function ComingSoonPage() {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect('/launch');

  // Preview mode: no coming-soon wall — send anonymous visitors straight
  // to the app's sign-in / landing dispatcher.
  if (!comingSoonEnabled()) redirect('/launch');

  return (
    <div className="flex min-h-screen flex-col bg-[#080B14] text-white [color-scheme:dark]">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#080B14]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <BrandMark size="md" className="!text-white" />
            <span className="whitespace-nowrap font-display text-[14px] font-bold text-white sm:text-[15px]">
              A2R Delivery OS<span className="align-top text-[10px] text-white/50">™</span>
            </span>
          </div>
          <nav className="flex items-center gap-2.5 sm:gap-3">
            <SneakPeekModal />
            <Link
              href="/login"
              className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] font-semibold text-[#AEB7CC] transition-colors hover:text-white sm:px-3.5"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <main className="flex-1">
        <section className="mx-auto grid max-w-6xl gap-14 px-6 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-28">
          <div className="flex flex-col">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#2A3A5C] bg-white/[0.03] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6BA5FF]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#4C8DFF]" />
              Coming soon · Early access
            </span>

            <h1 className="mt-6 font-display text-[38px] font-extrabold leading-[1.1] text-white text-balance sm:text-[54px] sm:leading-[1.06]">
              Deliver Projects with Absolute Clarity. Zero Chaos.
            </h1>

            <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-[#AEB7CC] sm:text-[17px]">
              A2R DOS is the delivery operating system for professional-services organizations — track
              every engagement, keep your RAID logs current, and automate status reporting from one
              governed workspace. We&rsquo;re onboarding early-access organizations now.
            </p>

            <ul className="mt-8 flex flex-col gap-3.5 border-t border-white/[0.08] pt-7">
              {VALUE_PROPS.map(([title, body]) => (
                <li key={title} className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-none rotate-45 bg-[#4C8DFF]" />
                  <span className="text-[13.5px] leading-relaxed text-[#95A0BB]">
                    <span className="font-semibold text-white">{title}.</span> {body}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:pt-2">
            <EarlyAccessForm />
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.08]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-1.5 px-6 py-5 text-[11.5px] text-[#5A6683]">
          <span>A2R Delivery OS™ · © {new Date().getFullYear()} A2R Ventures LLC. All rights reserved.</span>
          <nav className="flex items-center gap-4">
            <Link href="/terms" className="transition-colors hover:text-[#AEB7CC]">
              Terms of Service
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-[#AEB7CC]">
              Privacy Policy
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
