import { requireOrgContext } from '@/lib/session';
import { loadAdminOnboardingPage } from '@/server/queries/pages/admin';
import { resolveStoredGovernance } from '@/lib/governance/config';
import { OnboardingJourneyWizard } from '@/components/onboarding/OnboardingJourneyWizard';

/**
 * Admin & Org Setup → Onboarding — the Visual Onboarding Journey Wizard's
 * route. Session-local by design: the wizard's progress lives in React
 * state on the client (src/types/onboarding.ts's `OnboardingWizardState`),
 * not a database row, so reloading this page always starts a fresh run —
 * exactly what a live walkthrough or a repeated sales demo wants, and a
 * deliberately smaller scope than building a persisted per-tenant
 * onboarding-progress model, which nothing here needed.
 *
 * Two of the five steps touch real tenant data (the current governance
 * template, the live roster, the engagement count); Base Data Ingestion
 * is a client-side-only schema preview — see OnboardingJourneyWizard's own
 * doc comment for the reasoning.
 */
export default async function AdminOnboardingPage() {
  const { organizationId } = await requireOrgContext();

  const { org, governanceRow, resources, projectCount } = await loadAdminOnboardingPage({ organizationId });

  const governance = resolveStoredGovernance(governanceRow);

  const roster = resources.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    roleName: r.role?.name ?? null,
    practiceName: r.practice?.name ?? null,
  }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-display font-bold">Onboarding Journey</h1>
        <p className="text-ink-muted text-sm mt-1 max-w-2xl">
          A guided walkthrough for setting up a new A2R Delivery OS workspace — provisioning, governance, base data,
          role mapping, and go-live, in one pipeline. Session-local: reloading this page starts a fresh run.
        </p>
      </div>

      <OnboardingJourneyWizard
        organization={{
          name: org.name,
          slug: org.slug,
          contractTier: org.contractTier,
          createdAt: org.createdAt.toISOString(),
        }}
        currentGovernanceTemplate={governance.template}
        roster={roster}
        projectCount={projectCount}
      />
    </div>
  );
}
