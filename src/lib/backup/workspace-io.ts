/**
 * WP6 — Workspace Backup & Restore: the JSON snapshot shape, its zod
 * validator, and the pure build function that turns already-fetched
 * tenant rows into that shape. Same philosophy as
 * src/lib/ingestion/csv-parsers.ts and src/server/queries/calc-adapters.ts
 * — this file only ever sees plain data (or Pick<PrismaModel, ...> shapes
 * for typing buildWorkspaceSnapshot's input), never calls `db` itself. The
 * actual fetch/transaction-write lives in src/server/actions/backup.ts.
 *
 * SCOPE JUDGMENT CALL: the WP6 spec's own wording for this deliverable is
 * "Tenant-scoped JSON export capturing projects, rate cards, baselines,
 * actuals, resource types, and RAID registers" — but it also calls the
 * whole feature a "full-tenant JSON workspace backup." Taking the narrower
 * list literally would produce a snapshot that's unsafe to restore: a
 * restore that silently dropped a project's Scope Matrix, Audit Checklist,
 * or Schedule would corrupt exactly the workspace it claims to back up.
 * So this snapshot is the full closure needed to faithfully reconstitute a
 * tenant's delivery state — Practices, the Rate Card (DeliveryRole,
 * carrying WP6's employmentType), the Resource directory, Org Policy +
 * Control Label overrides, and every project with its full child set
 * (Scope Items, Effort Matrix, Audit Checklist, RAID Register, Financial
 * Actuals, Schedule) — while deliberately excluding anything that isn't
 * "workspace state": Users/Memberships/logins, ActivityLogEntry (the human
 * activity feed), and AuditLog itself (the governance trail is immutable
 * history, not state to snapshot-and-restore — see logger.ts's doc
 * comment; restoring never rewrites or truncates it, it only ever adds one
 * new WORKSPACE_RESTORED entry).
 */
import { z } from 'zod';

export const WORKSPACE_SNAPSHOT_VERSION = 1;

// ------------------------------------------------------------- zod schema

const practiceSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
});

const deliveryRoleSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  billRate: z.number(),
  costRate: z.number(),
  practiceId: z.string().min(1).nullable(),
  employmentType: z.enum(['FTE', 'CONTRACTOR']),
});

const resourceSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().nullable(),
  roleId: z.string().min(1).nullable(),
  practiceId: z.string().min(1).nullable(),
  managerId: z.string().min(1).nullable(),
});

const orgPolicySchema = z
  .object({
    slipWarnDays: z.number().int(),
    slipCritDays: z.number().int(),
    marginCritPct: z.number(),
    methodology: z.enum(['WATERFALL', 'AGILE', 'HYBRID']),
  })
  .nullable();

const controlLabelSchema = z.strictObject({
  controlKey: z.string().min(1),
  label: z.string().min(1),
});

const scopeItemSchema = z.strictObject({
  key: z.string().min(1),
  name: z.string().min(1),
  included: z.boolean(),
  complexity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  notes: z.string().nullable(),
  custom: z.boolean(),
  sortOrder: z.number().int(),
});

const effortCellSchema = z.strictObject({
  phaseKey: z.string().min(1),
  roleId: z.string().min(1),
  hours: z.number(),
});

const auditEntrySchema = z.strictObject({
  controlKey: z.string().min(1),
  status: z.enum(['YES', 'PARTIAL', 'NO', 'NA']),
  owner: z.string().nullable(),
  repoLink: z.string().nullable(),
  notes: z.string().nullable(),
});

const raidEntrySchema = z.strictObject({
  type: z.enum(['RISK', 'ASSUMPTION', 'ISSUE', 'DEPENDENCY']),
  title: z.string().nullable(),
  description: z.string(),
  impact: z.string().nullable(),
  mitigationPlan: z.string().nullable(),
  severity: z.enum(['CRITICAL', 'HIGH', 'MED', 'LOW']),
  ownerId: z.string().min(1).nullable(),
  targetDate: z.string().nullable(),
  status: z.enum(['OPEN', 'INPROGRESS', 'CLOSED']),
  escalate: z.boolean(),
});

