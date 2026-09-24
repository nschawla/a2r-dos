'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { RBAC_MATRIX, type RbacPersona } from '@/lib/governance/rbacMatrix';
import { useRbacPreview } from '@/lib/client/rbac-preview';
import { hasPermission, roleCanEverEditProjects, type PermissionAction, type DeliveryRole } from '@/lib/auth/rbac';
import {
  parseWorkspaceTabs,
  WORKSPACE_TABS_STORAGE_KEY,
  MAX_WORKSPACE_TABS,
  type WorkspaceTab,
} from '@/lib/client/workspace-tabs';

export type { WorkspaceTab };

export { RBAC_MATRIX };
export type { RbacPersona };

interface DashboardUIState {
  /** Opens the global ⌘K palette (mounted at the app root — see CommandK). */
  openCommandPalette: () => void;
  helpDrawerOpen: boolean;
  openHelpDrawer: () => void;
  closeHelpDrawer: () => void;
  /** WP8 — the in-app Support & Ticket Submission modal. A separate open
   * flag from helpDrawerOpen (rather than one "overlay" state) because
   * HelpDrawer's own "Contact Support" CTA opens this *on top of* itself
   * closing, and the Header's support trigger opens it with no help
   * drawer involved at all — two independent entry points into the same
   * modal, same pattern as commandPaletteOpen/helpDrawerOpen already are. */
  supportModalOpen: boolean;
  openSupportModal: () => void;
  closeSupportModal: () => void;
  /** The signed-in user's REAL, server-verified RBAC persona (derived from
   * their session DeliveryRole — see src/lib/governance/rbacMatrix.ts).
   * Never changes client-side; middleware.ts enforces routes against this
   * same value read straight from the session, not from any preview. */
  realRbacPersona: RbacPersona;
  /** The persona the Sidebar / ModuleNav currently render as — the preview
   * override when one is active, otherwise `realRbacPersona`. A preview is
   * a DISPLAY-ONLY convenience for demoing the matrix: it changes what
   * navigation renders, never what a route actually allows through. */
  rbacPersona: RbacPersona;
  rbacPreviewActive: boolean;
  setRbacPreview: (p: RbacPersona | null) => void;
  /** Tabbed Multi-Tasking Workspaces — session-scoped, sessionStorage-backed
   * record of what's been opened from the Control Tower / portfolio grid
   * this session (WorkspaceTabsBar.tsx renders the strip;
   * TrackedProjectLink.tsx calls openWorkspaceTab on click). See
   * src/lib/client/workspace-tabs.ts for the scope/limitations this is
   * deliberately built to. */
  workspaceTabs: WorkspaceTab[];
  openWorkspaceTab: (href: string, label: string) => void;
  closeWorkspaceTab: (href: string) => void;
}

const DashboardUIContext = createContext<DashboardUIState | null>(null);

