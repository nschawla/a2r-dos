import Link from 'next/link';
import { requireOrgContext } from '@/lib/session';
import { hiddenHrefs } from '@/lib/governance/config';
import { personaForDeliveryRole, RBAC_MATRIX } from '@/lib/governance/rbacMatrix';
import { getNotificationSummary } from '@/server/queries/notifications';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { WorkspaceTabsBar } from '@/components/layout/WorkspaceTabsBar';
import { Footer } from '@/components/layout/Footer';
import { HelpDrawer } from '@/components/layout/HelpDrawer';
import { SupportTicketModal } from '@/components/support/SupportTicketModal';
import { DashboardUIProvider } from '@/components/layout/dashboard-ui-context';
import { PersonaPreviewBar } from '@/components/layout/PersonaPreviewBar';
import { ImpersonationBanner } from '@/components/layout/ImpersonationBanner';
import { GraceperiodBanner } from '@/components/layout/GraceperiodBanner';
import { Container } from '@/components/ui/container';
import { ExecutiveAgentWidget } from '@/components/assistant/ExecutiveAgentWidget';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { session, organizationId, organizationName, role, deliveryRole, governance, memberships, impersonation } =
    await requireOrgContext();
  const isA2rStaff = session.user.isA2rStaff === true;

  const realRbacPersona = personaForDeliveryRole(deliveryRole);
  // Who may see and use the Persona Preview banner: A2R staff only (an
  // active StaffGrant — any OperatorRole, since this is a demo/QA tool for
  // internal personnel, not a role-tiered feature). Previously also
  // included a tenant ADMIN, on the reasoning that full delivery authority
  // already makes previewing a narrower role harmless — but that meant
  // every real client's own Client Admin (rajan@client.com,
  // pankaj@client.com, and any customer's actual tenant admin) saw a
  // developer/testing control with no purpose in their own production
  // workspace. Every non-staff signed-in user is locked into their own
  // real navigation with no switcher rendered at all — not hidden-but-
  // reachable, not disabled-but-visible: PersonaPreviewBar returns null
  // outright when this is false.
  const personaPreviewEligible = isA2rStaff;

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
    <DashboardUIProvider realRbacPersona={realRbacPersona}>
      {impersonation && (
        <ImpersonationBanner organizationName={organizationName} expiresAt={impersonation.expiresAt} />
      )}
      {graceReadOnly && <GraceperiodBanner organizationName={organizationName} />}
      <PersonaPreviewBar eligible={personaPreviewEligible} />
      <div className="flex min-h-screen">
        <Sidebar hiddenHrefs={hiddenHrefs(governance)} isA2rStaff={isA2rStaff} />
        <div className="flex-1 min-w-0 flex flex-col">
          <Header
            userName={session.user.name ?? session.user.email ?? 'You'}
            role={role}
            organizationName={organizationName}
            memberships={memberships}
            notifications={notifications}
            operatorRole={session.user.operatorRole ?? null}
          />
          <WorkspaceTabsBar />
          <main className="flex-1 w-full">
            <Container size="full">{children}</Container>
          </main>
          <Footer />
        </div>
      </div>
      <HelpDrawer />
      <ExecutiveAgentWidget personaLabel={RBAC_MATRIX[realRbacPersona].label} />
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
