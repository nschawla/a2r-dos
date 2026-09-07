/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 * Proprietary and confidential. Licensed, not sold, under the A2R Delivery
 * OS Terms of Service & EULA (/terms) — see that document for the full
 * customer-data vs. A2R-IP ownership split and reverse-engineering
 * restrictions this file falls under.
 */

/**
 * WP4 — the real, server-enforced enterprise RBAC permission matrix.
 *
 * This is a *separate axis* from Prisma's `MembershipRole`
 * (OWNER/ADMIN/MEMBER/VIEWER), which remains the tenant-console tier used
 * for things like `toggleProjectLock`'s superuser fallback below. This
 * file's `DeliveryRole` is the delivery-portfolio tier: what a person can
 * see and edit across projects, practices, and the tenant.
 *
 * It is also unrelated to `Persona` in
 * src/components/layout/dashboard-ui-context.tsx (WP3's client-only,
 * localStorage-persisted RBAC *preview*, which still never gates
 * anything). This file is what actually gates things.
 *
 * Deliberately dependency-light — like src/lib/calculations, this only
 * imports Prisma's *types* (for the enum literal and the plain shapes
 * below), never the Prisma client itself, so it stays trivially unit
 * testable.
 */
import type { DeliveryAccessRole, MembershipRole } from '@prisma/client';

export type DeliveryRole = DeliveryAccessRole;

export const DELIVERY_ROLES: readonly DeliveryRole[] = [
  'ADMIN',
  'VP_EXECUTIVE',
  'PRACTICE_DIRECTOR',
  'DELIVERY_MANAGER',
  'PROJECT_MANAGER',
  'VIEWER',
] as const;

export const DELIVERY_ROLE_LABEL: Record<DeliveryRole, string> = {
  ADMIN: 'Admin',
  VP_EXECUTIVE: 'VP / Executive',
  PRACTICE_DIRECTOR: 'Practice Director',
  DELIVERY_MANAGER: 'Delivery Manager',
  PROJECT_MANAGER: 'Project Manager',
  VIEWER: 'Viewer',
};

/**
 * Every gate-able action in the app. Deliberately coarse (module-level,
 * not per-field) — this is a portfolio access-tier matrix, not a
 * field-level ACL. Actions with no real role differentiation (e.g. "can
 * you view a project page you're scoped to see at all") aren't listed
 * here; that's what src/lib/db/scoped-portfolio.ts's row-level filtering
 * already handles.
 */
export type PermissionAction =
  // Module 0 — tenant administration (roster, rate card, governance policy,
  // and (forward-looking) bulk data ingestion).
  | 'admin:roster'
  | 'admin:rateCard'
  | 'admin:governance'
  | 'admin:ingestion'
  // WP6 — tenant-wide workspace export/restore (WorkspaceBackup.tsx). Kept
  // distinct from admin:ingestion: ingestion was reserved (WP4) for a
  // future *roster* bulk-import and, per WP6, per-project CSV import
  // (effort/RAID/financials) turned out to belong on the same authority
  // tier as every other per-project edit — it's gated by
  // authorizeProjectEdit, not this permission. admin:workspace instead
  // gates the one genuinely tenant-wide, all-data, restore-capable
  // capability this WP adds, which deserves its own explicit permission
  // given its blast radius.
  | 'admin:workspace'
  // Unrestricted, tenant-wide portfolio reads (vs. the role/resource-scoped
  // reads every role gets via getScopedProjectsForUser).
  | 'portfolio:viewAll'
  // SteerCo War Room — executive-facing escalation/status view.
  | 'steerco:view'
  // Per-project actions. "editBaseline" covers margin edits and
  // lock/unlock; the other four map 1:1 to PROJECT_MANAGER's "actuals,
  // RAID, audit, schedule" edit authority from the WP4 spec.
  | 'project:editBaseline'
  | 'project:editRaid'
  | 'project:editAudit'
  | 'project:editSchedule'
  | 'project:editFinancials'
  // DELIVERY_MANAGER's "review/approval authority" over their
  // direct-report PMs' projects.
  | 'project:approve';

const ALL_PROJECT_EDIT: PermissionAction[] = [
  'project:editBaseline',
  'project:editRaid',
  'project:editAudit',
  'project:editSchedule',
  'project:editFinancials',
  'project:approve',
];

/**
 * The permission matrix, straight from the WP4 spec:
 *  - ADMIN: full tenant administrative privileges — everything.
 *  - VP_EXECUTIVE: read-all across the full portfolio, SteerCo War Room
 *    access, portfolio-level EAC rollups — no edit/admin authority at all.
 *  - PRACTICE_DIRECTOR: read/write across every project in their practice
 *    domain, with margin & baseline edit authority — full project edit
 *    set, but no tenant admin and no unrestricted portfolio read (their
 *    breadth comes from practice scoping in getScopedProjectsForUser, not
 *    from portfolio:viewAll).
 *  - DELIVERY_MANAGER: scoped to their direct-report PMs' projects, with
 *    review/approval authority — approve only, no direct edit.
 *  - PROJECT_MANAGER: edit access for actuals, RAID, audit, and schedule
 *    on their own projects — no baseline/margin edit, no approve, no admin.
 */
