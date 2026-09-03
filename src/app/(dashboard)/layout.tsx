import Link from 'next/link';
import { cookies } from 'next/headers';
import { requireOrgContext } from '@/lib/session';
import { LENS_COOKIE, availableLenses, resolveLens } from '@/lib/workspace/lenses';
import { hiddenHrefs } from '@/lib/governance/config';
import { getNotificationSummary } from '@/server/queries/notifications';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { Footer } from '@/components/layout/Footer';
import { HelpDrawer } from '@/components/layout/HelpDrawer';
import { SupportTicketModal } from '@/components/support/SupportTicketModal';
import { DashboardUIProvider } from '@/components/layout/dashboard-ui-context';
import { defaultPersonaForRole } from '@/components/layout/personas';
import { ImpersonationBanner } from '@/components/layout/ImpersonationBanner';
import { GraceperiodBanner } from '@/components/layout/GraceperiodBanner';
import { Container } from '@/components/ui/container';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { session, organizationId, organizationName, role, deliveryRole, governance, memberships, impersonation } =
    await requireOrgContext();
  const isA2rStaff = session.user.isA2rStaff === true;

  const lensCtx = { deliveryRole, isA2rStaff, maskFinancialsForDelivery: governance.maskFinancialsForDelivery };
  const lenses = availableLenses(lensCtx);
  const currentLens = resolveLens(cookies().get(LENS_COOKIE)?.value ?? null, lensCtx);

  // A2R Operator Control Plane — a SUSPENDED tenant retains all its data but
  // its members cannot use the workspace until an operator reactivates it.
  // A2R staff are never locked out (they may be diagnosing the suspension).
  const activeStatus = memberships.find((m) => m.organizationId === organizationId)?.organizationStatus;
  if (activeStatus === 'SUSPENDED' && !isA2rStaff && !impersonation) {
    return <SuspendedWorkspace organizationName={organizationName} />;
  }
  const graceReadOnly = activeStatus === 'GRACE_PERIOD' && !isA2rStaff;

  const notifications = await getNotificationSummary(organizationId);

  return (
    <DashboardUIProvider defaultPersona={defaultPersonaForRole(role)}>
      {impersonation && (
        <ImpersonationBanner organizationName={organizationName} expiresAt={impersonation.expiresAt} />
      )}
      {graceReadOnly && <GraceperiodBanner organizationName={organizationName} />}
      <div className="flex min-h-screen">
        <Sidebar hiddenHrefs={hiddenHrefs(governance)} />
        <div className="flex-1 min-w-0 flex flex-col">
          <Header
            userName={session.user.name ?? session.user.email ?? 'You'}
            role={role}
            organizationName={organizationName}
            memberships={memberships}
            notifications={notifications}
            isA2rStaff={isA2rStaff}
            currentLens={currentLens}
            availableLenses={lenses}
          />
          <main className="flex-1 w-full">
            <Container>{children}</Container>
          </main>
          <Footer />
        </div>
      </div>
      <HelpDrawer />
      <SupportTicketModal
        userName={session.user.name ?? session.user.email ?? 'You'}
        userEmail={session.user.email ?? null}
        organizationId={organizationId}
        organizationName={organizationName}
      />
    </DashboardUIProvider>
  );
}

function SuspendedWorkspace({ organizationName }: { organizationName: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="card max-w-md text-center">
        <div className="text-[11px] uppercase tracking-wide text-warning font-semibold mb-2">Workspace suspended</div>
        <h1 className="text-xl font-display font-bold mb-2">{organizationName} is currently suspended</h1>
        <p className="text-sm text-ink-muted">
          Access to this workspace is paused. Your data is retained. Please contact your A2R account team to
          reactivate the organization.
        </p>
        <div className="mt-4">
          <Link href="/login" className="btn-secondary !w-auto px-5 text-xs inline-block">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
