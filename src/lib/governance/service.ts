/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Server-only loader for a tenant's resolved Governance Configuration
 * (see ./config.ts for the pure model). Wrapped in React `cache()` so the
 * layout + page + any nested reads in one request share a single query.
 */
import { cache } from 'react';
import { db } from '@/lib/db';
import { resolveStoredGovernance, type ResolvedGovernanceConfig } from './config';

export const getGovernanceConfig = cache(
  async (organizationId: string): Promise<ResolvedGovernanceConfig> => {
    const row = await db.governanceConfig.findUnique({ where: { organizationId } });
    return resolveStoredGovernance(row);
  }
);
