/**
 * WP4 demo seed: "A2R Ventures Demo" — a richer org built specifically to
 * exercise the RBAC scoping in src/lib/db/scoped-portfolio.ts and the WP2
 * calculation engine end to end.
 *
 *  - 5 logins, one per DeliveryAccessRole (Admin, VP Executive, Practice
 *    Director, Delivery Manager, Project Manager). All share the password
 *    below for convenience — this is demo/dev data only.
 *  - A resource roster with a real reporting line: two PMs (Sam, Jordan)
 *    report to the Delivery Manager (Derek); the PM login (Maria) is a
 *    third, separately-scoped PM.
 *  - 1 Parent Program ("Global ERP Modernization") with 2 Child Waves —
 *    one healthy, one deliberately red (slipped schedule, audit gaps,
 *    margin erosion) so the health/notification/pace-risk UI has
 *    something real to show.
 *  - 3 standalone projects, one in DIRECT estimation mode, one with no
 *    assigned Practice Director (practice-matched instead — exercises the
 *    PRACTICE_DIRECTOR "or project practice matches" scoping clause), and
 *    one with an explicit ProjectContributor (exercises the
 *    PROJECT_MANAGER "or explicit contributor" clause).
 *
 * Idempotent: every top-level row is found-or-created by a natural unique
 * key, and each project's detail rows (scope/schedule/audit/effort/
 * financials/RAID) are only seeded the run it's first created, so
 * `npm run db:seed` is safe to re-run.
 *
 * Run with: npm run db:seed
 */
import { PrismaClient, type DeliveryAccessRole, type MembershipRole, type Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { DEFAULT_PRACTICES, DEFAULT_ROLES, DEFAULT_SCOPE, PHASES, CONTROL_DEFS } from '../src/lib/constants';
import { recordLedgerEvent } from '../src/lib/audit-ledger';

const db = new PrismaClient();

const DEMO_PASSWORD = 'password12345';

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}
function daysFromNow(n: number): Date {
  return daysAgo(-n);
}

async function upsertUser(email: string, name: string) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  return db.user.upsert({
    where: { email },
    update: {},
    create: { email, name, passwordHash },
  });
}

