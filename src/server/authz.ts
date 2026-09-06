/**
 * WP5 — shared project-edit authorization for Server Actions.
 *
 * Every interactive-editor mutation (effort cells, direct intake, audit
 * entries, RAID items, financial actuals, schedule phases) needs the same
 * check: is the signed-in user's real, effective DeliveryRole
 * (src/lib/auth/rbac.ts) allowed to edit *this* project? This wraps that
 * check once so each action doesn't hand-roll its own project fetch +
 * canEditProject call — see WP4's toggleProjectLock for the pattern this
 * generalizes.
 */
import { db } from '@/lib/db';
import { requireOrgContext, type OrgContext } from '@/lib/session';
import { canEditProject, hasPermission, type PermissionAction } from '@/lib/auth/rbac';
import {
  isPasswordChangeRequiredError,
  PASSWORD_CHANGE_REQUIRED,
} from '@/lib/auth/password-rotation';

export type ProjectEditAuth = { ok: true; context: OrgContext } | { ok: false; error: string };

/**
 * P0 #3 — resolve the org context, but turn a forced-password-rotation
 * session (requireOrgContext throws) into this file's standard
 * `{ ok: false }` tuple so every mutation action rejects cleanly with
 * `PASSWORD_CHANGE_REQUIRED` instead of an unhandled 500. Any other throw
 * (the `redirect()` signal for unauthenticated / no-membership) propagates.
 */
async function resolveContextOrRotationError(): Promise<
  { ok: true; context: OrgContext } | { ok: false; error: string }
> {
  try {
    return { ok: true, context: await requireOrgContext() };
  } catch (err) {
    if (isPasswordChangeRequiredError(err)) return { ok: false, error: PASSWORD_CHANGE_REQUIRED };
    throw err;
  }
}

/**
 * Global write guard. Returns an error string when the active session must
 * not perform ANY mutation in this tenant, regardless of role:
 *   - the operator is inside via the read-only Impersonation Gateway, or
 *   - the tenant is in its GRACE_PERIOD (read-only wind-down) and the
 *     caller is a normal member (A2R staff stay unrestricted).
 */
export function writeBlockReason(context: OrgContext): string | null {
  if (context.impersonation?.readOnly) {
    return 'This is a read-only impersonation session — writes are disabled.';
  }
  const isStaff = context.session.user.isA2rStaff === true;
  const status = context.memberships.find((m) => m.organizationId === context.organizationId)?.organizationStatus;
  if (status === 'GRACE_PERIOD' && !isStaff) {
    return 'This workspace is in a read-only grace period. Contact your A2R account team.';
  }
  return null;
}

/**
 * Resolves the org context and checks edit authority on `projectId` in one
 * call. Returns `{ok:false}` (never throws) for "not found" *and* for
 * "found but not authorized" — deliberately the same shape and a
 * deliberately generic message for both, so an unauthorized user can't use
 * this to probe which project IDs exist in another scope.
 */
export async function authorizeProjectEdit(projectId: string): Promise<ProjectEditAuth> {
  const resolved = await resolveContextOrRotationError();
  if (!resolved.ok) return resolved;
  const { context } = resolved;

  const blocked = writeBlockReason(context);
  if (blocked) return { ok: false, error: blocked };

  const project = await db.project.findFirst({
    where: { id: projectId, organizationId: context.organizationId },
    select: { practiceDirectorId: true, deliveryManagerId: true, projectManagerId: true, practiceId: true },
  });
  if (!project) return { ok: false, error: 'Project not found.' };

  const allowed = canEditProject(
    { deliveryRole: context.deliveryRole, resourceId: context.resourceId, practiceId: context.resourcePracticeId },
    project
  );
  if (!allowed) return { ok: false, error: 'You do not have edit authority on this project.' };

  return { ok: true, context };
}

/**
 * WP6 — the same shape as `authorizeProjectEdit`, but for tenant-wide
 * admin capabilities keyed off `src/lib/auth/rbac.ts`'s `PermissionAction`
 * matrix (`hasPermission`) rather than per-project instance scope. Use
 * this for anything that touches the whole org's data at once (currently:
 * Workspace Backup & Restore, gated on `'admin:workspace'`) rather than
 * one project — `authorizeProjectEdit` stays the right check for anything
 * scoped to a single project, CSV ingestion included (see
 * src/server/actions/ingestion.ts).
 */
export async function authorizeAdminAction(action: PermissionAction): Promise<ProjectEditAuth> {
  const resolved = await resolveContextOrRotationError();
  if (!resolved.ok) return resolved;
  const { context } = resolved;
  const blocked = writeBlockReason(context);
  if (blocked) return { ok: false, error: blocked };
  if (!hasPermission(context.deliveryRole, action)) {
    return { ok: false, error: 'You do not have the required admin authority for this action.' };
  }
  return { ok: true, context };
}
