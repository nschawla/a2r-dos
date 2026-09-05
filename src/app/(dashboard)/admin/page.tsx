import Link from 'next/link';
import { requireOrgContext } from '@/lib/session';
import { db } from '@/lib/db';
import { CONTROL_DEFS } from '@/lib/constants';
import { verifyLedgerIntegrity } from '@/lib/audit-ledger';
import { canViewCostRates } from '@/lib/security/masking';
import { hasPermission } from '@/lib/auth/rbac';
import { ModuleTabs } from '@/components/ui/module-tabs';
import {
  PracticesPanel,
  RolesPanel,
  ResourcesPanel,
  PolicyPanel,
  ControlLabelsPanel,
  GovernancePanel,
} from './admin-panels';
import { WorkspaceBackup } from '@/components/admin/WorkspaceBackup';

export default async function AdminPage() {
  const { organizationId, role, deliveryRole, governance } = await requireOrgContext();
  const canEdit = role === 'OWNER' || role === 'ADMIN';
  // WP6 — Workspace Backup & Restore is gated on the real DeliveryRole
  // 'admin:workspace' permission (src/server/authz.ts#authorizeAdminAction),
  // a stricter and independent axis from the legacy MembershipRole
  // `canEdit` above that gates the rest of this page's panels.
  const canManageWorkspace = hasPermission(deliveryRole, 'admin:workspace');

  const [practices, roles, resources, policy, controlLabels, ledgerIntegrity] = await Promise.all([
    db.practice.findMany({ where: { organizationId }, orderBy: { name: 'asc' } }),
    db.deliveryRole.findMany({ where: { organizationId }, orderBy: { name: 'asc' } }),
    db.resource.findMany({ where: { organizationId }, orderBy: { name: 'asc' }, include: { role: true, practice: true } }),
    db.orgPolicy.findUnique({ where: { organizationId } }),
    db.controlLabel.findMany({ where: { organizationId } }),
    verifyLedgerIntegrity(organizationId),
  ]);

  const labelByKey = new Map(controlLabels.map((c) => [c.controlKey, c.label]));

  return (
    <>
      <div>
        <h1 className="text-2xl font-display font-bold">Admin &amp; Org Setup</h1>
        <p className="text-ink-muted text-sm mt-1">
          The enterprise roster and governance framework every engagement draws from.
        </p>
        {!canEdit && <p className="text-warning text-xs mt-2">You have view-only access to org setup.</p>}
      </div>

      <Link
        href="/admin/onboarding"
        className="card flex items-center justify-between gap-4 hover:border-brand/50 transition-colors"
      >
        <div>
          <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Guided Setup</div>
          <h2 className="text-[15.5px] font-bold">Onboarding Journey</h2>
          <p className="text-[12.5px] text-ink-muted mt-1 max-w-xl">
            A five-step walkthrough — provisioning, governance, base data, role mapping, and go-live — for setting up
            a new workspace or demoing the setup flow live.
          </p>
        </div>
        <span className="text-brand text-xs font-semibold flex-none">Open →</span>
      </Link>

      <Link
        href="/admin/kpis"
        className="card flex items-center justify-between gap-4 hover:border-brand/50 transition-colors"
      >
        <div>
          <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Custom Metrics</div>
          <h2 className="text-[15.5px] font-bold">Custom KPIs</h2>
          <p className="text-[12.5px] text-ink-muted mt-1 max-w-xl">
            Bind your own metric cards to real financials, schedule, RAID, and capacity data, and assign them to the
            personas who should see them — cards render automatically on the portfolio dashboards they're bound to.
          </p>
        </div>
        <span className="text-brand text-xs font-semibold flex-none">Open →</span>
      </Link>

      <ModuleTabs
        tabs={[
          { key: 'roster', label: 'Roster' },
          { key: 'governance', label: 'Governance' },
          { key: 'data', label: 'Data & Compliance' },
        ]}
        panels={{
          roster: (
            <>
              <PracticesPanel practices={practices} canEdit={canEdit} />
              <RolesPanel
                roles={roles}
                practices={practices}
                canEdit={canEdit}
                canViewCost={canViewCostRates(deliveryRole, governance)}
              />
              <ResourcesPanel resources={resources} roles={roles} practices={practices} canEdit={canEdit} />
            </>
          ),
          governance: (
            <>
              <PolicyPanel
                policy={
                  policy ?? { slipWarnDays: 5, slipCritDays: 15, marginCritPct: 5, methodology: 'WATERFALL' as const }
                }
                canEdit={canEdit}
              />
              <GovernancePanel config={governance} canEdit={canEdit} />
              <ControlLabelsPanel controls={CONTROL_DEFS} labelByKey={labelByKey} canEdit={canEdit} />
            </>
          ),
          data: (
            <>
              <WorkspaceBackup canManage={canManageWorkspace} />

              <Link
                href="/admin/ingestion"
                className="card flex items-center justify-between gap-4 hover:border-brand/50 transition-colors"
              >
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">
                    Data Pipeline
                  </div>
                  <h2 className="text-[15.5px] font-bold">Data Ingestion &amp; Templates</h2>
                  <p className="text-[12.5px] text-ink-muted mt-1 max-w-xl">
                    Standardized CSV templates for the delivery roster, project baselines, and aggregated period
                    actuals — with the schema for each and the load rules.
                  </p>
                </div>
                <span className="text-brand text-xs font-semibold flex-none">Open →</span>
              </Link>

              <Link
                href="/admin/audit-log"
                className="card flex items-center justify-between gap-4 hover:border-brand/50 transition-colors"
              >
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">
                    Compliance
                  </div>
                  <h2 className="text-[15.5px] font-bold">SOC 2 Compliance Ledger</h2>
                  <p className="text-[12.5px] text-ink-muted mt-1 max-w-xl">
                    Tamper-evident, hash-chained record of every high-consequence governance action — baseline
                    &amp; stage-gate overrides, security-config and role-policy changes, tenant lifecycle.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-none">
                  <span
                    className={`badge !py-1 !px-2.5 ${
                      ledgerIntegrity.ok ? '!text-success !border-success/40' : '!text-critical !border-critical/40'
                    }`}
                  >
                    <span className={`status-dot ${ledgerIntegrity.ok ? 'bg-success' : 'bg-critical'}`} />
                    {ledgerIntegrity.ok ? 'Verified' : 'Broken'}
                  </span>
                  <span className="text-brand text-xs font-semibold">Open →</span>
                </div>
              </Link>

              <p className="text-[12px] text-ink-faint">
                Enterprise SSO / Identity Federation is now managed by A2R in the Ops Console as platform
                infrastructure — it is no longer configured here.
              </p>
            </>
          ),
        }}
      />
    </>
  );
}
