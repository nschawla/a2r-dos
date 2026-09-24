/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Types + validation for the Tabbed Multi-Tasking Workspace strip
 * (WorkspaceTabsBar.tsx). The actual reactive state lives on
 * DashboardUIContext (dashboard-ui-context.tsx) — not a standalone hook —
 * because, unlike the RBAC preview (src/lib/client/rbac-preview.ts), tabs
 * are only ever opened/read from inside the one tenant dashboard shell that
 * already mounts that provider; there's no second shell (e.g. the Ops
 * Console) that needs its own independent read/write path to the same
 * storage key. A shared Context is also the only way two different
 * component instances (a project row's link, and the tab strip itself)
 * observe the *same* live list — two separate hook instances each reading
 * sessionStorage once on mount would silently drift out of sync the moment
 * one of them wrote a change the other never re-read.
 *
 * Scope, stated plainly: this is a navigational convenience layer on top of
 * Next.js's normal routing, not a true multi-instance "kept alive in
 * memory" workspace — clicking between tabs is still a real route
 * transition (each module page fetches its own data fresh), so it does not
 * literally avoid a re-fetch the way an in-memory MDI shell would. What it
 * DOES deliver: a persistent record of what you've opened this session, one
 * click to jump back to any of them, and the Control Tower itself is never
 * one of the tabs — it's the pinned home base, so returning to it never
 * loses whatever state that page's own filters (health pills, the NL
 * search bar) already hold in their own component state.
 */

export interface WorkspaceTab {
  /** The route to navigate to — doubles as this tab's unique key. */
  href: string;
  /** Human-readable label shown on the pill, e.g. a project's name. */
  label: string;
}

/** sessionStorage, not localStorage — deliberately: "what I have open right
 * now" should reset with a fresh browser session, the same "clears with the
 * tab/session" contract this app already uses for the Decision Center's
 * row-snooze feature (TriageRowActions.tsx), rather than accumulating
 * indefinitely across days like the RBAC preview does. */
export const WORKSPACE_TABS_STORAGE_KEY = 'a2r_workspace_tabs';

/** Caps the strip so a long session of clicking around can't grow it
 * without bound — oldest tab drops off the front once the cap is hit. */
export const MAX_WORKSPACE_TABS = 8;

function isWorkspaceTab(v: unknown): v is WorkspaceTab {
  return (
    v !== null &&
    typeof v === 'object' &&
    typeof (v as WorkspaceTab).href === 'string' &&
    typeof (v as WorkspaceTab).label === 'string'
  );
}

/** Parses a sessionStorage read back into a valid tab list, or `[]` for
 * anything malformed/tampered/absent — the same fail-quiet contract every
 * other localStorage/sessionStorage read in this app follows. */
export function parseWorkspaceTabs(raw: string | null): WorkspaceTab[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every(isWorkspaceTab) ? parsed : [];
  } catch {
    return [];
  }
}