const financialActualSchema = z.strictObject({
  roleKey: z.string().min(1),
  roleId: z.string().min(1).nullable(),
  hours: z.number(),
  cost: z.number(),
  forecastHours: z.number().nullable(),
  openRRHours: z.number().nullable(),
});

const schedulePhaseSchema = z.strictObject({
  phaseKey: z.string().min(1),
  plannedStart: z.string().nullable(),
  plannedEnd: z.string().nullable(),
  actualStart: z.string().nullable(),
  actualEnd: z.string().nullable(),
  pctComplete: z.number(),
  status: z.enum(['NOTSTARTED', 'INPROGRESS', 'COMPLETE', 'DELAYED']),
});

const projectSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  client: z.string().nullable(),
  externalId: z.string().nullable(),
  commercialModel: z.enum(['FF', 'TM']),
  methodology: z.enum(['WATERFALL', 'AGILE', 'HYBRID']),
  govProfile: z.enum(['STANDARD', 'MARQUEE']),
  estimationMode: z.enum(['MATRIX', 'DIRECT']),
  contingencyPct: z.number(),
  practiceDirectorId: z.string().min(1).nullable(),
  deliveryManagerId: z.string().min(1).nullable(),
  projectManagerId: z.string().min(1).nullable(),
  practiceId: z.string().min(1).nullable(),
  hierarchyLevel: z.enum(['STANDALONE', 'PARENT', 'CHILD']),
  parentId: z.string().min(1).nullable(),
  waveTag: z.string().nullable(),
  locked: z.boolean(),
  lockedAt: z.string().nullable(),
  baselineSnapshot: z.unknown().nullable(),
  directIntakeSoldHours: z.number(),
  directIntakeTargetRevenue: z.number(),
  directIntakeBlendedMarginPct: z.number(),
  narrativeAccomplishments: z.string().nullable(),
  narrativeBlockers: z.string().nullable(),
  narrativePriorities: z.string().nullable(),
  scopeItems: z.array(scopeItemSchema),
  effortCells: z.array(effortCellSchema),
  auditEntries: z.array(auditEntrySchema),
  raidEntries: z.array(raidEntrySchema),
  financials: z.array(financialActualSchema),
  schedulePhases: z.array(schedulePhaseSchema),
  /** Resource ids explicitly named as contributors (see ProjectContributor)
   * — not PD/DM/PM of record, which are the practiceDirectorId /
   * deliveryManagerId / projectManagerId fields above. */
  contributorResourceIds: z.array(z.string().min(1)),
});

export const workspaceSnapshotSchema = z.strictObject({
  version: z.number().int(),
  exportedAt: z.string(),
  organizationName: z.string(),
  practices: z.array(practiceSchema),
  deliveryRoles: z.array(deliveryRoleSchema),
  resources: z.array(resourceSchema),
  orgPolicy: orgPolicySchema,
  controlLabels: z.array(controlLabelSchema),
  projects: z.array(projectSchema),
});

export type WorkspaceSnapshot = z.infer<typeof workspaceSnapshotSchema>;
export type WorkspaceSnapshotProject = z.infer<typeof projectSchema>;

export type ValidateWorkspaceSnapshotResult = { ok: true; snapshot: WorkspaceSnapshot } | { ok: false; error: string };

/** Structural + version validation only — referential integrity (does
 * every roleId/ownerId/parentId actually resolve within this same
 * snapshot?) is checked separately by restoreWorkspaceSnapshot right
 * before it writes, since that check needs the snapshot's own id sets
 * built first and doesn't belong in a "is this shaped like a snapshot"
 * pass. */
export function validateWorkspaceSnapshot(input: unknown): ValidateWorkspaceSnapshotResult {
  const parsed = workspaceSnapshotSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path?.length ? ` (at ${issue.path.join('.')})` : '';
    return { ok: false, error: `Not a valid A2R workspace snapshot: ${issue?.message ?? 'schema mismatch'}${path}.` };
  }
  if (parsed.data.version !== WORKSPACE_SNAPSHOT_VERSION) {
    return {
      ok: false,
      error: `Snapshot version ${parsed.data.version} is not supported by this build (expected version ${WORKSPACE_SNAPSHOT_VERSION}).`,
    };
  }
  return { ok: true, snapshot: parsed.data };
}