async function main() {
  // ==================== ORG ====================
  let org = await db.organization.findUnique({ where: { slug: 'a2r-ventures-demo' } });
  if (!org) {
    org = await db.organization.create({ data: { name: 'A2R Ventures Demo', slug: 'a2r-ventures-demo' } });
  }
  const organizationId = org.id;

  await db.orgPolicy.upsert({
    where: { organizationId },
    update: {},
    create: { organizationId, slipWarnDays: 5, slipCritDays: 15, marginCritPct: 5, methodology: 'WATERFALL' },
  });

  // Enterprise Governance — start the demo tenant on the balanced Standard
  // template; an admin can switch templates / toggle overrides in Admin.
  await db.governanceConfig.upsert({
    where: { organizationId },
    update: {},
    create: { organizationId, template: 'STANDARD', hiddenModules: [], maskFinancialsForDelivery: false },
  });

  for (const c of CONTROL_DEFS) {
    await db.controlLabel.upsert({
      where: { organizationId_controlKey: { organizationId, controlKey: c.id } },
      update: { label: c.labels.waterfall },
      create: { organizationId, controlKey: c.id, label: c.labels.waterfall },
    });
  }

  // ==================== PRACTICES & RATE CARD ====================
  const practiceIdMap = new Map<string, string>();
  for (const p of DEFAULT_PRACTICES) {
    const existing = await db.practice.findFirst({ where: { organizationId, name: p.name } });
    const created = existing ?? (await db.practice.create({ data: { organizationId, name: p.name } }));
    practiceIdMap.set(p.id, created.id);
  }

  const roleIdMap = new Map<string, string>();
  for (const r of DEFAULT_ROLES) {
    const existing = await db.deliveryRole.findFirst({ where: { organizationId, name: r.name } });
    const created =
      existing ??
      (await db.deliveryRole.create({
        data: {
          organizationId,
          name: r.name,
          billRate: r.billRate,
          costRate: r.costRate,
          practiceId: practiceIdMap.get(r.practiceId) ?? null,
        },
      }));
    roleIdMap.set(r.id, created.id);
  }
  const corePracticeId = practiceIdMap.get('core-delivery') ?? null;
  const archPracticeId = practiceIdMap.get('solution-arch') ?? null;

  // ==================== 5 USERS — ONE PER DELIVERYACCESSROLE ====================
  const adminUser = await upsertUser('admin@a2rventures-demo.test', 'Alicia Admin');
  const vpUser = await upsertUser('vp@a2rventures-demo.test', 'Victor Ng');
  const pdUser = await upsertUser('pd@a2rventures-demo.test', 'Priya Director');
  const dmUser = await upsertUser('dm@a2rventures-demo.test', 'Derek Delivery');
  const pmUser = await upsertUser('pm@a2rventures-demo.test', 'Maria Chen');

  async function upsertMembership(userId: string, role: MembershipRole, deliveryRole: DeliveryAccessRole) {
    await db.membership.upsert({
      where: { userId_organizationId: { userId, organizationId } },
      update: { deliveryRole },
      create: { userId, organizationId, role, deliveryRole },
    });
  }
  await upsertMembership(adminUser.id, 'OWNER', 'ADMIN');
  await upsertMembership(vpUser.id, 'VIEWER', 'VP_EXECUTIVE');
  await upsertMembership(pdUser.id, 'ADMIN', 'PRACTICE_DIRECTOR');
  await upsertMembership(dmUser.id, 'MEMBER', 'DELIVERY_MANAGER');
  await upsertMembership(pmUser.id, 'MEMBER', 'PROJECT_MANAGER');

  // ==================== RESOURCE ROSTER (with a real reporting line) ====================
  async function upsertResource(
    name: string,
    opts: { userId?: string; roleKey: string; practiceId: string | null; email?: string; managerId?: string | null }
  ) {
    const existing = await db.resource.findFirst({ where: { organizationId, name } });
    const data = {
      organizationId,
      name,
      email: opts.email ?? null,
      roleId: roleIdMap.get(opts.roleKey) ?? null,
      practiceId: opts.practiceId,
      userId: opts.userId ?? null,
      managerId: opts.managerId ?? null,
    };
    return existing ? db.resource.update({ where: { id: existing.id }, data }) : db.resource.create({ data });
  }

  const pdResource = await upsertResource('Priya Director', { userId: pdUser.id, roleKey: 'role-pd', practiceId: corePracticeId, email: pdUser.email });
  const dmResource = await upsertResource('Derek Delivery', { userId: dmUser.id, roleKey: 'role-dm', practiceId: corePracticeId, email: dmUser.email });
  const pmResource = await upsertResource('Maria Chen', { userId: pmUser.id, roleKey: 'role-pm', practiceId: corePracticeId, email: pmUser.email, managerId: dmResource.id });
  const samResource = await upsertResource('Sam Rivera', { roleKey: 'role-pm', practiceId: corePracticeId, managerId: dmResource.id });
  const jordanResource = await upsertResource('Jordan Lee', { roleKey: 'role-pm', practiceId: archPracticeId, managerId: dmResource.id });
  const architectResource = await upsertResource('Lena Ortiz', { roleKey: 'role-la', practiceId: archPracticeId });
  const consultantResource = await upsertResource('Omar Haddad', { roleKey: 'role-sc', practiceId: practiceIdMap.get('advisory') ?? null });

  // ==================== PROJECT HELPERS ====================
  const pdRoleId = roleIdMap.get('role-pd')!;
  const dmRoleId = roleIdMap.get('role-dm')!;
  const pmRoleId = roleIdMap.get('role-pm')!;
  const laRoleId = roleIdMap.get('role-la')!;
  const scRoleId = roleIdMap.get('role-sc')!;

  interface ProjectSpec {
    name: string;
    client: string;
    data: Partial<Prisma.ProjectUncheckedCreateInput>;
  }

  async function findOrCreateProject(spec: ProjectSpec): Promise<{ project: Awaited<ReturnType<typeof db.project.create>>; justCreated: boolean }> {
    const existing = await db.project.findFirst({ where: { organizationId, name: spec.name } });
    if (existing) return { project: existing, justCreated: false };
    const project = await db.project.create({
      data: { organizationId, name: spec.name, client: spec.client, ...spec.data },
    });
    return { project, justCreated: true };
  }

  async function seedScope(projectId: string) {
    for (const [i, s] of DEFAULT_SCOPE.entries()) {
      await db.scopeItem.upsert({
        where: { id: `${projectId}-${s.id}` }, // never matches on first run; upsert falls to create
        update: {},
        create: { id: `${projectId}-${s.id}`, projectId, key: s.id, name: s.name, sortOrder: i },
      });
    }
  }

  async function seedAudit(projectId: string, statusFor: (i: number, controlId: string) => 'YES' | 'PARTIAL' | 'NO' | 'NA') {
    for (const [i, c] of CONTROL_DEFS.entries()) {
      await db.auditEntry.upsert({
        where: { projectId_controlKey: { projectId, controlKey: c.id } },
        update: {},
        create: { projectId, controlKey: c.id, status: statusFor(i, c.id) },
      });
    }
  }

  async function seedSchedule(
    projectId: string,
    phaseData: Record<string, { status: 'NOTSTARTED' | 'INPROGRESS' | 'COMPLETE' | 'DELAYED'; pctComplete: number; plannedStart: Date; plannedEnd: Date; actualStart?: Date; actualEnd?: Date }>
  ) {
    for (const p of PHASES) {
      const d = phaseData[p.key];
      if (!d) continue;
      await db.schedulePhase.upsert({
        where: { projectId_phaseKey: { projectId, phaseKey: p.key } },
        update: {},
        create: {
          projectId,
          phaseKey: p.key,
          status: d.status,
          pctComplete: d.pctComplete,
          plannedStart: d.plannedStart,
          plannedEnd: d.plannedEnd,
          actualStart: d.actualStart ?? null,
          actualEnd: d.actualEnd ?? null,
        },
      });
    }
  }

  async function seedEffort(projectId: string, cells: { phaseKey: string; roleId: string; hours: number }[]) {
    for (const c of cells) {
      await db.effortCell.upsert({
        where: { projectId_phaseKey_roleId: { projectId, phaseKey: c.phaseKey, roleId: c.roleId } },
        update: {},
        create: { projectId, ...c },
      });
    }
  }

  async function seedFinancials(projectId: string, rows: { roleKey: string; roleId: string | null; hours: number; cost: number; forecastHours?: number; openRRHours?: number }[]) {
    for (const r of rows) {
      await db.financialActual.upsert({
        where: { projectId_roleKey: { projectId, roleKey: r.roleKey } },
        update: {},
        create: { projectId, ...r },
      });
    }
  }

  async function seedRaid(projectId: string, entries: Omit<Prisma.RaidEntryUncheckedCreateInput, 'projectId'>[]) {
    for (const e of entries) {
      await db.raidEntry.create({ data: { projectId, ...e } });
    }
  }

  async function logActivity(projectId: string, text: string) {
    await db.activityLogEntry.create({ data: { organizationId, projectId, userId: adminUser.id, text, tab: 'home' } });
  }

  // ==================== PARENT PROGRAM ====================
  const { project: parent, justCreated: parentCreated } = await findOrCreateProject({
    name: 'Global ERP Modernization',
    client: 'Titan Manufacturing',
    data: {
      commercialModel: 'FF',
      methodology: 'WATERFALL',
      govProfile: 'MARQUEE',
      hierarchyLevel: 'PARENT',
      practiceDirectorId: pdResource.id,
      deliveryManagerId: dmResource.id,
      practiceId: corePracticeId,
    },
  });
  if (parentCreated) {
    await seedScope(parent.id);
    await seedAudit(parent.id, () => 'NA'); // container — nothing individually audited
    await seedSchedule(parent.id, {}); // no phases of its own; children carry the schedule
    await logActivity(parent.id, 'Registered Parent Program "Global ERP Modernization"');
  }

  // ---- Child Wave 1: healthy ----
  const { project: wave1, justCreated: wave1Created } = await findOrCreateProject({
    name: 'Wave 1 – Finance & Procurement',
    client: 'Titan Manufacturing',
    data: {
      commercialModel: 'FF',
      methodology: 'WATERFALL',
      hierarchyLevel: 'CHILD',
      parentId: parent.id,
      waveTag: 'Wave 1',
      practiceDirectorId: pdResource.id,
      deliveryManagerId: dmResource.id,
      projectManagerId: pmResource.id,
      practiceId: corePracticeId,
      contingencyPct: 10,
    },
  });
  if (wave1Created) {
    await seedScope(wave1.id);
    await seedAudit(wave1.id, (i) => (i < 6 ? 'YES' : i < 8 ? 'PARTIAL' : 'NO'));
    await seedEffort(wave1.id, [
      { phaseKey: 'initiate', roleId: pdRoleId, hours: 60 },
      { phaseKey: 'design', roleId: laRoleId, hours: 220 },
      { phaseKey: 'design', roleId: dmRoleId, hours: 100 },
      { phaseKey: 'build', roleId: scRoleId, hours: 640 },
      { phaseKey: 'build', roleId: pmRoleId, hours: 180 },
      { phaseKey: 'test', roleId: scRoleId, hours: 260 },
      { phaseKey: 'deploy', roleId: pmRoleId, hours: 90 },
      { phaseKey: 'sustain', roleId: scRoleId, hours: 120 },
    ]);
    await seedSchedule(wave1.id, {
      initiate: { status: 'COMPLETE', pctComplete: 100, plannedStart: daysAgo(150), plannedEnd: daysAgo(130), actualStart: daysAgo(150), actualEnd: daysAgo(132) },
      design: { status: 'COMPLETE', pctComplete: 100, plannedStart: daysAgo(129), plannedEnd: daysAgo(90), actualStart: daysAgo(129), actualEnd: daysAgo(88) },
      build: { status: 'INPROGRESS', pctComplete: 65, plannedStart: daysAgo(87), plannedEnd: daysFromNow(10) },
      test: { status: 'NOTSTARTED', pctComplete: 0, plannedStart: daysFromNow(11), plannedEnd: daysFromNow(40) },
      deploy: { status: 'NOTSTARTED', pctComplete: 0, plannedStart: daysFromNow(41), plannedEnd: daysFromNow(60) },
      sustain: { status: 'NOTSTARTED', pctComplete: 0, plannedStart: daysFromNow(61), plannedEnd: daysFromNow(120) },
    });
    await seedFinancials(wave1.id, [
      { roleKey: pdRoleId, roleId: pdRoleId, hours: 55, cost: 55 * 190, forecastHours: 60 },
      { roleKey: laRoleId, roleId: laRoleId, hours: 210, cost: 210 * 170, forecastHours: 220 },
      { roleKey: dmRoleId, roleId: dmRoleId, hours: 95, cost: 95 * 150, forecastHours: 100 },
      { roleKey: scRoleId, roleId: scRoleId, hours: 540, cost: 540 * 120, forecastHours: 1020, openRRHours: 80 },
      { roleKey: pmRoleId, roleId: pmRoleId, hours: 150, cost: 150 * 130, forecastHours: 270 },
    ]);
    await seedRaid(wave1.id, [
      { type: 'RISK', description: 'Legacy AP data migration validation slipping into UAT window.', severity: 'MED', ownerId: pmResource.id, status: 'OPEN' },
      { type: 'DEPENDENCY', description: 'Waiting on Titan Treasury sign-off for GL mapping.', severity: 'LOW', ownerId: pmResource.id, status: 'INPROGRESS' },
    ]);
    await logActivity(wave1.id, 'Seeded Wave 1 – Finance & Procurement');
  }

  // ---- Child Wave 2: deliberately red ----
  const { project: wave2, justCreated: wave2Created } = await findOrCreateProject({
    name: 'Wave 2 – HR & Payroll',
    client: 'Titan Manufacturing',
    data: {
      commercialModel: 'TM',
      methodology: 'AGILE',
      hierarchyLevel: 'CHILD',
      parentId: parent.id,
      waveTag: 'Wave 2',
      practiceDirectorId: pdResource.id,
      deliveryManagerId: dmResource.id,
      projectManagerId: jordanResource.id,
      practiceId: corePracticeId,
      contingencyPct: 10,
    },
  });
  if (wave2Created) {
    await seedScope(wave2.id);
    await seedAudit(wave2.id, (i) => (i < 2 ? 'YES' : i < 4 ? 'PARTIAL' : 'NO'));
    await seedEffort(wave2.id, [
      { phaseKey: 'initiate', roleId: pdRoleId, hours: 40 },
      { phaseKey: 'design', roleId: laRoleId, hours: 160 },
      { phaseKey: 'build', roleId: scRoleId, hours: 520 },
      { phaseKey: 'build', roleId: pmRoleId, hours: 140 },
      { phaseKey: 'test', roleId: scRoleId, hours: 180 },
    ]);
    await seedSchedule(wave2.id, {
      initiate: { status: 'COMPLETE', pctComplete: 100, plannedStart: daysAgo(160), plannedEnd: daysAgo(145), actualStart: daysAgo(160), actualEnd: daysAgo(140) },
      design: { status: 'DELAYED', pctComplete: 100, plannedStart: daysAgo(144), plannedEnd: daysAgo(100), actualStart: daysAgo(144), actualEnd: daysAgo(70) },
      build: { status: 'INPROGRESS', pctComplete: 30, plannedStart: daysAgo(69), plannedEnd: daysAgo(5) },
      test: { status: 'NOTSTARTED', pctComplete: 0, plannedStart: daysFromNow(1), plannedEnd: daysFromNow(30) },
      deploy: { status: 'NOTSTARTED', pctComplete: 0, plannedStart: daysFromNow(31), plannedEnd: daysFromNow(50) },
      sustain: { status: 'NOTSTARTED', pctComplete: 0, plannedStart: daysFromNow(51), plannedEnd: daysFromNow(90) },
    });
    await seedFinancials(wave2.id, [
      { roleKey: pdRoleId, roleId: pdRoleId, hours: 42, cost: 42 * 190, forecastHours: 40 },
      { roleKey: laRoleId, roleId: laRoleId, hours: 175, cost: 175 * 170, forecastHours: 160 },
      { roleKey: scRoleId, roleId: scRoleId, hours: 610, cost: 610 * 135, forecastHours: 700, openRRHours: 220 },
      { roleKey: pmRoleId, roleId: pmRoleId, hours: 165, cost: 165 * 145, forecastHours: 140 },
    ]);
    await seedRaid(wave2.id, [
      { type: 'ISSUE', description: 'Payroll tax engine integration failing 3 of 12 regression scenarios.', severity: 'CRITICAL', ownerId: jordanResource.id, status: 'OPEN', escalate: true },
      { type: 'RISK', description: 'Build-phase burn rate has the delivery office projecting a further 6-week slip.', severity: 'HIGH', ownerId: dmResource.id, status: 'OPEN', escalate: true },
      { type: 'ASSUMPTION', description: 'Assumed HRIS vendor sandbox stays available through UAT — not yet confirmed.', severity: 'MED', ownerId: jordanResource.id, status: 'OPEN' },
    ]);
    await logActivity(wave2.id, 'Seeded Wave 2 – HR & Payroll (at risk)');
  }

  // ==================== STANDALONE PROJECTS ====================

  // ---- 1. Direct-intake, healthy ----
  const { project: cdp, justCreated: cdpCreated } = await findOrCreateProject({
    name: 'Customer Data Platform Rollout',
    client: 'Nimbus Retail',
    data: {
      commercialModel: 'FF',
      methodology: 'HYBRID',
      estimationMode: 'DIRECT',
      practiceDirectorId: pdResource.id,
      deliveryManagerId: dmResource.id,
      projectManagerId: pmResource.id,
      practiceId: corePracticeId,
      directIntakeSoldHours: 2400,
      directIntakeTargetRevenue: 468_000,
      directIntakeBlendedMarginPct: 34,
    },
  });
  if (cdpCreated) {
    await seedScope(cdp.id);
    await seedAudit(cdp.id, (i) => (i < 7 ? 'YES' : i < 9 ? 'PARTIAL' : 'NA'));
    await seedSchedule(cdp.id, {
      initiate: { status: 'COMPLETE', pctComplete: 100, plannedStart: daysAgo(100), plannedEnd: daysAgo(85), actualStart: daysAgo(100), actualEnd: daysAgo(86) },
      design: { status: 'COMPLETE', pctComplete: 100, plannedStart: daysAgo(84), plannedEnd: daysAgo(50), actualStart: daysAgo(84), actualEnd: daysAgo(51) },
      build: { status: 'INPROGRESS', pctComplete: 55, plannedStart: daysAgo(49), plannedEnd: daysFromNow(20) },
      test: { status: 'NOTSTARTED', pctComplete: 0, plannedStart: daysFromNow(21), plannedEnd: daysFromNow(45) },
      deploy: { status: 'NOTSTARTED', pctComplete: 0, plannedStart: daysFromNow(46), plannedEnd: daysFromNow(60) },
      sustain: { status: 'NOTSTARTED', pctComplete: 0, plannedStart: daysFromNow(61), plannedEnd: daysFromNow(100) },
    });
    await seedFinancials(cdp.id, [
      { roleKey: '_direct', roleId: null, hours: 1180, cost: 1180 * 130, forecastHours: 2400, openRRHours: 40 },
    ]);
    await seedRaid(cdp.id, [
      { type: 'DEPENDENCY', description: 'Nimbus loyalty API credentials pending security review.', severity: 'MED', ownerId: pmResource.id, status: 'OPEN' },
    ]);
    await logActivity(cdp.id, 'Seeded Customer Data Platform Rollout');
  }

  // ---- 2. Practice-matched (no PD of record), yellow, with an explicit contributor ----
  const { project: claims, justCreated: claimsCreated } = await findOrCreateProject({
    name: 'Claims Automation Pilot',
    client: 'Meridian Insurance',
    data: {
      commercialModel: 'TM',
      methodology: 'AGILE',
      deliveryManagerId: dmResource.id,
      projectManagerId: samResource.id,
      practiceId: corePracticeId, // no practiceDirectorId — PD sees this via practice match only
    },
  });
  if (claimsCreated) {
    await seedScope(claims.id);
    await seedAudit(claims.id, (i) => (i < 4 ? 'YES' : i < 8 ? 'PARTIAL' : 'NO'));
    await seedEffort(claims.id, [
      { phaseKey: 'design', roleId: laRoleId, hours: 90 },
      { phaseKey: 'build', roleId: scRoleId, hours: 300 },
      { phaseKey: 'build', roleId: pmRoleId, hours: 80 },
      { phaseKey: 'test', roleId: scRoleId, hours: 90 },
    ]);
    await seedSchedule(claims.id, {
      initiate: { status: 'COMPLETE', pctComplete: 100, plannedStart: daysAgo(70), plannedEnd: daysAgo(60), actualStart: daysAgo(70), actualEnd: daysAgo(59) },
      design: { status: 'COMPLETE', pctComplete: 100, plannedStart: daysAgo(58), plannedEnd: daysAgo(40), actualStart: daysAgo(58), actualEnd: daysAgo(38) },
      build: { status: 'INPROGRESS', pctComplete: 20, plannedStart: daysAgo(37), plannedEnd: daysFromNow(3) },
      test: { status: 'NOTSTARTED', pctComplete: 0, plannedStart: daysFromNow(4), plannedEnd: daysFromNow(20) },
      deploy: { status: 'NOTSTARTED', pctComplete: 0, plannedStart: daysFromNow(21), plannedEnd: daysFromNow(30) },
      sustain: { status: 'NOTSTARTED', pctComplete: 0, plannedStart: daysFromNow(31), plannedEnd: daysFromNow(60) },
    });
    await seedFinancials(claims.id, [
      { roleKey: laRoleId, roleId: laRoleId, hours: 85, cost: 85 * 170, forecastHours: 90 },
      { roleKey: scRoleId, roleId: scRoleId, hours: 210, cost: 210 * 120, forecastHours: 390, openRRHours: 60 },
      { roleKey: pmRoleId, roleId: pmRoleId, hours: 60, cost: 60 * 130, forecastHours: 80 },
    ]);
    await seedRaid(claims.id, [
      { type: 'ISSUE', description: 'OCR extraction accuracy below the 92% pilot exit criteria.', severity: 'HIGH', ownerId: samResource.id, status: 'OPEN', escalate: true },
    ]);
    await db.projectContributor.upsert({
      where: { projectId_resourceId: { projectId: claims.id, resourceId: pmResource.id } },
      update: {},
      create: { projectId: claims.id, resourceId: pmResource.id },
    });
    await logActivity(claims.id, 'Seeded Claims Automation Pilot');
  }

  // ---- 3. Different practice than the PD's own (negative case for practice-match scoping) ----
  const { project: fieldApp, justCreated: fieldAppCreated } = await findOrCreateProject({
    name: 'Field Service Mobile App',
    client: 'Atlas Energy',
    data: {
      commercialModel: 'FF',
      methodology: 'HYBRID',
      projectManagerId: jordanResource.id,
      practiceId: archPracticeId, // Solution Architecture — not Priya's Core Delivery practice
    },
  });
  if (fieldAppCreated) {
    await seedScope(fieldApp.id);
    await seedAudit(fieldApp.id, (i) => (i < 3 ? 'YES' : i < 7 ? 'PARTIAL' : 'NO'));
    await seedEffort(fieldApp.id, [
      { phaseKey: 'design', roleId: laRoleId, hours: 140 },
      { phaseKey: 'build', roleId: laRoleId, hours: 260 },
      { phaseKey: 'build', roleId: consultantResource.roleId ?? scRoleId, hours: 220 },
    ]);
    await seedSchedule(fieldApp.id, {
      initiate: { status: 'COMPLETE', pctComplete: 100, plannedStart: daysAgo(80), plannedEnd: daysAgo(70), actualStart: daysAgo(80), actualEnd: daysAgo(69) },
      design: { status: 'INPROGRESS', pctComplete: 70, plannedStart: daysAgo(68), plannedEnd: daysAgo(30) },
      build: { status: 'NOTSTARTED', pctComplete: 0, plannedStart: daysFromNow(1), plannedEnd: daysFromNow(45) },
      test: { status: 'NOTSTARTED', pctComplete: 0, plannedStart: daysFromNow(46), plannedEnd: daysFromNow(65) },
      deploy: { status: 'NOTSTARTED', pctComplete: 0, plannedStart: daysFromNow(66), plannedEnd: daysFromNow(80) },
      sustain: { status: 'NOTSTARTED', pctComplete: 0, plannedStart: daysFromNow(81), plannedEnd: daysFromNow(120) },
    });
    await seedFinancials(fieldApp.id, [
      { roleKey: laRoleId, roleId: laRoleId, hours: 300, cost: 300 * 170, forecastHours: 400 },
      { roleKey: scRoleId, roleId: scRoleId, hours: 40, cost: 40 * 120, forecastHours: 220, openRRHours: 100 },
    ]);
    await seedRaid(fieldApp.id, [
      { type: 'RISK', description: 'Offline-sync conflict resolution design still unvalidated with field crews.', severity: 'MED', ownerId: jordanResource.id, status: 'OPEN' },
      { type: 'ASSUMPTION', description: 'Assumed rugged-device fleet refresh completes before UAT.', severity: 'LOW', status: 'CLOSED' },
    ]);
    await logActivity(fieldApp.id, 'Seeded Field Service Mobile App');
  }

  // ============================================================
  // CLIENT ORG — "Acme Health"
  //
  // A self-contained second tenant giving the dashboard a clean,
  // single-client story on first refresh: one health system with three
  // active engagements that deliberately span Green / Yellow / Red
  // health, a full standard rate card, a populated Control Audit rubric,
  // RAID items, a baseline milestone schedule, and SteerCo decisions per
  // engagement. Same idempotent found-or-create pattern as the org above,
  // and it reuses the org-agnostic seedScope / seedAudit / seedSchedule /
  // seedEffort / seedFinancials / seedRaid helpers.
  // ============================================================
  let acme = await db.organization.findUnique({ where: { slug: 'acme-health' } });
  if (!acme) acme = await db.organization.create({ data: { name: 'Acme Health', slug: 'acme-health' } });
  const acmeId = acme.id;

  // Governance tolerances + the margin-critical threshold the three
  // engagements' EAC margins are tuned around (healthy / watch / breach).
  await db.orgPolicy.upsert({
    where: { organizationId: acmeId },
    update: {},
    create: { organizationId: acmeId, slipWarnDays: 5, slipCritDays: 15, marginCritPct: 8, methodology: 'HYBRID' },
  });

  for (const c of CONTROL_DEFS) {
    await db.controlLabel.upsert({
      where: { organizationId_controlKey: { organizationId: acmeId, controlKey: c.id } },
      update: { label: c.labels.hybrid },
      create: { organizationId: acmeId, controlKey: c.id, label: c.labels.hybrid },
    });
  }

  // ---- Practices ----
  const acmePractice = new Map<string, string>();
  for (const p of DEFAULT_PRACTICES) {
    const existing = await db.practice.findFirst({ where: { organizationId: acmeId, name: p.name } });
    const row = existing ?? (await db.practice.create({ data: { organizationId: acmeId, name: p.name } }));
    acmePractice.set(p.id, row.id);
  }
  const acmeCoreId = acmePractice.get('core-delivery')!;
  const acmeArchId = acmePractice.get('solution-arch')!;
  const acmeAdvisoryId = acmePractice.get('advisory')!;

  // ---- Standard rate card + margin tiers ----
  // Every role is carded at a ~35–37% standard gross margin (bill vs.
  // cost). The three engagements below then land in distinct EAC-margin
  // tiers via their forecast/actual burn: Cloud EHR Migration stays
  // near baseline (~33%), Data Platform Modernization erodes into the
  // watch band (~14%), and Digital Front Door breaches marginCritPct
  // (~4%).
  const ACME_RATE_CARD = [
    { key: 'pd', name: 'Practice Director', billRate: 325, costRate: 205, practiceId: acmeCoreId },
    { key: 'lead', name: 'Delivery Lead', billRate: 255, costRate: 162, practiceId: acmeCoreId },
    { key: 'pm', name: 'Project Manager', billRate: 210, costRate: 134, practiceId: acmeCoreId },
    { key: 'arch', name: 'Lead Architect', billRate: 288, costRate: 181, practiceId: acmeArchId },
    { key: 'sc', name: 'Senior Consultant', billRate: 198, costRate: 126, practiceId: acmeAdvisoryId },
    { key: 'analyst', name: 'Analyst', billRate: 152, costRate: 98, practiceId: acmeAdvisoryId },
  ] as const;
  const acmeRole = new Map<string, string>();
  for (const r of ACME_RATE_CARD) {
    const existing = await db.deliveryRole.findFirst({ where: { organizationId: acmeId, name: r.name } });
    const row =
      existing ??
      (await db.deliveryRole.create({
        data: { organizationId: acmeId, name: r.name, billRate: r.billRate, costRate: r.costRate, practiceId: r.practiceId },
      }));
    acmeRole.set(r.key, row.id);
  }
  const aPD = acmeRole.get('pd')!;
  const aLead = acmeRole.get('lead')!;
  const aPM = acmeRole.get('pm')!;
  const aArch = acmeRole.get('arch')!;
  const aSC = acmeRole.get('sc')!;
  const aAnalyst = acmeRole.get('analyst')!;

  // ---- Users / personas ----
  const acmeAdminUser = await upsertUser('admin@acme-health.test', 'Alex Okafor');
  const acmeSponsorUser = await upsertUser('sponsor@acme-health.test', 'Sofia Reyes');
  const acmePdUser = await upsertUser('pd@acme-health.test', 'Marcus Bell');
  const acmeLeadUser = await upsertUser('lead@acme-health.test', 'Dana Whitfield');
  const acmePmUser = await upsertUser('pm@acme-health.test', 'Priyanka Nair');

  async function acmeMembership(userId: string, role: MembershipRole, deliveryRole: DeliveryAccessRole) {
    await db.membership.upsert({
      where: { userId_organizationId: { userId, organizationId: acmeId } },
      update: { deliveryRole },
      create: { userId, organizationId: acmeId, role, deliveryRole },
    });
  }
  await acmeMembership(acmeAdminUser.id, 'OWNER', 'ADMIN');
  await acmeMembership(acmeSponsorUser.id, 'VIEWER', 'VP_EXECUTIVE'); // Exec Sponsor
  await acmeMembership(acmePdUser.id, 'ADMIN', 'PRACTICE_DIRECTOR');
  await acmeMembership(acmeLeadUser.id, 'MEMBER', 'DELIVERY_MANAGER'); // Delivery Lead
  await acmeMembership(acmePmUser.id, 'MEMBER', 'PROJECT_MANAGER');

  // ---- Resource roster (with a reporting line to the Delivery Lead) ----
  async function acmeResource(
    name: string,
    opts: { userId?: string; roleId: string; practiceId: string | null; email?: string | null; managerId?: string | null }
  ) {
    const existing = await db.resource.findFirst({ where: { organizationId: acmeId, name } });
    const data = {
      organizationId: acmeId,
      name,
      email: opts.email ?? null,
      roleId: opts.roleId,
      practiceId: opts.practiceId,
      userId: opts.userId ?? null,
      managerId: opts.managerId ?? null,
    };
    return existing ? db.resource.update({ where: { id: existing.id }, data }) : db.resource.create({ data });
  }

  const acmePdRes = await acmeResource('Marcus Bell', { userId: acmePdUser.id, roleId: aPD, practiceId: acmeCoreId, email: acmePdUser.email });
  const acmeLeadRes = await acmeResource('Dana Whitfield', { userId: acmeLeadUser.id, roleId: aLead, practiceId: acmeCoreId, email: acmeLeadUser.email });
  const acmePmRes = await acmeResource('Priyanka Nair', { userId: acmePmUser.id, roleId: aPM, practiceId: acmeCoreId, email: acmePmUser.email, managerId: acmeLeadRes.id });
  const acmePm2Res = await acmeResource('Ravi Menon', { roleId: aPM, practiceId: acmeArchId, managerId: acmeLeadRes.id });
  const acmeArchRes = await acmeResource('Elena Popov', { roleId: aArch, practiceId: acmeArchId });
  const acmeScRes = await acmeResource('Tom Becker', { roleId: aSC, practiceId: acmeAdvisoryId });

  async function acmeActivity(projectId: string, text: string) {
    await db.activityLogEntry.create({ data: { organizationId: acmeId, projectId, userId: acmeAdminUser.id, text, tab: 'home' } });
  }
  async function acmeFindOrCreateProject(name: string, data: Partial<Prisma.ProjectUncheckedCreateInput>) {
    const existing = await db.project.findFirst({ where: { organizationId: acmeId, name } });
    if (existing) return { project: existing, justCreated: false };
    const project = await db.project.create({ data: { organizationId: acmeId, name, client: 'Acme Health', ...data } });
    return { project, justCreated: true };
  }
  async function acmeSteerCo(
    projectId: string,
    rows: { decisionRequired: string; ownerId: string | null; targetInDays: number; status?: 'OPEN' | 'RESOLVED'; resolutionNotes?: string }[]
  ) {
    for (const r of rows) {
      await db.steerCoDecision.create({
        data: {
          projectId,
          decisionRequired: r.decisionRequired,
          decisionOwnerId: r.ownerId,
          resolutionTargetDate: daysFromNow(r.targetInDays),
          status: r.status ?? 'OPEN',
          resolutionNotes: r.resolutionNotes ?? null,
        },
      });
    }
  }

  // ---- Engagement 1: Cloud EHR Migration — GREEN (baseline locked, ~94% audit) ----
  const { project: ehr, justCreated: ehrNew } = await acmeFindOrCreateProject('Cloud EHR Migration', {
    commercialModel: 'FF',
    methodology: 'HYBRID',
    govProfile: 'MARQUEE',
    contingencyPct: 12,
    practiceDirectorId: acmePdRes.id,
    deliveryManagerId: acmeLeadRes.id,
    projectManagerId: acmePmRes.id,
    practiceId: acmeCoreId,
    locked: true,
    lockedAt: daysAgo(35),
    baselineSnapshot: { soldHours: 3140, revenue: 780_000, cost: 512_000, marginPct: 34.4, lockedOn: daysAgo(35).toISOString() } as unknown as Prisma.InputJsonValue,
    narrativeAccomplishments: 'Design baseline signed off; core migration runbook validated in the staging tenant.',
    narrativeBlockers: 'None open above the working level.',
    narrativePriorities: 'Complete build of the clinical-notes migration path; dry-run cutover rehearsal #1.',
  });
  if (ehrNew) {
    await seedScope(ehr.id);
    await seedAudit(ehr.id, (i) => (i < 8 ? 'YES' : i < 9 ? 'PARTIAL' : 'NA'));
    await seedEffort(ehr.id, [
      { phaseKey: 'initiate', roleId: aPD, hours: 50 },
      { phaseKey: 'initiate', roleId: aLead, hours: 40 },
      { phaseKey: 'design', roleId: aArch, hours: 240 },
      { phaseKey: 'design', roleId: aLead, hours: 120 },
      { phaseKey: 'design', roleId: aAnalyst, hours: 90 },
      { phaseKey: 'build', roleId: aSC, hours: 620 },
      { phaseKey: 'build', roleId: aPM, hours: 200 },
      { phaseKey: 'build', roleId: aAnalyst, hours: 160 },
      { phaseKey: 'test', roleId: aSC, hours: 280 },
      { phaseKey: 'test', roleId: aPM, hours: 60 },
      { phaseKey: 'deploy', roleId: aPM, hours: 90 },
      { phaseKey: 'deploy', roleId: aLead, hours: 40 },
      { phaseKey: 'sustain', roleId: aSC, hours: 120 },
    ]);
    await seedSchedule(ehr.id, {
      initiate: { status: 'COMPLETE', pctComplete: 100, plannedStart: daysAgo(140), plannedEnd: daysAgo(120), actualStart: daysAgo(140), actualEnd: daysAgo(121) },
      design: { status: 'COMPLETE', pctComplete: 100, plannedStart: daysAgo(119), plannedEnd: daysAgo(75), actualStart: daysAgo(119), actualEnd: daysAgo(73) },
      build: { status: 'INPROGRESS', pctComplete: 60, plannedStart: daysAgo(72), plannedEnd: daysFromNow(18) },
      test: { status: 'NOTSTARTED', pctComplete: 0, plannedStart: daysFromNow(19), plannedEnd: daysFromNow(48) },
      deploy: { status: 'NOTSTARTED', pctComplete: 0, plannedStart: daysFromNow(49), plannedEnd: daysFromNow(64) },
      sustain: { status: 'NOTSTARTED', pctComplete: 0, plannedStart: daysFromNow(65), plannedEnd: daysFromNow(125) },
    });
    await seedFinancials(ehr.id, [
      { roleKey: aPD, roleId: aPD, hours: 48, cost: 48 * 205, forecastHours: 50 },
      { roleKey: aLead, roleId: aLead, hours: 150, cost: 150 * 162, forecastHours: 200 },
      { roleKey: aArch, roleId: aArch, hours: 235, cost: 235 * 181, forecastHours: 240 },
      { roleKey: aSC, roleId: aSC, hours: 470, cost: 470 * 126, forecastHours: 1030, openRRHours: 40 },
      { roleKey: aPM, roleId: aPM, hours: 190, cost: 190 * 134, forecastHours: 350 },
      { roleKey: aAnalyst, roleId: aAnalyst, hours: 200, cost: 200 * 98, forecastHours: 250 },
    ]);
    await seedRaid(ehr.id, [
      { type: 'RISK', title: 'Interface freeze window', description: 'Third-party lab interface vendor has a 2-week change freeze that overlaps the planned cutover rehearsal.', severity: 'MED', ownerId: acmePmRes.id, status: 'OPEN', targetDate: daysFromNow(21) },
      { type: 'DEPENDENCY', title: 'Prod tenant sizing', description: 'Awaiting confirmed production tenant capacity from the hosting provider before load testing.', severity: 'LOW', ownerId: acmeLeadRes.id, status: 'INPROGRESS' },
      { type: 'ASSUMPTION', title: 'Historical data cap', description: 'Assumed 7 years of historical encounters migrate; older records archived read-only.', severity: 'LOW', ownerId: acmePmRes.id, status: 'CLOSED' },
    ]);
    await acmeSteerCo(ehr.id, [
      { decisionRequired: 'Confirm the go-live weekend date and clinical downtime window.', ownerId: acmePdRes.id, targetInDays: 25 },
    ]);
    await acmeActivity(ehr.id, 'Registered engagement "Cloud EHR Migration" and locked the delivery baseline');
  }

  // ---- Engagement 2: Data Platform Modernization — YELLOW (unlocked, ~60% audit, margin watch) ----
  const { project: dpm, justCreated: dpmNew } = await acmeFindOrCreateProject('Data Platform Modernization', {
    commercialModel: 'TM',
    methodology: 'AGILE',
    govProfile: 'STANDARD',
    contingencyPct: 10,
    practiceDirectorId: acmePdRes.id,
    deliveryManagerId: acmeLeadRes.id,
    projectManagerId: acmePm2Res.id,
    practiceId: acmeArchId,
    narrativeAccomplishments: 'Lakehouse landing zone stood up; first two source systems ingesting on schedule.',
    narrativeBlockers: 'Source-system data quality worse than profiled; extra remediation sprints being scoped.',
    narrativePriorities: 'Agree remediation scope with Acme data governance; re-baseline the backlog burn-up.',
  });
  if (dpmNew) {
    await seedScope(dpm.id);
    await seedAudit(dpm.id, (i) => (i < 4 ? 'YES' : i < 8 ? 'PARTIAL' : 'NO'));
    await seedEffort(dpm.id, [
      { phaseKey: 'initiate', roleId: aLead, hours: 40 },
      { phaseKey: 'design', roleId: aArch, hours: 200 },
      { phaseKey: 'design', roleId: aAnalyst, hours: 120 },
      { phaseKey: 'build', roleId: aSC, hours: 520 },
      { phaseKey: 'build', roleId: aPM, hours: 150 },
      { phaseKey: 'build', roleId: aAnalyst, hours: 180 },
      { phaseKey: 'test', roleId: aSC, hours: 190 },
    ]);
    await seedSchedule(dpm.id, {
      initiate: { status: 'COMPLETE', pctComplete: 100, plannedStart: daysAgo(120), plannedEnd: daysAgo(105), actualStart: daysAgo(120), actualEnd: daysAgo(104) },
      design: { status: 'DELAYED', pctComplete: 100, plannedStart: daysAgo(103), plannedEnd: daysAgo(60), actualStart: daysAgo(103), actualEnd: daysAgo(44) },
      build: { status: 'INPROGRESS', pctComplete: 35, plannedStart: daysAgo(43), plannedEnd: daysFromNow(8) },
      test: { status: 'NOTSTARTED', pctComplete: 0, plannedStart: daysFromNow(9), plannedEnd: daysFromNow(34) },
      deploy: { status: 'NOTSTARTED', pctComplete: 0, plannedStart: daysFromNow(35), plannedEnd: daysFromNow(52) },
      sustain: { status: 'NOTSTARTED', pctComplete: 0, plannedStart: daysFromNow(53), plannedEnd: daysFromNow(100) },
    });
    await seedFinancials(dpm.id, [
      { roleKey: aLead, roleId: aLead, hours: 44, cost: 44 * 162, forecastHours: 40 },
      { roleKey: aArch, roleId: aArch, hours: 230, cost: 230 * 181, forecastHours: 200 },
      { roleKey: aSC, roleId: aSC, hours: 470, cost: 470 * 138, forecastHours: 900, openRRHours: 180 },
      { roleKey: aPM, roleId: aPM, hours: 165, cost: 165 * 134, forecastHours: 150 },
      { roleKey: aAnalyst, roleId: aAnalyst, hours: 330, cost: 330 * 104, forecastHours: 420, openRRHours: 60 },
    ]);
    await seedRaid(dpm.id, [
      { type: 'ISSUE', title: 'Source data quality', description: 'Patient-master duplicates in two source systems exceed the profiled defect rate by ~4x, threatening the golden-record build.', severity: 'HIGH', ownerId: acmePm2Res.id, status: 'OPEN', escalate: true, targetDate: daysFromNow(10) },
      { type: 'RISK', title: 'Backlog burn slip', description: 'Remediation sprints not in the original SOW; the delivery office projecting a 3–4 week release slip if absorbed without a change order.', severity: 'HIGH', ownerId: acmeLeadRes.id, status: 'OPEN', escalate: true },
      { type: 'DEPENDENCY', title: 'Governance sign-off', description: 'Golden-record survivorship rules need Acme data-governance council approval before the merge job can run.', severity: 'MED', ownerId: acmePm2Res.id, status: 'INPROGRESS' },
    ]);
    await acmeSteerCo(dpm.id, [
      { decisionRequired: 'Approve a change order for the additional data-remediation sprints, or de-scope two source systems from wave 1.', ownerId: acmePdRes.id, targetInDays: 12 },
      { decisionRequired: 'Confirm the revised wave-1 release date once remediation scope is agreed.', ownerId: acmeLeadRes.id, targetInDays: 20 },
    ]);
    await acmeActivity(dpm.id, 'Registered engagement "Data Platform Modernization"');
  }

  // ---- Engagement 3: Digital Front Door — RED (unlocked, ~30% audit, margin breach) ----
  const { project: dfd, justCreated: dfdNew } = await acmeFindOrCreateProject('Digital Front Door', {
    commercialModel: 'FF',
    methodology: 'HYBRID',
    govProfile: 'STANDARD',
    contingencyPct: 12,
    deliveryManagerId: acmeLeadRes.id,
    projectManagerId: acmePmRes.id,
    practiceId: acmeCoreId, // no PD of record — visible to the PD via practice match
    narrativeAccomplishments: 'Patient scheduling MVP demoed; SSO integration with the payer portal working in the test ring.',
    narrativeBlockers: 'Scope grew (symptom checker, bill-pay) without a signed change order; build burn is well ahead of revenue.',
    narrativePriorities: 'Freeze scope to the signed SOW; get the change order executed; recovery plan to steering.',
  });
  if (dfdNew) {
    await seedScope(dfd.id);
    await seedAudit(dfd.id, (i) => (i < 2 ? 'YES' : i < 4 ? 'PARTIAL' : 'NO'));
    await seedEffort(dfd.id, [
      { phaseKey: 'initiate', roleId: aLead, hours: 36 },
      { phaseKey: 'design', roleId: aArch, hours: 150 },
      { phaseKey: 'design', roleId: aPM, hours: 70 },
      { phaseKey: 'build', roleId: aSC, hours: 460 },
      { phaseKey: 'build', roleId: aAnalyst, hours: 210 },
      { phaseKey: 'test', roleId: aSC, hours: 150 },
    ]);
    await seedSchedule(dfd.id, {
      initiate: { status: 'COMPLETE', pctComplete: 100, plannedStart: daysAgo(110), plannedEnd: daysAgo(95), actualStart: daysAgo(110), actualEnd: daysAgo(92) },
      design: { status: 'COMPLETE', pctComplete: 100, plannedStart: daysAgo(90), plannedEnd: daysAgo(55), actualStart: daysAgo(90), actualEnd: daysAgo(40) },
      build: { status: 'DELAYED', pctComplete: 45, plannedStart: daysAgo(39), plannedEnd: daysAgo(6) },
      test: { status: 'NOTSTARTED', pctComplete: 0, plannedStart: daysFromNow(2), plannedEnd: daysFromNow(26) },
      deploy: { status: 'NOTSTARTED', pctComplete: 0, plannedStart: daysFromNow(27), plannedEnd: daysFromNow(40) },
      sustain: { status: 'NOTSTARTED', pctComplete: 0, plannedStart: daysFromNow(41), plannedEnd: daysFromNow(85) },
    });
    await seedFinancials(dfd.id, [
      { roleKey: aLead, roleId: aLead, hours: 60, cost: 60 * 162, forecastHours: 36 },
      { roleKey: aArch, roleId: aArch, hours: 210, cost: 210 * 181, forecastHours: 150 },
      { roleKey: aSC, roleId: aSC, hours: 540, cost: 540 * 150, forecastHours: 980, openRRHours: 260 },
      { roleKey: aPM, roleId: aPM, hours: 130, cost: 130 * 134, forecastHours: 70 },
      { roleKey: aAnalyst, roleId: aAnalyst, hours: 260, cost: 260 * 112, forecastHours: 360, openRRHours: 90 },
    ]);
    await seedRaid(dfd.id, [
      { type: 'ISSUE', title: 'Uncommercialised scope', description: 'Symptom checker and bill-pay were built against verbal direction; no signed change order, ~£140k of unbilled effort exposed.', severity: 'CRITICAL', ownerId: acmeLeadRes.id, status: 'OPEN', escalate: true, targetDate: daysFromNow(7) },
      { type: 'RISK', title: 'Fixed-fee margin breach', description: 'Forecast cost to complete puts the engagement below the 8% margin floor; recovery plan required.', severity: 'CRITICAL', ownerId: acmePdRes.id, status: 'OPEN', escalate: true },
      { type: 'ISSUE', title: 'Build phase overrun', description: 'Build blew through its planned end date; test start slipping with no float left in the plan.', severity: 'HIGH', ownerId: acmePmRes.id, status: 'INPROGRESS' },
      { type: 'DEPENDENCY', title: 'Payer portal API limits', description: 'Payer portal rate-limits eligibility checks; production throughput sign-off outstanding.', severity: 'MED', ownerId: acmePmRes.id, status: 'OPEN' },
    ]);
    await acmeSteerCo(dfd.id, [
      { decisionRequired: 'Approve and execute the change order for symptom checker + bill-pay, or formally de-scope both.', ownerId: acmePdRes.id, targetInDays: 7 },
      { decisionRequired: 'Endorse the delivery recovery plan and revised go-live date.', ownerId: acmeLeadRes.id, targetInDays: 14 },
    ]);
    await db.projectContributor.upsert({
      where: { projectId_resourceId: { projectId: dfd.id, resourceId: acmePm2Res.id } },
      update: {},
      create: { projectId: dfd.id, resourceId: acmePm2Res.id },
    });
    await acmeActivity(dfd.id, 'Registered engagement "Digital Front Door" (delivery at risk)');
  }

  // ============================================================
  // A2R OPERATOR CONTROL PLANE — internal staff login
  //
  // No client Membership: this account exists only to reach /ops. The
  // guard in src/lib/ops-auth.ts also accepts any @a2rventures.com email,
  // but seeding an explicit isA2rStaff account keeps the demo self-evident.
  // ============================================================
  const opsUser = await upsertUser('ops@a2rventures.com', 'Riley Operator');
  await db.user.update({ where: { id: opsUser.id }, data: { isA2rStaff: true } });

  // ============================================================
  // RESOURCE & CAPACITY COCKPIT + CONCURRENCY FOUNDATION
  //
  // Idempotent, org-agnostic, and independent of the per-project
  // `justCreated` guards above — so it backfills every project/resource that
  // already exists in the database:
  //   - RoleUtilizationPolicy: 5 job families (SA 72% / Delivery Staff 79% /
  //     People Manager 10% / Director & Engagement Coordinator 0%, non-billable).
  //   - OrganizationHoliday: the 2026 US corporate calendar.
  //   - Resource: psPractice (domain-led practice taxonomy — TRANS-Delivery,
  //     FIN-Advisory, TECH-Transformation, OPS-Strategy, DATA-Analytics) /
  //     managerName / fte / targetUtilPct / isPS / projectCount +
  //     rolePolicyId / startDate / endDate.
  //   - RaidEntry: likelihood on RISK-type rows (drives the C3 heatmap).
  //   - Project: bac / actualsCost / unscheduledBacklog / vac + the
  //     five-lens health vector + denormalized hierarchy flags.
  //   - WeeklyAssignmentSlot: 52 weeks of forecast vs. actual hours per
  //     assigned resource (burn curve + the 52-week capacity forecast).
  // ============================================================
  {
    // Modern, domain-led practice taxonomy — fits any professional-services
    // or advisory enterprise (no legacy "PS - *" department codes).
    const PRACTICE_TAXONOMY: Record<string, string> = {
      'TRANS-Delivery': 'Transformation & Delivery Excellence',
      'FIN-Advisory': 'Financial & Transaction Advisory',
      'TECH-Transformation': 'Technology & Cloud Solutions',
      'OPS-Strategy': 'Operations & Supply Chain Strategy',
      'DATA-Analytics': 'Data Strategy & AI Integration',
    };
    /** Map a resource's delivery-role + name to one of the five practices. */
    function practiceForResource(roleName: string | null | undefined, name: string): string {
      const n = (roleName ?? '').toLowerCase();
      if (n.includes('architect') || n.includes('platform') || n.includes('cloud') || n.includes('integration'))
        return 'TECH-Transformation';
      if (n.includes('analyst') || n.includes('data') || n.includes('analytics')) return 'DATA-Analytics';
      if (n.includes('consultant') || n.includes('advisor') || n.includes('finance') || n.includes('transaction'))
        return 'FIN-Advisory';
      if (n.includes('director') || n.includes('practice')) return 'TRANS-Delivery';
      // Delivery / project managers spread deterministically across the
      // remaining delivery-facing domains so all five practices are populated.
      const pool = ['TRANS-Delivery', 'OPS-Strategy', 'DATA-Analytics'];
      return pool[Math.floor(hash01(`practice:${name}`) * pool.length)]!;
    }
    const LIKELIHOOD_BY_SEVERITY: Record<string, 'RARE' | 'POSSIBLE' | 'LIKELY' | 'ALMOST_CERTAIN'> = {
      CRITICAL: 'ALMOST_CERTAIN',
      HIGH: 'LIKELY',
      MED: 'POSSIBLE',
      LOW: 'RARE',
    };
    // Deterministic 0..1 from a string — keeps weekly actuals stable across re-seeds.
    function hash01(s: string): number {
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return ((h >>> 0) % 1000) / 1000;
    }
    function mondayOf(d: Date): Date {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      const day = x.getDay();
      x.setDate(x.getDate() + ((day === 0 ? -6 : 1) - day));
      return x;
    }
    const bandFromPct = (pct: number) => (pct >= 80 ? 'Green' : pct >= 50 ? 'Amber' : 'Red');
    const thisMonday = mondayOf(new Date());

    // ---- Resource & Capacity Cockpit reference data ----
    const HOLIDAYS_2026: { name: string; date: string }[] = [
      { name: "New Year's Day", date: '2026-01-01' },
      { name: 'Martin Luther King Jr. Day', date: '2026-01-19' },
      { name: "Presidents' Day", date: '2026-02-16' },
      { name: 'Memorial Day', date: '2026-05-25' },
      { name: 'Juneteenth', date: '2026-06-19' },
      { name: 'Independence Day (observed)', date: '2026-07-03' },
      { name: 'Labor Day', date: '2026-09-07' },
      { name: 'Thanksgiving Day', date: '2026-11-26' },
      { name: 'Day after Thanksgiving', date: '2026-11-27' },
      { name: 'Christmas Eve', date: '2026-12-24' },
      { name: 'Christmas Day', date: '2026-12-25' },
    ];
    const ROLE_POLICIES: { roleName: string; targetUtilPct: number; isBillableHead: boolean }[] = [
      { roleName: 'Solution Architect', targetUtilPct: 0.72, isBillableHead: true },
      { roleName: 'Delivery Staff', targetUtilPct: 0.79, isBillableHead: true },
      { roleName: 'People Manager', targetUtilPct: 0.1, isBillableHead: true },
      { roleName: 'Director', targetUtilPct: 0.0, isBillableHead: false },
      { roleName: 'Engagement Coordinator', targetUtilPct: 0.0, isBillableHead: false },
    ];
    function policyNameForRole(deliveryRoleName: string | null | undefined): string {
      const n = (deliveryRoleName ?? '').toLowerCase();
      if (n.includes('architect')) return 'Solution Architect';
      if (n.includes('practice director') || n === 'director') return 'Director';
      if (n.includes('project manager')) return 'Delivery Staff';
      if (n.includes('delivery manager') || n.includes('delivery lead') || n.includes('people manager')) return 'People Manager';
      if (n.includes('coordinator')) return 'Engagement Coordinator';
      return 'Delivery Staff';
    }

    const capOrgs = await db.organization.findMany({ select: { id: true } });
    let slotCount = 0;

    for (const { id: orgId } of capOrgs) {
      // ---- Role utilisation policies ----
      // Drop any policy no longer in the taxonomy (e.g. the legacy
      // "PMO Coordinator") so re-seeding leaves a clean set.
      await db.roleUtilizationPolicy.deleteMany({
        where: { organizationId: orgId, roleName: { notIn: ROLE_POLICIES.map((p) => p.roleName) } },
      });
      const policyByName = new Map<string, { id: string; targetUtilPct: number; isBillableHead: boolean }>();
      for (const pol of ROLE_POLICIES) {
        const row = await db.roleUtilizationPolicy.upsert({
          where: { organizationId_roleName: { organizationId: orgId, roleName: pol.roleName } },
          update: { targetUtilPct: pol.targetUtilPct, isBillableHead: pol.isBillableHead },
          create: { organizationId: orgId, ...pol },
        });
        policyByName.set(pol.roleName, { id: row.id, targetUtilPct: row.targetUtilPct, isBillableHead: row.isBillableHead });
      }

      // ---- Corporate holidays (2026) ----
      for (const h of HOLIDAYS_2026) {
        const date = new Date(`${h.date}T00:00:00.000Z`);
        await db.organizationHoliday.upsert({
          where: { organizationId_date: { organizationId: orgId, date } },
          update: { name: h.name },
          create: { organizationId: orgId, name: h.name, date },
        });
      }

      const resources = await db.resource.findMany({
        where: { organizationId: orgId },
        include: {
          practice: { select: { name: true } },
          manager: { select: { name: true } },
          role: { select: { name: true } },
        },
      });

      for (const r of resources) {
        const concurrency = await db.project.count({
          where: {
            organizationId: orgId,
            hierarchyLevel: { not: 'PARENT' },
            OR: [
              { practiceDirectorId: r.id },
              { deliveryManagerId: r.id },
              { projectManagerId: r.id },
              { contributors: { some: { resourceId: r.id } } },
            ],
          },
        });
        const policyName = policyNameForRole(r.role?.name);
        const policy = policyByName.get(policyName)!;
        // Deterministic tenure + FTE: most full-time & long-tenured; a few
        // part-time; one Delivery Staff per org rolling off in ~3 months.
        const fte = hash01(`fte:${r.name}`) < 0.18 ? 0.8 : 1.0;
        const monthsTenure = 6 + Math.round(hash01(`tenure:${r.name}`) * 30); // 6..36 months
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - monthsTenure);
        startDate.setHours(0, 0, 0, 0);
        const rollingOff = policyName === 'Delivery Staff' && hash01(`roll:${r.name}`) < 0.16;
        const endDate = rollingOff ? new Date(Date.now() + (60 + Math.round(hash01(`end:${r.name}`) * 60)) * 86_400_000) : null;

        await db.resource.update({
          where: { id: r.id },
          data: {
            psPractice: practiceForResource(r.role?.name, r.name),
            managerName: r.manager?.name ?? null,
            fte,
            targetUtilPct: policy.targetUtilPct,
            isPS: true,
            projectCount: concurrency,
            rolePolicyId: policy.id,
            startDate,
            endDate,
          },
        });
      }

      const projects = await db.project.findMany({
        where: { organizationId: orgId },
        include: {
          financials: { include: { role: { select: { costRate: true } } } },
          effortCells: { include: { role: { select: { billRate: true, costRate: true } } } },
          auditEntries: { select: { status: true } },
          raidEntries: { select: { id: true, type: true, severity: true, escalate: true } },
          schedulePhases: { select: { status: true } },
        },
      });

      // hands-on delivery roster (architects + consultants), rotated across
      // projects so no single person absorbs every engagement's build hours.
      const deliveryPool = resources.filter((r) => {
        const n = (r.role?.name ?? '').toLowerCase();
        return n.includes('architect') || n.includes('consultant') || n.includes('analyst');
      });
      let deliveryIdx = 0;

      for (const p of projects) {
        // ---- RaidEntry.likelihood on RISK rows ----
        for (const e of p.raidEntries) {
          if (e.type !== 'RISK') continue;
          let lik = LIKELIHOOD_BY_SEVERITY[e.severity] ?? 'POSSIBLE';
          // nudge one notch less likely for ~1/3 of rows so the heatmap spreads
          if (hash01(e.id) < 0.34 && lik !== 'RARE') {
            const order = ['RARE', 'POSSIBLE', 'LIKELY', 'ALMOST_CERTAIN'] as const;
            lik = order[Math.max(0, order.indexOf(lik) - 1)]!;
          }
          await db.raidEntry.update({ where: { id: e.id }, data: { likelihood: lik } });
        }

        const isParent = p.hierarchyLevel === 'PARENT';

        // ---- EVM-ish rollups ----
        const bac =
          p.estimationMode === 'DIRECT'
            ? p.directIntakeTargetRevenue
            : Math.round(p.effortCells.reduce((s, c) => s + c.hours * (c.role?.billRate ?? 0), 0));
        const actualsCost = Math.round(p.financials.reduce((s, f) => s + f.cost, 0));
        const eacCost = Math.round(
          p.financials.reduce(
            (s, f) =>
              s +
              f.cost +
              (f.forecastHours ?? 0) * (f.role?.costRate ?? 0) +
              (f.openRRHours ?? 0) * (f.role?.costRate ?? 0),
            0
          )
        );
        const snapshot = (p.baselineSnapshot ?? null) as { cost?: number } | null;
        const baselineCost =
          p.locked && typeof snapshot?.cost === 'number'
            ? Math.round(snapshot.cost)
            : p.estimationMode === 'DIRECT'
              ? Math.round(p.directIntakeTargetRevenue * (1 - p.directIntakeBlendedMarginPct / 100))
              : Math.round(p.effortCells.reduce((s, c) => s + c.hours * (c.role?.costRate ?? 0), 0));
        const vac = Math.round((baselineCost || bac) - (eacCost || actualsCost));
        const unscheduledBacklog = p.locked ? 0 : Math.round(bac * 0.12);

        // ---- five-lens health vector ----
        const graded = p.auditEntries.filter((a) => a.status !== 'NA');
        const auditPct = graded.length
          ? (graded.reduce((s, a) => s + (a.status === 'YES' ? 1 : a.status === 'PARTIAL' ? 0.5 : 0), 0) / graded.length) * 100
          : 0;
        const delayed = p.schedulePhases.some((s) => s.status === 'DELAYED');
        const criticalOpenIssue = p.raidEntries.some((e) => e.type === 'ISSUE' && e.escalate && e.severity === 'CRITICAL');
        const marginRatio = baselineCost > 0 ? vac / baselineCost : 0;

        const healthQual = bandFromPct(auditPct);
        const healthSched = delayed ? 'Red' : 'Green';
        const healthCost = marginRatio >= -0.02 ? 'Green' : marginRatio >= -0.12 ? 'Amber' : 'Red';
        const healthScope = criticalOpenIssue ? 'Red' : unscheduledBacklog > bac * 0.1 ? 'Amber' : 'Green';
        const pmRes = resources.find((r) => r.id === p.projectManagerId);
        const healthRes = !p.projectManagerId ? 'Amber' : (pmRes?.projectCount ?? 0) >= 4 ? 'Amber' : 'Green';

        await db.project.update({
          where: { id: p.id },
          data: {
            bac,
            actualsCost,
            unscheduledBacklog,
            vac,
            isRetainer: p.commercialModel === 'TM' && p.methodology === 'AGILE' && !p.locked,
            isChild: p.hierarchyLevel === 'CHILD',
            parentProjectId: p.parentId,
            healthCost: isParent ? 'Green' : healthCost,
            healthSched: isParent ? 'Green' : healthSched,
            healthScope: isParent ? 'Green' : healthScope,
            healthQual: isParent ? 'Green' : healthQual,
            healthRes: isParent ? 'Green' : healthRes,
          },
        });

        if (isParent) continue;

        // ---- WeeklyAssignmentSlot time series (66 weeks: 14 past, current, 39 future) ----
        // Per-person weekly hours kept modest so a resource on 2–3 concurrent
        // engagements lands near — not far over — a full week.
        const assigned = [
          { id: p.practiceDirectorId, base: 4 },
          { id: p.deliveryManagerId, base: 6 },
          { id: p.projectManagerId, base: 12 },
        ].filter((a): a is { id: string; base: number } => !!a.id);
        // rotate one hands-on delivery resource onto this engagement
        if (deliveryPool.length > 0) {
          const dr = deliveryPool[deliveryIdx++ % deliveryPool.length]!;
          if (!assigned.some((a) => a.id === dr.id)) assigned.push({ id: dr.id, base: 15 });
        }

        const slotRows: {
          organizationId: string;
          resourceId: string;
          projectId: string;
          weekDate: Date;
          forecastedHours: number;
          actualHours: number;
        }[] = [];
        for (const a of assigned) {
          for (let k = -14; k <= 39; k++) {
            const weekDate = new Date(thisMonday);
            weekDate.setDate(weekDate.getDate() + k * 7);
            // taper forecast toward the tail of the plan
            const taper = k > 26 ? 0.55 : k > 13 ? 0.8 : 1;
            const wobble = 0.85 + hash01(`${a.id}:${p.id}:${k}`) * 0.28; // 0.85..1.13
            const forecastedHours = Math.round(a.base * taper * (0.9 + hash01(`f${a.id}${k}`) * 0.3));
            const actualHours = k <= 0 ? Math.round(forecastedHours * wobble) : 0;
            slotRows.push({ organizationId: orgId, resourceId: a.id, projectId: p.id, weekDate, forecastedHours, actualHours });
          }
        }
        // wipe the whole project's slots and rebuild from the current
        // assignment list (a resource dropped from `assigned` between runs
        // must not keep stale hours).
        await db.weeklyAssignmentSlot.deleteMany({ where: { projectId: p.id } });
        await db.weeklyAssignmentSlot.createMany({ data: slotRows, skipDuplicates: true });
        slotCount += slotRows.length;
      }
    }
    const practiceDist = await db.resource.groupBy({ by: ['psPractice'], _count: { _all: true } });
    console.log(
      `  capacity: seeded ${slotCount} weekly slots, 2026 holidays, role utilisation policies + resource/project rollups`
    );
    console.log(
      `  taxonomy: ${practiceDist
        .map((p) => `${p.psPractice} (${p._count._all})`)
        .join(', ')} — ${Object.keys(PRACTICE_TAXONOMY).length} practices`
    );
  }

  // ============================================================
  // SOC 2 COMPLIANCE LEDGER — seed a short hash-chained history so the
  // ledger view has content and its "Verified" badge is a live check, not
  // a decoration. Idempotent: skipped if the org already has entries.
  // ============================================================
  {
    const ledgerSeed: { orgId: string; actorId: string; events: { actionType: string; targetResource: string; metadata: Record<string, unknown> }[] }[] = [
      {
        orgId: organizationId,
        actorId: adminUser.id,
        events: [
          { actionType: 'ROLE_POLICY_CHANGE', targetResource: 'RoleUtilizationPolicy:seed-sa', metadata: { roleName: 'Solution Architect', before: { targetUtilPct: 0.7 }, after: { targetUtilPct: 0.72 } } },
          { actionType: 'SECURITY_CONFIG_CHANGE', targetResource: `Organization:${organizationId}`, metadata: { setting: 'session_timeout_minutes', before: 60, after: 30 } },
          { actionType: 'BASELINE_OVERRIDE', targetResource: 'Project:seed-erp', metadata: { projectName: 'Global ERP Modernization', reason: 'Re-baseline after approved CR-014' } },
        ],
      },
      {
        orgId: acmeId,
        actorId: acmeAdminUser.id,
        events: [
          { actionType: 'HOLIDAY_CALENDAR_CHANGE', targetResource: 'OrganizationHoliday:seed-founders', metadata: { op: 'add', name: "Founders' Day", date: '2026-04-17' } },
          { actionType: 'STAGE_GATE_OVERRIDE', targetResource: 'Project:seed-dfd', metadata: { projectName: 'Digital Front Door', gate: 'Build → Test', reason: 'Conditional pass — 2 open UAT defects accepted by sponsor' } },
          { actionType: 'ROLE_POLICY_CHANGE', targetResource: 'RoleUtilizationPolicy:seed-delivery', metadata: { roleName: 'Delivery Staff', before: { targetUtilPct: 0.79 }, after: { targetUtilPct: 0.79, isBillableHead: true } } },
        ],
      },
    ];

    for (const grp of ledgerSeed) {
      const existing = await db.immutableAuditLedger.count({ where: { organizationId: grp.orgId } });
      if (existing > 0) continue;
      for (const e of grp.events) {
        await recordLedgerEvent(db, { organizationId: grp.orgId, actorId: grp.actorId, ...e });
      }
    }
    console.log('  compliance: seeded SOC 2 audit ledger (hash-chained)');
  }

  // ============================================================
  // MASTER SUPER-ADMIN — navinder@a2rventures.com
  //
  // Full reach: isA2rStaff (the /ops operator axis, cross-tenant) PLUS an
  // OWNER / ADMIN membership in EVERY organization, so this login also has
  // top-tier access inside every client workspace and every module. Its
  // password is set explicitly (not the shared demo password).
  // ============================================================
  const MASTER_ADMIN_EMAIL = 'navinder@a2rventures.com';
  const MASTER_ADMIN_PASSWORD = 'Password123!';
  const masterAdminHash = await bcrypt.hash(MASTER_ADMIN_PASSWORD, 10);
  const masterAdmin = await db.user.upsert({
    where: { email: MASTER_ADMIN_EMAIL },
    update: { name: 'Navinder Chawla', passwordHash: masterAdminHash, isA2rStaff: true },
    create: { email: MASTER_ADMIN_EMAIL, name: 'Navinder Chawla', passwordHash: masterAdminHash, isA2rStaff: true },
  });

  const allOrgs = await db.organization.findMany({ select: { id: true } });
  for (const o of allOrgs) {
    await db.membership.upsert({
      where: { userId_organizationId: { userId: masterAdmin.id, organizationId: o.id } },
      update: { role: 'OWNER', deliveryRole: 'ADMIN' },
      create: { userId: masterAdmin.id, organizationId: o.id, role: 'OWNER', deliveryRole: 'ADMIN' },
    });
  }

  console.log('Seeded:');
  console.log(`  org:      ${org.name} (${org.slug})`);
  console.log(`  password: ${DEMO_PASSWORD} (all 5 logins below)`);
  console.log('  logins:');
  console.log('    admin@a2rventures-demo.test   -> ADMIN');
  console.log('    vp@a2rventures-demo.test      -> VP_EXECUTIVE');
  console.log('    pd@a2rventures-demo.test      -> PRACTICE_DIRECTOR (Core Delivery)');
  console.log('    dm@a2rventures-demo.test      -> DELIVERY_MANAGER (manages Sam Rivera, Jordan Lee)');
  console.log('    pm@a2rventures-demo.test      -> PROJECT_MANAGER (Maria Chen)');
  console.log('  projects: Global ERP Modernization (+ 2 waves), Customer Data Platform Rollout,');
  console.log('            Claims Automation Pilot, Field Service Mobile App');
  console.log('');
  console.log(`  org:      ${acme.name} (${acme.slug})`);
  console.log(`  password: ${DEMO_PASSWORD} (all 5 logins below)`);
  console.log('  logins:');
  console.log('    admin@acme-health.test        -> ADMIN (Alex Okafor)');
  console.log('    sponsor@acme-health.test      -> VP_EXECUTIVE (Sofia Reyes, Exec Sponsor)');
  console.log('    pd@acme-health.test           -> PRACTICE_DIRECTOR (Marcus Bell)');
  console.log('    lead@acme-health.test         -> DELIVERY_MANAGER (Dana Whitfield, Delivery Lead)');
  console.log('    pm@acme-health.test           -> PROJECT_MANAGER (Priyanka Nair)');
  console.log('  engagements: Cloud EHR Migration (Green), Data Platform Modernization (Yellow),');
  console.log('               Digital Front Door (Red)');
  console.log('');
  console.log('  A2R Ops Console (internal):');
  console.log(`    ops@a2rventures.com           -> isA2rStaff (no client membership) — password ${DEMO_PASSWORD}`);
  console.log(`    navinder@a2rventures.com      -> MASTER super-admin: isA2rStaff + OWNER/ADMIN in all ${allOrgs.length} orgs — password Password123!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