export function DashboardUIProvider({
  children,
  realRbacPersona,
}: {
  children: ReactNode;
  realRbacPersona: RbacPersona;
}) {
  const [helpDrawerOpen, setHelpDrawerOpen] = useState(false);
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  // Shared with src/components/ops/RbacPersonaSwitcher.tsx (the Ops Console
  // has no DashboardUIProvider of its own) and PersonaPreviewBar.tsx (the
  // explicit tenant-shell banner) via the same localStorage key.
  const { rbacPreview, setRbacPreview } = useRbacPreview();

  // Tabbed Multi-Tasking Workspaces — restored from this browser's
  // sessionStorage a tick after first paint (hydration-safe: SSR and the
  // first client render both start with an empty strip, same guard pattern
  // as PersonaPreviewBar's `mounted` flag), then kept live in this one
  // Context value for the rest of the session.
  const [workspaceTabs, setWorkspaceTabs] = useState<WorkspaceTab[]>([]);
  useEffect(() => {
    try {
      setWorkspaceTabs(parseWorkspaceTabs(window.sessionStorage.getItem(WORKSPACE_TABS_STORAGE_KEY)));
    } catch {
      /* ignore — starts empty */
    }
  }, []);

  const openWorkspaceTab = useCallback(
    (href: string, label: string) => {
      setWorkspaceTabs((prev) => {
        const next = prev.some((t) => t.href === href)
          ? prev.map((t) => (t.href === href ? { href, label } : t)) // refresh label, keep position
          : [...prev, { href, label }].slice(-MAX_WORKSPACE_TABS);
        try {
          window.sessionStorage.setItem(WORKSPACE_TABS_STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* best-effort only */
        }
        return next;
      });
    },
    []
  );

  const closeWorkspaceTab = useCallback((href: string) => {
    setWorkspaceTabs((prev) => {
      const next = prev.filter((t) => t.href !== href);
      try {
        window.sessionStorage.setItem(WORKSPACE_TABS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* best-effort only */
      }
      return next;
    });
  }, []);

  // The ⌘K palette lives at the app root (CommandK) so it works on every
  // surface, not just the dashboard — this just pokes it open.
  const openCommandPalette = useCallback(() => {
    window.dispatchEvent(new CustomEvent('a2r:command-k'));
  }, []);
  const openHelpDrawer = useCallback(() => setHelpDrawerOpen(true), []);
  const closeHelpDrawer = useCallback(() => setHelpDrawerOpen(false), []);
  const openSupportModal = useCallback(() => setSupportModalOpen(true), []);
  const closeSupportModal = useCallback(() => setSupportModalOpen(false), []);

  // Escape closes the help drawer / support modal (the palette handles its own).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setHelpDrawerOpen(false);
        setSupportModalOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const value = useMemo<DashboardUIState>(
    () => ({
      openCommandPalette,
      helpDrawerOpen,
      openHelpDrawer,
      closeHelpDrawer,
      supportModalOpen,
      openSupportModal,
      closeSupportModal,
      realRbacPersona,
      rbacPersona: rbacPreview ?? realRbacPersona,
      rbacPreviewActive: rbacPreview !== null,
      setRbacPreview,
      workspaceTabs,
      openWorkspaceTab,
      closeWorkspaceTab,
    }),
    [
      helpDrawerOpen,
      supportModalOpen,
      openCommandPalette,
      openHelpDrawer,
      closeHelpDrawer,
      openSupportModal,
      closeSupportModal,
      realRbacPersona,
      rbacPreview,
      setRbacPreview,
      workspaceTabs,
      openWorkspaceTab,
      closeWorkspaceTab,
    ]
  );

  return <DashboardUIContext.Provider value={value}>{children}</DashboardUIContext.Provider>;
}

export function useDashboardUI(): DashboardUIState {
  const ctx = useContext(DashboardUIContext);
  if (!ctx) throw new Error('useDashboardUI must be used within a DashboardUIProvider');
  return ctx;
}

/**
 * Write-Gate Alignment — the one helper every per-project editor
 * (RaidBoard, ScheduleTracker, DealEditor, EacEditor, AuditChecklist,
 * ProjectHeader's Lock Baseline) calls to compute its `canEdit` flag.
 *
 * `serverCanEdit` is the real, server-computed authority for the signed-in
 * user on THIS project (`canEditProject`, via each page.tsx) — the actual
 * security boundary; every mutation re-checks it server-side regardless of
 * what this returns. `action` is the coarse `PermissionAction` this
 * editor's writes correspond to (see src/lib/auth/rbac.ts).
 *
 * The AND with `hasPermission(previewDeliveryRole(rbacPersona), action)` is
 * what makes an admin's Persona Preview apply consistently to write
 * affordances, not just nav visibility: previewing Guest, Delivery
 * Executive, or a read-only role — none of which ever hold project-edit
 * authority — strips every edit control even though the previewing
 * admin's own real `serverCanEdit` is true. When no preview is active,
 * `rbacPersona` is the viewer's own `realRbacPersona`, so this is a no-op
 * passthrough for every real signed-in user today.
 */
export function usePersonaGatedEdit(serverCanEdit: boolean, action: PermissionAction): boolean {
  const { rbacPersona } = useDashboardUI();
  return serverCanEdit && hasPermission(previewDeliveryRole(rbacPersona), action);
}

/**
 * The one real `DeliveryAccessRole` a persona's preview computes its
 * write-affordance gating against. 1:1 for every persona except the
 * merged `ENGAGEMENT_MANAGER` tier (4-Tier RBAC — both `PRACTICE_DIRECTOR`
 * and `VP_EXECUTIVE` resolve there): its `deliveryRoles[0]` is always
 * `PRACTICE_DIRECTOR`, so previewing this shared tier renders Practice
 * Director's real edit authority — a faithful preview for that half of
 * the merge, and a reasonable simplification for the VP_EXECUTIVE half
 * (still always read-only for real, server-side, regardless of any
 * client-side preview — this function only ever affects what a preview
 * *shows*, never a real session's actual authority). Consistent with the
 * banner's own "Display only" framing (PersonaPreviewBar.tsx).
 */
function previewDeliveryRole(persona: RbacPersona): DeliveryRole {
  // Non-null: every RBAC_MATRIX entry's deliveryRoles is a non-empty
  // literal array by construction (enforced by tests/rbac-matrix.test.ts).
  return RBAC_MATRIX[persona].deliveryRoles[0]!;
}

/**
 * Sibling to `usePersonaGatedEdit` for the one editor (Commercial Baseline
 * — DealEditor.tsx) whose real server-side gate is the coarse
 * `authorizeProjectEdit` (`canEditProject`) rather than a specific
 * `PermissionAction` — see `roleCanEverEditProjects`'s doc comment in
 * src/lib/auth/rbac.ts for why `project:editBaseline` would be the wrong
 * (over-restrictive relative to the real server behavior) check here.
 */
export function usePersonaGatedProjectEdit(serverCanEdit: boolean): boolean {
  const { rbacPersona } = useDashboardUI();
  return serverCanEdit && roleCanEverEditProjects(previewDeliveryRole(rbacPersona));
}
