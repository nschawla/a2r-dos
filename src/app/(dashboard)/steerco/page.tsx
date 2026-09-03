import { requireOrgContext } from '@/lib/session';
import { getSteerCoBriefing } from '@/server/queries/steerco-briefing';
import { canViewMargins } from '@/lib/security/masking';
import { SteerCoBriefingView } from '@/components/reports/SteerCoBriefingView';

/**
 * SteerCo Briefing — a lean, print-ready board view of the whole portfolio:
 * Pulse vitals, margin health, what moved since the last review, and the
 * escalated-risk watchlist. Org-scoped; every figure comes from the same
 * live engines the Executive Briefing Hub and the module pages use.
 */
export default async function SteerCoBriefingPage() {
  const { organizationId, organizationName, deliveryRole } = await requireOrgContext();

  const briefing = await getSteerCoBriefing(organizationId, organizationName, {
    showFinancials: canViewMargins(deliveryRole),
  });

  return <SteerCoBriefingView briefing={briefing} />;
}