// ------------------------------------------------------------- build (export)

/** Plain shape buildWorkspaceSnapshot expects for one project — the server
 * action assembles this from a single deeply-included Prisma query; kept
 * as Pick<...>-free plain fields here (rather than importing Prisma's
 * `Project & {...}` type) so this file stays free of any Prisma import,
 * runtime or type-only. */
export interface WorkspaceSourceProject {
  id: string;
  name: string;
  client: string | null;
  externalId: string | null;
  commercialModel: string;
  methodology: string;
  govProfile: string;
  estimationMode: string;
  contingencyPct: number;
  practiceDirectorId: string | null;
  deliveryManagerId: string | null;
  projectManagerId: string | null;
  practiceId: string | null;
  hierarchyLevel: string;
  parentId: string | null;
  waveTag: string | null;
  locked: boolean;
  lockedAt: Date | null;
  baselineSnapshot: unknown;
  directIntakeSoldHours: number;
  directIntakeTargetRevenue: number;
  directIntakeBlendedMarginPct: number;
  narrativeAccomplishments: string | null;
  narrativeBlockers: string | null;
  narrativePriorities: string | null;
  scopeItems: { key: string; name: string; included: boolean; complexity: string; notes: string | null; custom: boolean; sortOrder: number }[];
  effortCells: { phaseKey: string; roleId: string; hours: number }[];
  auditEntries: { controlKey: string; status: string; owner: string | null; repoLink: string | null; notes: string | null }[];
  raidEntries: {
    type: string;
    title: string | null;
    description: string;
    impact: string | null;
    mitigationPlan: string | null;
    severity: string;
    ownerId: string | null;
    targetDate: Date | null;
    status: string;
    escalate: boolean;
  }[];
  financials: { roleKey: string; roleId: string | null; hours: number; cost: number; forecastHours: number | null; openRRHours: number | null }[];
  schedulePhases: {
    phaseKey: string;
    plannedStart: Date | null;
    plannedEnd: Date | null;
    actualStart: Date | null;
    actualEnd: Date | null;
    pctComplete: number;
    status: string;
  }[];
  contributors: { resourceId: string }[];
}

export interface WorkspaceSourceData {
  organizationName: string;
  practices: { id: string; name: string }[];
  deliveryRoles: { id: string; name: string; billRate: number; costRate: number; practiceId: string | null; employmentType: string }[];
  resources: { id: string; name: string; email: string | null; roleId: string | null; practiceId: string | null; managerId: string | null }[];
  orgPolicy: { slipWarnDays: number; slipCritDays: number; marginCritPct: number; methodology: string } | null;
  controlLabels: { controlKey: string; label: string }[];
  projects: WorkspaceSourceProject[];
}

