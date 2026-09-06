import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireOrgContext } from '@/lib/session';
import { LENS_COOKIE, resolveLens, landingFor } from '@/lib/workspace/lenses';

export const dynamic = 'force-dynamic';

/**
 * Post-sign-in landing dispatcher. Resolves the user's Workspace Lens (their
 * stored choice if still valid, otherwise the role default) and forwards to
 * that lens's tailored landing page. Every module stays reachable from the
 * sidebar and ⌘K — this only decides the *default* drop point.
 *
 * Kept outside the (dashboard) route group so it renders no chrome before
 * the redirect. `requireOrgContext` handles the unauthenticated / no-tenant
 * cases (→ /login, /onboarding, or /ops).
 */
export default async function LaunchPage() {
  const { session, deliveryRole, governance } = await requireOrgContext();
  const isA2rStaff = session.user.isA2rStaff === true;
  const stored = (await cookies()).get(LENS_COOKIE)?.value ?? null;

  redirect(
    landingFor(
      resolveLens(stored, {
        deliveryRole,
        isA2rStaff,
        maskFinancialsForDelivery: governance.maskFinancialsForDelivery,
      })
    )
  );
}