const PERMISSIONS: Record<DeliveryRole, ReadonlySet<PermissionAction>> = {
  ADMIN: new Set<PermissionAction>([
    'admin:roster',
    'admin:rateCard',
    'admin:governance',
    'admin:ingestion',
    'admin:workspace',
    'portfolio:viewAll',
    'steerco:view',
    ...ALL_PROJECT_EDIT,
  ]),
  VP_EXECUTIVE: new Set<PermissionAction>(['portfolio:viewAll', 'steerco:view']),
  PRACTICE_DIRECTOR: new Set<PermissionAction>(ALL_PROJECT_EDIT),
  DELIVERY_MANAGER: new Set<PermissionAction>(['project:approve']),
  PROJECT_MANAGER: new Set<PermissionAction>([
    'project:editRaid',
    'project:editAudit',
    'project:editSchedule',
    'project:editFinancials',
  ]),
  // v1.16.0 — strict read-only observer: full portfolio + SteerCo view,
  // zero edit / admin authority.
  VIEWER: new Set<PermissionAction>(['portfolio:viewAll', 'steerco:view']),
};

export function hasPermission(role: DeliveryRole, action: PermissionAction): boolean {
  return PERMISSIONS[role].has(action);
}

export function permissionsFor(role: DeliveryRole): ReadonlySet<PermissionAction> {
  return PERMISSIONS[role];
}

// ------------------------------------------------------------- effective role

export interface MembershipRoleInput {
  role: MembershipRole;
  deliveryRole: DeliveryRole | null;
}

/**
 * `Membership.deliveryRole` is nullable (see the schema comment) — no
 * backfill migration was run against existing memberships. This is the one
 * place that gap gets papered over: an explicit deliveryRole always wins;
 * otherwise a sensible default is derived from the tenant-tier
 * MembershipRole so every signed-in user still resolves to *some* real
 * delivery role rather than needing a null-check at every call site.
 *
 * OWNER/ADMIN (tenant tier) -> ADMIN (full delivery authority — the org's
 * creator/admins shouldn't be locked out of project actions by default).
 * MEMBER -> PROJECT_MANAGER (the least-privileged project-editing tier).
 * VIEWER -> VIEWER (strict read-only observer; v1.16.0).
 */
export function resolveDeliveryRole(membership: MembershipRoleInput): DeliveryRole {
  if (membership.deliveryRole) return membership.deliveryRole;
  switch (membership.role) {
    case 'OWNER':
    case 'ADMIN':
      return 'ADMIN';
    case 'MEMBER':
      return 'PROJECT_MANAGER';
    case 'VIEWER':
      return 'VIEWER';
    default:
      return 'VIEWER';
  }
}

// ------------------------------------------------------------- per-project edit scope

export interface EditScopeSession {
  deliveryRole: DeliveryRole;
  /** The signed-in user's Resource id in this org, if their login is
   * linked to one (see Resource.userId). Null for logins with no roster
   * entry — e.g. an ADMIN/VP account that isn't itself a delivery resource. */
  resourceId: string | null;
  /** The linked resource's own practice, if any — independent of which
   * projects they're formally assigned PD/DM/PM on. */
  practiceId: string | null;
}

export interface EditScopeProject {
  practiceDirectorId: string | null;
  deliveryManagerId: string | null;
  projectManagerId: string | null;
  practiceId: string | null;
}

/**
 * Per-project edit authority, combining the role permission matrix above
 * with the specific project's assignment/practice. Callers are expected to
 * have already scoped `project` to the right organization (this makes no
 * organizationId check of its own — see the schema's own tenant-isolation
 * convention: enforced at the query layer, not re-checked in every helper).
 *
 * ADMIN edits everything. PRACTICE_DIRECTOR edits any project they're
 * formally the PD on, or any project in their own practice. PROJECT_MANAGER
 * edits only the project(s) they're PM of record on. DELIVERY_MANAGER and
 * VP_EXECUTIVE never get instance-level edit here — DM's authority is
 * approval (see hasPermission('project:approve')), not direct edit; VP is
 * read-only by design.
 */
export function canEditProject(session: EditScopeSession, project: EditScopeProject): boolean {
  switch (session.deliveryRole) {
    case 'ADMIN':
      return true;
    case 'PRACTICE_DIRECTOR':
      return (
        (session.resourceId !== null && session.resourceId === project.practiceDirectorId) ||
        (session.practiceId !== null && session.practiceId === project.practiceId)
      );
    case 'PROJECT_MANAGER':
      return session.resourceId !== null && session.resourceId === project.projectManagerId;
    case 'DELIVERY_MANAGER':
    case 'VP_EXECUTIVE':
      return false;
    default:
      return false;
  }
}