function isoOrNull(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

export function buildWorkspaceSnapshot(data: WorkspaceSourceData): WorkspaceSnapshot {
  return workspaceSnapshotSchema.parse({
    version: WORKSPACE_SNAPSHOT_VERSION,
    exportedAt: new Date().toISOString(),
    organizationName: data.organizationName,
    practices: data.practices,
    deliveryRoles: data.deliveryRoles,
    resources: data.resources,
    orgPolicy: data.orgPolicy,
    controlLabels: data.controlLabels,
    projects: data.projects.map((p) => ({
      id: p.id,
      name: p.name,
      client: p.client,
      externalId: p.externalId,
      commercialModel: p.commercialModel,
      methodology: p.methodology,
      govProfile: p.govProfile,
      estimationMode: p.estimationMode,
      contingencyPct: p.contingencyPct,
      practiceDirectorId: p.practiceDirectorId,
      deliveryManagerId: p.deliveryManagerId,
      projectManagerId: p.projectManagerId,
      practiceId: p.practiceId,
      hierarchyLevel: p.hierarchyLevel,
      parentId: p.parentId,
      waveTag: p.waveTag,
      locked: p.locked,
      lockedAt: isoOrNull(p.lockedAt),
      baselineSnapshot: p.baselineSnapshot,
      directIntakeSoldHours: p.directIntakeSoldHours,
      directIntakeTargetRevenue: p.directIntakeTargetRevenue,
      directIntakeBlendedMarginPct: p.directIntakeBlendedMarginPct,
      narrativeAccomplishments: p.narrativeAccomplishments,
      narrativeBlockers: p.narrativeBlockers,
      narrativePriorities: p.narrativePriorities,
      scopeItems: p.scopeItems,
      effortCells: p.effortCells,
      auditEntries: p.auditEntries,
      raidEntries: p.raidEntries.map((r) => ({ ...r, targetDate: isoOrNull(r.targetDate) })),
      financials: p.financials,
      schedulePhases: p.schedulePhases.map((s) => ({
        ...s,
        plannedStart: isoOrNull(s.plannedStart),
        plannedEnd: isoOrNull(s.plannedEnd),
        actualStart: isoOrNull(s.actualStart),
        actualEnd: isoOrNull(s.actualEnd),
      })),
      contributorResourceIds: p.contributors.map((c) => c.resourceId),
    })),
  }) as WorkspaceSnapshot;
}

// ------------------------------------------------------------- restore checks

export interface SnapshotReferentialIssue {
  message: string;
}

/**
 * Pure referential-integrity pass over a structurally-valid snapshot: every
 * id one row points at must resolve to a row that's actually present in
 * this same snapshot (a hand-edited or truncated file is the realistic
 * failure mode here, not a hostile one — but either way, restoring a
 * snapshot with a dangling roleId/ownerId/parentId would leave the
 * database in a state the app's own UI can't render). Returns every issue
 * found rather than failing fast, so one bad file shows the whole picture
 * in the confirmation dialog instead of a single cryptic error at a time.
 */
export function checkSnapshotReferentialIntegrity(snapshot: WorkspaceSnapshot): SnapshotReferentialIssue[] {
  const issues: SnapshotReferentialIssue[] = [];
  const practiceIds = new Set(snapshot.practices.map((p) => p.id));
  const roleIds = new Set(snapshot.deliveryRoles.map((r) => r.id));
  const resourceIds = new Set(snapshot.resources.map((r) => r.id));
  const projectIds = new Set(snapshot.projects.map((p) => p.id));

  for (const r of snapshot.deliveryRoles) {
    if (r.practiceId && !practiceIds.has(r.practiceId)) issues.push({ message: `Delivery role "${r.name}" references an unknown practice.` });
  }
  for (const r of snapshot.resources) {
    if (r.practiceId && !practiceIds.has(r.practiceId)) issues.push({ message: `Resource "${r.name}" references an unknown practice.` });
    if (r.roleId && !roleIds.has(r.roleId)) issues.push({ message: `Resource "${r.name}" references an unknown delivery role.` });
    if (r.managerId && !resourceIds.has(r.managerId)) issues.push({ message: `Resource "${r.name}" references an unknown manager.` });
  }
  for (const p of snapshot.projects) {
    if (p.practiceId && !practiceIds.has(p.practiceId)) issues.push({ message: `Project "${p.name}" references an unknown practice.` });
    if (p.parentId && !projectIds.has(p.parentId)) issues.push({ message: `Project "${p.name}" references an unknown parent project.` });
    for (const rid of [p.practiceDirectorId, p.deliveryManagerId, p.projectManagerId, ...p.contributorResourceIds]) {
      if (rid && !resourceIds.has(rid)) issues.push({ message: `Project "${p.name}" references an unknown resource ("${rid}").` });
    }
    for (const c of p.effortCells) {
      if (!roleIds.has(c.roleId)) issues.push({ message: `Project "${p.name}"'s effort matrix references an unknown role.` });
    }
    for (const f of p.financials) {
      if (f.roleId && !roleIds.has(f.roleId)) issues.push({ message: `Project "${p.name}"'s financials reference an unknown role.` });
    }
    for (const r of p.raidEntries) {
      if (r.ownerId && !resourceIds.has(r.ownerId)) issues.push({ message: `Project "${p.name}"'s RAID register references an unknown owner.` });
    }
  }
  return issues;
}
