/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Public marketing landing page, served at `/` (the middleware auth gate
 * excludes the bare root — see src/middleware.ts). Uses the lightweight
 * public shell in (public)/layout.tsx, NOT the authenticated dashboard
 * chrome, so it renders for a visitor with no account.
 *
 * A signed-in visitor is forwarded straight into the app via /launch
 * (the role-aware landing dispatcher) rather than being shown marketing.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const metadata = {
  title: 'A2R Delivery OS™ — Deliver Projects with Absolute Clarity',
  description:
    'The intelligent operating system for professional-services delivery: track engagements, keep RAID logs current, and automate status reporting from one governed workspace.',
};

const PAIN_POINTS = [
  {
    title: 'Scattered spreadsheets',
    body: 'Scope, effort, actuals, forecasts and the rate card live in a dozen files across a dozen drives. Nobody trusts the numbers, and reconciling them is a weekly chore.',
  },
  {
    title: 'Invisible project risks',
    body: 'Risks and issues surface in meeting notes and inboxes, not a register. By the time a slip is visible in the margin, the window to act on it has closed.',
  },
  {
    title: 'Status-report fatigue',
    body: 'Every PM rewrites the same narrative every week, in a different format, and the PMO spends Friday copy-pasting it into a portfolio deck instead of reading it.',
  },
];

const SOLUTIONS = [
  {
    title: 'AI-powered document parsing',
    body: 'Paste a weekly status email or a set of meeting notes. A2R DOS extracts the narrative and every RAID item into structured rows, ready to review and commit — no re-keying, no format policing.',
  },
  {
    title: 'Real-time engagement visibility',
    body: 'The Portfolio Control Tower rolls up margin, schedule health, risk exposure and utilization across every engagement — automatically scoped to the person viewing it, from a Project Manager to a VP.',
  },
  {
    title: 'Centralized, governed workflows',
    body: 'Commercial baselining, financial realization, resourcing, schedule governance and the RAID cockpit run in one workspace — every material change written to a tamper-evident compliance ledger.',
  },
];

export default async function LandingPage() {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect('/launch');

  return (
    <div className="flex flex-col">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="px-6 pt-20 pb-24 sm:pt-28 sm:pb-32">
        <div className="mx-auto max-w-3xl text-center flex flex-col items-center gap-6">
          <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand">
            The Delivery Operating System
          </span>
          <h1 className="font-display font-extrabold text-ink text-[34px] leading-[1.12] sm:text-[52px] sm:leading-[1.08] text-balance">
            Deliver Projects with Absolute Clarity. Zero Chaos.
          </h1>
          <p className="text-ink-muted text-[16px] sm:text-[18px] leading-relaxed max-w-2xl">
            A2R DOS is the intelligent operating system for professional-services delivery — track every
            engagement, keep your RAID logs current, and turn a pasted status email into a structured report,
            all from one governed workspace.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link href="/launch" className="btn-primary !w-auto px-7 py-3 text-sm">
              Launch App
            </Link>
            <Link href="/login" className="btn-secondary !w-auto px-7 py-3 text-sm">
              Sign in
            </Link>
          </div>
          <p className="text-[12.5px] text-ink-faint pt-1">
            Multi-tenant · SSO / SAML / OIDC · SOC&nbsp;2-aligned compliance ledger
          </p>
        </div>
      </section>

      {/* ── Pain points ──────────────────────────────────────────────── */}
      <section className="bg-surface-1 border-y border-border px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="max-w-2xl mb-12">
            <h2 className="font-display font-bold text-ink text-[26px] sm:text-[30px] text-balance">
              Delivery leaders are flying blind on their own portfolio
            </h2>
            <p className="text-ink-muted text-[15px] mt-3">
              The tools most PS organizations run on actively hide the things that matter most.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {PAIN_POINTS.map((p) => (
              <div key={p.title} className="flex flex-col gap-2.5">
                <div className="h-9 w-9 rounded-md bg-critical-soft flex items-center justify-center">
                  <span className="h-2 w-2 rounded-full bg-critical" />
                </div>
                <h3 className="font-display font-bold text-ink text-[16px]">{p.title}</h3>
                <p className="text-ink-muted text-[13.5px] leading-relaxed">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Solution ─────────────────────────────────────────────────── */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="max-w-2xl mb-12">
            <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand">
              What A2R DOS does
            </span>
            <h2 className="font-display font-bold text-ink text-[26px] sm:text-[30px] mt-2 text-balance">
              One system of record for the whole delivery portfolio
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {SOLUTIONS.map((s, i) => (
              <div key={s.title} className="card flex flex-col gap-3">
                <span className="font-mono text-[12px] text-brand font-semibold">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="font-display font-bold text-ink text-[16.5px]">{s.title}</h3>
                <p className="text-ink-muted text-[13.5px] leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Closing CTA ──────────────────────────────────────────────── */}
      <section className="bg-surface-1 border-t border-border px-6 py-20">
        <div className="mx-auto max-w-3xl text-center flex flex-col items-center gap-5">
          <h2 className="font-display font-bold text-ink text-[24px] sm:text-[28px] text-balance">
            See your portfolio the way it actually is.
          </h2>
          <p className="text-ink-muted text-[15px] max-w-xl">
            Sign in to your organization&rsquo;s workspace, or launch the app to pick up where your team left
            off.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/launch" className="btn-primary !w-auto px-7 py-3 text-sm">
              Launch App
            </Link>
            <Link href="/login" className="btn-secondary !w-auto px-7 py-3 text-sm">
              Sign in
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
