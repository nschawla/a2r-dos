/**
 * Shared "fresh tenant" seed — the starter roster a brand-new Organization
 * gets: governance policy defaults, the delivery-control display labels
 * (waterfall variants), and the default practice / rate-card roster. This
 * is the SaaS equivalent of the Phase 1/2 prototype's `defaultState()`.
 *
 * Extracted here so both self-service signup (src/server/actions/auth.ts)
 * and operator-driven provisioning (src/server/actions/ops.ts) seed a
 * tenant identically — "default templates" in the /ops Provision New
 * Tenant flow means exactly this function.
 */
import type { Prisma } from '@prisma/client';
import { DEFAULT_PRACTICES, DEFAULT_ROLES, CONTROL_DEFS } from '@/lib/constants';

/**
 * Seeds a freshly-created Organization with its starter roster. Runs inside
 * the caller's transaction — pass the `tx` client, not the global `db`.
 */
export async function seedOrganizationDefaults(tx: Prisma.TransactionClient, organizationId: string) {
  await tx.orgPolicy.create({ data: { organizationId } });

  await tx.controlLabel.createMany({
    data: CONTROL_DEFS.map((c) => ({
      organizationId,
      controlKey: c.id,
      label: c.labels.waterfall,
    })),
  });

  const practiceIdMap = new Map<string, string>();
  for (const p of DEFAULT_PRACTICES) {
    const created = await tx.practice.create({ data: { organizationId, name: p.name } });
    practiceIdMap.set(p.id, created.id);
  }

  await tx.deliveryRole.createMany({
    data: DEFAULT_ROLES.map((r) => ({
      organizationId,
      name: r.name,
      billRate: r.billRate,
      costRate: r.costRate,
      practiceId: practiceIdMap.get(r.practiceId) ?? null,
    })),
  });
}
