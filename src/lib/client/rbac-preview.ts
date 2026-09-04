'use client';

/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Standalone, localStorage-backed RBAC persona preview state — the single
 * implementation shared by:
 *   - src/components/layout/dashboard-ui-context.tsx (the tenant shell,
 *     where the preview overrides src/components/layout/Sidebar.tsx and
 *     ProjectHeader's ModuleNav for whoever is signed in), and
 *   - src/components/ops/RbacPersonaSwitcher.tsx (the A2R Ops Console,
 *     where an operator sets a preview ahead of a tenant demo).
 *
 * Deliberately NOT tied to DashboardUIContext — the (admin) Ops Console
 * route group mounts no such provider (it has no tenant context at all),
 * so this hook is the thing both shells can call independently. Both read
 * and write the SAME localStorage key, so a preview set from the Ops
 * Console is already active the next time a tenant shell mounts (e.g.
 * after "← Client Workspace" or an impersonation hand-off) — it does not
 * live-sync into an already-open tenant tab, the same one-way persistence
 * contract every other localStorage-backed preference in this app has.
 *
 * This is display-only state, same disclaimer everywhere it's read:
 * middleware.ts and every scoped query enforce the signed-in user's REAL
 * session DeliveryRole and never look at this value.
 */
import { useCallback, useEffect, useState } from 'react';
import { isRbacPersona, type RbacPersona } from '@/lib/governance/rbacMatrix';

export const RBAC_PREVIEW_STORAGE_KEY = 'a2r_rbac_preview';

export function useRbacPreview() {
  const [rbacPreview, setRbacPreviewState] = useState<RbacPersona | null>(null);

  // Restore a preview choice from a prior visit in this browser (set here,
  // or from the other shell) — silent fallback, same contract as every
  // other localStorage read in this app.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(RBAC_PREVIEW_STORAGE_KEY);
      if (isRbacPersona(stored)) setRbacPreviewState(stored);
    } catch {
      // ignore
    }
  }, []);

  const setRbacPreview = useCallback((p: RbacPersona | null) => {
    setRbacPreviewState(p);
    try {
      if (p) window.localStorage.setItem(RBAC_PREVIEW_STORAGE_KEY, p);
      else window.localStorage.removeItem(RBAC_PREVIEW_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  return { rbacPreview, setRbacPreview } as const;
}
