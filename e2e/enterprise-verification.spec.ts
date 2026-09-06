import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 1 — Enterprise Verification E2E suite.
 *
 * Runs serially against one browser context so session + active-tenant
 * state carries between suites, mirroring a real operator walkthrough:
 *   A. Authentication & Master Access
 *   B. PS Control Tower & Multi-Tenant Scoping
 *   C. Engagement Governance deep dive (Commercial Baseline, Audit, RAID, Financials, Schedule) + Executive Hub on an Acme engagement
 *   D. A2R Ops Console (telemetry, tenants, provisioning)
 */

// Dedicated E2E super-admin (isA2rStaff + OWNER/ADMIN in every org) —
// deliberately NOT navinder@, whose password is a rotatable real
// credential. Seeded in prisma/seed.ts.
const MASTER_EMAIL = 'master.e2e@a2rventures.com';
const MASTER_PASSWORD = 'password12345';
const RUN_ID = Date.now();

let page: Page;
const pageErrors: string[] = [];

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  page = await context.newPage();
  page.on('pageerror', (err) => pageErrors.push(`[pageerror] ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push(`[console.error] ${msg.text()}`);
  });
});

test.afterAll(async () => {
  await page.context().close();
});

/** Fails if a Next.js runtime/server error overlay is on screen. */
async function expectNoErrorOverlay(p: Page) {
  const overlay = p.locator(
    'text=/Unhandled Runtime Error|Application error: a (client|server)-side exception|Internal Server Error|This page could not be found/i'
  );
  await expect(overlay).toHaveCount(0);
  await expect(p.locator('nextjs-portal')).toHaveCount(0);
}

/** Signs out the current session and signs in as another user. */
async function signInAs(p: Page, email: string, password: string) {
  await p.goto('/login');
  await p.locator('input[type="email"]').fill(email);
  await p.locator('input[type="password"]').fill(password);
  await p.getByRole('button', { name: 'Sign in' }).click();
  await p.waitForURL((u) => !/\/login|\/launch/.test(u.pathname), { timeout: 30_000 });
  await p.reload();
}

/** P1 JIT elevation — a standing operator grant only reaches the /ops read
 * views; every mutating ops action needs a live elevation. Idempotent:
 * skips if the elevation bar is already green. */
async function elevateOps(p: Page, reason = 'E2E automated run — ops verification walkthrough') {
  await p.goto('/ops/telemetry');
  const bar = p.locator('[data-elevation]');
  await bar.waitFor();
  if ((await bar.getAttribute('data-elevation')) === 'active') return;
  await bar.getByRole('button', { name: 'Elevate' }).click();
  const dialog = p.getByRole('dialog', { name: /Request privilege elevation/ });
  await dialog.locator('textarea').fill(reason);
  await dialog.getByRole('button', { name: '60 min' }).click();
  await dialog.getByRole('button', { name: 'Elevate', exact: true }).click();
  await expect(bar).toHaveAttribute('data-elevation', 'active', { timeout: 15_000 });
}

/** Opens the workspace switcher and moves the active tenant. Waits for the
 * switch Server Action to actually land (the dropdown only closes on ok). */
async function switchTenant(p: Page, tenantName: string) {
  const trigger = p.locator('header').getByRole('button').first();
  await trigger.click();
  await p.getByText('Your organizations').waitFor();
  await p.getByRole('button', { name: new RegExp(tenantName, 'i') }).click();
  await expect(p.getByText('Your organizations')).toBeHidden();
  await expect(p.locator('header').getByRole('button').first()).toContainText(tenantName);
  await p.reload();
  await expect(p.locator('header').getByRole('button').first()).toContainText(tenantName);
}

// ────────────────────────────────────────────────────────────────────────────
// Suite A — Authentication & Master Access
// ────────────────────────────────────────────────────────────────────────────
test.describe('Suite A — Authentication & Master Access', () => {
  test('A1 · master admin signs in and lands on the PS Control Tower', async () => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(MASTER_EMAIL);
    await page.locator('input[type="password"]').fill(MASTER_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await page.waitForURL((u) => !/\/login|\/launch/.test(u.pathname), { timeout: 30_000 });
    await expect(page).toHaveURL(/\/portfolio$/);
    await expect(page.getByRole('heading', { name: 'PS Control Tower', level: 1 })).toBeVisible();
    await expectNoErrorOverlay(page);
  });

  test('A2 · session resolves cleanly (no auth JSON error, valid session payload)', async () => {
    const res = await page.request.get('/api/auth/session');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body?.user?.email).toBe(MASTER_EMAIL);
    expect(body?.user?.isA2rStaff).toBe(true);
    expect(Array.isArray(body?.memberships)).toBe(true);
    expect(body.memberships.length).toBeGreaterThanOrEqual(2);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Suite B — PS Control Tower & Multi-Tenant Scoping
// ────────────────────────────────────────────────────────────────────────────
test.describe('Suite B — PS Control Tower & Multi-Tenant Scoping', () => {
  test('B1 · portfolio rollup stat cards render (TCV, Avg Baseline Margin, High-Risk)', async () => {
    await page.goto('/portfolio');
    await expect(page.getByText('Total Contract Value')).toBeVisible();
    await expect(page.getByText('Avg. Baseline Margin')).toBeVisible();
    await expect(page.getByText('High-Risk (Red) Projects')).toBeVisible();
    await expect(page.getByText('Engagements in Scope')).toBeVisible();

    // TCV card shows a $ figure
    const tcvCard = page.locator('.card', { hasText: 'Total Contract Value' });
    await expect(tcvCard.locator('.text-2xl')).toContainText('$');
  });

  test('B2 · parent program "Global ERP Modernization" with child waves in rollups + registry', async () => {
    await expect(page.getByRole('heading', { name: 'Parent Programs' })).toBeVisible();
    const rollupRow = page.locator('table tr', { hasText: 'Global ERP Modernization' }).first();
    await expect(rollupRow).toBeVisible();
    // "Waves" column > 0
    await expect(rollupRow.locator('td').nth(1)).not.toHaveText('0');

    // the engagement registry lives under the Control Tower's "Engagements" pill
    await page.getByRole('tab', { name: /Engagements/ }).click();
    await expect(page.getByRole('heading', { name: 'Active Projects' })).toBeVisible();
    const registry = page.locator('.card', { hasText: 'Active Projects' });
    await expect(registry.locator('tbody tr').first()).toBeVisible();
    await expect(registry).toContainText('Global ERP Modernization');
  });

  test('B3 · switching tenant to "Acme Health" re-scopes the portfolio', async () => {
    await switchTenant(page, 'Acme Health');
    await page.goto('/portfolio');
    await expect(page.getByRole('heading', { name: 'PS Control Tower', level: 1 })).toBeVisible();

    await page.getByRole('tab', { name: /Engagements/ }).click();
    const registry = page.locator('.card', { hasText: 'Active Projects' });
    await expect(registry).toContainText('Cloud EHR Migration');
    await expect(registry).toContainText('Data Platform Modernization');
    await expect(registry).toContainText('Digital Front Door');
    // A2R DOS Demo engagements must no longer appear
    await expect(registry).not.toContainText('Claims Automation Pilot');
    await expectNoErrorOverlay(page);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Suite C — Engagement Governance Deep Dive (active Acme engagement: "Data Platform Modernization")
// ────────────────────────────────────────────────────────────────────────────
test.describe('Suite C — Engagement Governance Deep Dive', () => {
  const ENGAGEMENT = 'Data Platform Modernization';
  let projectId = '';

  test('C0 · open the engagement from the Commercial Baseline index and capture its id', async () => {
    await page.goto('/commercial-baseline');
    await expect(page.getByRole('heading', { name: 'Commercial Baseline', level: 1 })).toBeVisible();
    await page.getByRole('link', { name: new RegExp(ENGAGEMENT) }).click();
    await page.waitForURL(/\/commercial-baseline\/[a-z0-9]+/i);
    const match = /\/commercial-baseline\/([a-z0-9]+)/i.exec(page.url());
    projectId = match?.[1] ?? '';
    expect(projectId.length).toBeGreaterThan(5);
  });

  test('C1 · Commercial Baseline: header, commercial setup, sizing matrix + scope table', async () => {
    await page.goto(`/commercial-baseline/${projectId}`);
    await expect(page.getByRole('heading', { name: 'Commercial Baseline', level: 1 })).toBeVisible();
    await expect(
      page.getByText('Contractual scope, baseline hours, sold margin, and agreed rate cards.')
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Commercial Setup', exact: true })).toBeVisible();
    await expect(page.getByText('Commercial model')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Universal Scope & Taxonomy Matrix' })).toBeVisible();
    // sizing workspace renders a mode banner + at least one rate/effort table
    await expect(page.getByText(/Matrix Mode|Direct Baseline Intake Mode/).first()).toBeVisible();
    await expect(page.locator('table').first().locator('tbody tr').first()).toBeVisible();
    await expectNoErrorOverlay(page);
  });

  test('C2 · Control Audit: checklist + weighted scoring + nomenclature', async () => {
    await page.goto(`/audit/${projectId}`);
    await expect(page.getByRole('heading', { name: 'Audit Completion', level: 1 })).toBeVisible();
    await expect(page.getByText('Weighted Compliance')).toBeVisible();
    await expect(page.getByText('Delivery controls & governance standards', { exact: false })).toBeVisible();
    // no rigid "10 Minimum / 10 controls" numbering leaks into the module UI
    await expect(page.locator('body')).not.toContainText('10 Minimum Controls');
    await expect(page.locator('body')).not.toContainText('10 minimum controls');
    // governance checklist status controls
    await expect(page.getByRole('button', { name: 'Partial' }).first()).toBeVisible();
    expect(await page.getByRole('button', { name: 'N/A' }).count()).toBeGreaterThan(0);

    // "Control Audit" nomenclature — old "10 Controls Audit" label is gone
    await page.goto('/audit');
    await expect(page.getByRole('heading', { name: 'Control Audit Intake', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Control Audit' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('10 Controls Audit');
    await expect(page.locator('body')).not.toContainText('10 Control Audit');
    await expect(page.locator('body')).not.toContainText('10 minimum controls');
    await expectNoErrorOverlay(page);
  });

  test('C3 · RAID Cockpit: counters, type filters, open items', async () => {
    await page.goto(`/raid/${projectId}`);
    await expect(page.getByRole('heading', { name: 'RAID Cockpit', level: 1 })).toBeVisible();
    await expect(page.getByText('Open Items')).toBeVisible();
    await expect(page.getByText('Flagged for SteerCo')).toBeVisible();
    for (const t of ['Risk', 'Assumption', 'Issue', 'Dependency']) {
      await expect(page.getByRole('button', { name: t, exact: true })).toBeVisible();
    }
    // at least one logged RAID row (severity badge) for this engagement
    await expect(page.locator('.badge').filter({ hasText: /CRITICAL|HIGH|MED|LOW/ }).first()).toBeVisible();

    // RTM C3 — Risk Matrix heatmap: Impact × Likelihood grid, 16 cells
    await expect(page.getByRole('heading', { name: 'Impact × Likelihood' })).toBeVisible();
    const cells = page.locator('button[title*="exposure"]');
    await expect(cells).toHaveCount(16);
    // a populated cell filters the list to that exposure band when clicked
    const populated = cells.filter({ hasText: /^[1-9]/ }).first();
    await expect(populated).toBeVisible();
    await populated.click();
    await expect(page.getByRole('button', { name: /✕/ }).first()).toBeVisible();
    await expect(page.locator('.card ul > li').first()).toBeVisible();
    await expect(page.locator('.card ul > li').first().locator('.badge', { hasText: 'Risk' })).toBeVisible();
    await expectNoErrorOverlay(page);
  });

  test('C4 · Financial Realization: EAC KPI cards + per-role hourly table', async () => {
    await page.goto(`/financials/${projectId}`);
    await expect(page.getByRole('heading', { name: 'Estimate at Completion (EAC)', level: 1 })).toBeVisible();
    for (const kpi of ['Actual Cost to Date', 'True EAC Cost', 'True EAC Margin', 'Margin Drift']) {
      await expect(page.getByText(kpi, { exact: true }).first()).toBeVisible();
    }
    // True EAC Margin card shows a % value
    await expect(page.locator('.card', { hasText: 'True EAC Margin' }).locator('.text-2xl').first()).toContainText('%');
    // hourly breakdown table
    for (const col of ['Baseline Hrs', 'Actual Hrs', 'Forecast Hrs Remaining', 'Open RR Hrs', 'EAC']) {
      await expect(page.getByRole('columnheader', { name: col, exact: true })).toBeVisible();
    }

    // RTM C4 — Planned vs. Actual burn curve renders from the weekly slot series
    await expect(page.getByRole('heading', { name: 'Planned vs. Actual Burn' })).toBeVisible();
    await expect(page.getByRole('img', { name: /cumulative burn curve/i })).toBeVisible();
    await expect(page.locator('.card', { hasText: 'Planned vs. Actual Burn' }).locator('svg path')).not.toHaveCount(0);
    await expectNoErrorOverlay(page);
  });

  test('C5 · Schedule & Milestones: phase table with variance/pace/status', async () => {
    await page.goto(`/schedule/${projectId}`);
    await expect(page.getByRole('heading', { name: 'Schedule & Milestone Burndown', level: 1 })).toBeVisible();
    for (const col of ['Phase', 'Planned Start', 'Planned End', 'Status', 'Slip', 'Pace Risk']) {
      await expect(page.getByRole('columnheader', { name: col, exact: true })).toBeVisible();
    }
    await expect(page.locator('table tbody tr').first()).toBeVisible();
    await expectNoErrorOverlay(page);
  });

  test('C6 · Executive Briefing Hub — 4-section briefing + print action, no runtime exception', async () => {
    const before = pageErrors.length;
    await page.goto('/reports');
    await expect(page.getByRole('heading', { name: 'Executive Briefing Hub', level: 1 })).toBeVisible();

    // the print-optimised portfolio briefing
    await expect(page.getByRole('button', { name: 'Print / Export Executive Briefing' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /1 · Executive Summary & Macro KPIs/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /2 · Resource Economics & Concurrency Risk/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /3 · Financial Realization & Burn Health/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /4 · Critical Risk Register/ })).toBeVisible();
    await expect(page.locator('.exec-briefing').getByText('Total Contract Value')).toBeVisible();
    await expect(page.locator('.exec-briefing').getByText('Delivery Risk Distribution')).toBeVisible();
    await expect(page.locator('.exec-briefing svg[aria-label*="burn"]')).toBeVisible();

    // per-engagement tooling lives under the "Engagement Reports" pill
    await page.getByRole('tab', { name: /Engagement Reports/ }).click();
    await expect(page.getByRole('heading', { name: 'SteerCo Decks, Margin Rollups & Compliance Certificates' })).toBeVisible();
    await expectNoErrorOverlay(page);

    // also reachable deep-linked from a module ProjectHeader
    await page.goto(`/reports?project=${projectId}`);
    await expect(page.getByRole('heading', { name: 'Executive Briefing Hub', level: 1 })).toBeVisible();
    await expectNoErrorOverlay(page);
    expect(pageErrors.slice(before)).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Suite D — A2R Ops Console
// ────────────────────────────────────────────────────────────────────────────
test.describe('Suite D — A2R Ops Console', () => {
  const NEW_TENANT = 'Enterprise Sanity Inc';
  const NEW_ADMIN_EMAIL = `founder+${RUN_ID}@enterprise-sanity.test`;

  test('D1 · /ops/telemetry renders platform metrics', async () => {
    // read views are reachable on a standing grant, unelevated
    await page.goto('/ops/telemetry');
    await expect(page.getByRole('heading', { name: 'Platform Telemetry', level: 1 })).toBeVisible();
    for (const m of ['Total Tenants', 'Total Active Engagements', 'Global Margin Average', 'At-Risk RAID Items']) {
      await expect(page.getByText(m, { exact: true })).toBeVisible();
    }
    await expect(page.locator('.card', { hasText: 'Total Tenants' }).locator('.text-2xl')).not.toBeEmpty();
    await expectNoErrorOverlay(page);
  });

  test('D2 · /ops/tenants lists organizations with status pills', async () => {
    await page.goto('/ops/tenants');
    await expect(page.getByRole('heading', { name: 'Tenants', level: 1 })).toBeVisible();
    const table = page.locator('table');
    await expect(table).toContainText('A2R DOS Demo');
    await expect(table).toContainText('Acme Health');
    await expect(table.getByText('Active').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Provision New Tenant' })).toBeVisible();
    await expectNoErrorOverlay(page);
  });

  test('D3 · provision "Enterprise Sanity Inc" and see it in the tenant list', async () => {
    await elevateOps(page); // provisioning is a mutating op — needs JIT elevation
    await page.goto('/ops/tenants');
    await page.getByRole('button', { name: 'Provision New Tenant' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('Contoso Health').fill(NEW_TENANT);
    await dialog.locator('select').selectOption('ENTERPRISE');
    await dialog.getByPlaceholder('Jordan Reyes').fill('Sanity Founder');
    await dialog.getByPlaceholder('admin@contoso.com').fill(NEW_ADMIN_EMAIL);
    await dialog.getByRole('button', { name: 'Provision tenant' }).click();

    await expect(dialog.getByText('Tenant provisioned')).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByText(NEW_ADMIN_EMAIL)).toBeVisible();
    await dialog.getByRole('button', { name: 'Done' }).click();

    await expect(page.locator('table td', { hasText: NEW_TENANT }).first()).toBeVisible();
    await page.goto('/ops/telemetry');
    await expect(page.locator('table', { hasText: NEW_TENANT }).first()).toBeVisible();
    await expectNoErrorOverlay(page);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Suite E — Resource & Capacity Cockpit
// ────────────────────────────────────────────────────────────────────────────
test.describe('Suite E — Resource & Capacity Cockpit', () => {
  test.beforeAll(async () => {
    // back to the client workspace (Suite D left us in the ops console)
    await page.goto('/portfolio');
    await switchTenant(page, 'A2R DOS Demo');
  });

  test('E1 · PS Control Tower shows the Blended Billable Utilization KPI linking to /capacity', async () => {
    await page.goto('/portfolio');
    const kpi = page.locator('a[href="/capacity"]', { hasText: 'Blended Billable Utilization' });
    await expect(kpi).toBeVisible();
    await expect(kpi.locator('.text-2xl')).toContainText('%');
    await kpi.click();
    await page.waitForURL('**/capacity');
    await expect(page.getByRole('heading', { name: 'Resource & Capacity Cockpit', level: 1 })).toBeVisible();
  });

  test('E2 · Tab 1 Utilization & Attainment — blended KPI + practice breakdown', async () => {
    await page.goto('/capacity');
    for (const t of ['Utilization & Attainment', 'Concurrency Radar', '52-Week Forecast', 'Policy & Holiday Controls']) {
      await expect(page.getByRole('button', { name: t })).toBeVisible();
    }
    await expect(page.locator('.card', { hasText: 'Blended Billable Utilization' }).locator('.text-2xl').first()).toContainText('%');
    await expect(page.getByRole('heading', { name: 'Plan vs. Actual by Practice' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Attainment' })).toBeVisible();
    // modern domain-led practice taxonomy (no legacy "PS - *" department codes)
    await expect(page.getByText('TECH-Transformation').first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText('PS - ');
    await expectNoErrorOverlay(page);
  });

  test('E3 · Concurrency Radar + 52-Week Forecast tabs render their data', async () => {
    await page.goto('/capacity');
    await page.getByRole('button', { name: 'Concurrency Radar' }).click();
    await expect(page.getByRole('heading', { name: 'Active Engagements per Resource' })).toBeVisible();
    await expect(page.getByText(/Overloaded \( > 5 \)/)).toBeVisible();

    await page.getByRole('button', { name: '52-Week Forecast' }).click();
    await expect(page.getByRole('heading', { name: '52-Week Staffing Forecast' })).toBeVisible();
    // horizontally-scrolling weekly matrix: many column headers
    expect(await page.locator('table thead th').count()).toBeGreaterThan(40);
    await expectNoErrorOverlay(page);
  });

  test('E4 · Policy & Holiday Controls lists role targets and the 2026 holiday calendar', async () => {
    await page.goto('/capacity');
    await page.getByRole('button', { name: 'Policy & Holiday Controls' }).click();
    await expect(page.getByRole('heading', { name: 'Utilization Policy' })).toBeVisible();
    for (const role of ['Solution Architect', 'Delivery Staff', 'Director']) {
      await expect(page.getByRole('cell', { name: role, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: 'Corporate Holidays' })).toBeVisible();
    await expect(page.getByText('Independence Day (observed)')).toBeVisible();
    await expectNoErrorOverlay(page);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Suite F — Immutable Audit Logging & SOC 2 Compliance Ledger
// ────────────────────────────────────────────────────────────────────────────
test.describe('Suite F — SOC 2 Compliance Ledger', () => {
  test('F1 · Admin & Org Setup surfaces the Compliance Ledger with a Verified badge', async () => {
    await page.goto('/admin');
    await page.getByRole('tab', { name: /Data & Compliance/ }).click();
    const card = page.locator('a[href="/admin/audit-log"]', { hasText: 'SOC 2 Compliance Ledger' });
    await expect(card).toBeVisible();
    await expect(card.getByText('Verified')).toBeVisible();
    // sidebar entry
    await expect(page.getByRole('link', { name: 'Compliance Ledger', exact: true })).toBeVisible();
    await expectNoErrorOverlay(page);
  });

  test('F2 · /admin/audit-log renders the hash-chained ledger with a live integrity check', async () => {
    await page.goto('/admin/audit-log');
    await expect(page.getByRole('heading', { name: 'SOC 2 Compliance Ledger', level: 1 })).toBeVisible();
    await expect(page.getByText('Ledger Integrity: Verified')).toBeVisible();
    await expect(page.getByText(/unbroken SHA-256 chain/)).toBeVisible();
    await expect(page.getByText('Chain head fingerprint')).toBeVisible();

    // the immutable event table
    await expect(page.getByRole('heading', { name: 'Recent Audit Events' })).toBeVisible();
    for (const col of ['Actor', 'Action', 'Target', 'Record hash']) {
      await expect(page.getByRole('columnheader', { name: col, exact: true })).toBeVisible();
    }
    const rows = page.locator('table tbody tr');
    expect(await rows.count()).toBeGreaterThan(0);
    // the oldest entry is the genesis of the chain
    await expect(page.getByText('⟨genesis⟩→').first()).toBeVisible();
    await expect(page.locator('.badge', { hasText: 'Baseline override' }).first()).toBeVisible();
    await expectNoErrorOverlay(page);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Suite G — Methodology Playbook & Control Guidance
// ────────────────────────────────────────────────────────────────────────────
test.describe('Suite G — Methodology Playbook', () => {
  test('G1 · a control guidance drawer opens from the audit checklist', async () => {
    await page.goto('/audit');
    await expect(page.getByRole('heading', { name: 'Control Audit Intake', level: 1 })).toBeVisible();
    await page.getByRole('link', { name: /Claims Automation Pilot/ }).click();
    await page.waitForURL(/\/audit\/[a-z0-9]+/i);
    await expect(page.getByRole('heading', { name: 'Audit Completion', level: 1 })).toBeVisible();

    // the `i` info trigger next to a control
    const infoBtn = page.getByRole('button', { name: /Delivery guidance for/ }).first();
    await expect(infoBtn).toBeVisible();
    await infoBtn.click();

    const drawer = page.getByRole('dialog', { name: /Delivery guidance/ });
    await expect(drawer.getByText('Methodology Playbook')).toBeVisible();
    await expect(drawer.getByRole('heading', { name: 'Objective' })).toBeVisible();
    await expect(drawer.getByRole('heading', { name: 'Required Artifacts / Evidence' })).toBeVisible();
    await expect(drawer.getByRole('heading', { name: 'Verification Criteria' })).toBeVisible();
    await expect(drawer.getByRole('heading', { name: 'Lifecycle Gate' })).toBeVisible();

    await drawer.getByRole('button', { name: 'Close guidance' }).click();
    await expect(drawer).toBeHidden();
    await expectNoErrorOverlay(page);
  });

  test('G2 · Methodology Reference lists the full framework by lifecycle gate', async () => {
    await page.goto('/methodology');
    await expect(page.getByRole('heading', { name: 'Methodology Reference', level: 1 })).toBeVisible();
    await expect(page.getByText('Lifecycle Gates')).toBeVisible();
    for (const gate of [/Phase 0.*Initiation/, /^In-Flight$/, /^Closure$/]) {
      await expect(page.getByRole('heading', { name: gate })).toBeVisible();
    }
    // all ten controls rendered
    for (let i = 1; i <= 10; i++) {
      const key = `CTRL_${String(i).padStart(2, '0')}`;
      await expect(page.locator(`article[data-control="${key}"]`)).toBeVisible();
    }
    // v1.2.3 — Methodology Reference is NOT a top-level Reporting nav item
    // (no sidebar link); it lives in-context under Control Audit.
    await expect(page.getByRole('link', { name: 'Methodology Reference', exact: true })).toHaveCount(0);
    await page.goto('/audit');
    await expect(page.getByRole('link', { name: 'Methodology Reference', exact: true })).toBeVisible();
    await expectNoErrorOverlay(page);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Suite H — Role-Based Data Masking & PII Security Controls
// (runs last — it signs out the master admin and stays as a restricted PM)
// ────────────────────────────────────────────────────────────────────────────
test.describe('Suite H — Role-Based Data Masking', () => {
  test('H1 · master admin (Partner) sees financials in full — no masking', async () => {
    await page.goto('/portfolio'); // Suite E left the active tenant on A2R DOS Demo
    await expect(page.locator('header').getByRole('button').first()).toContainText('A2R DOS Demo');
    await expect(page.locator('.card', { hasText: 'Avg. Baseline Margin' })).not.toContainText('••••');

    await page.goto('/financials');
    await page.getByRole('link', { name: /Customer Data Platform Rollout/ }).click();
    await page.waitForURL(/\/financials\/[a-z0-9]+/i);
    await expect(page.getByText('restricted to Partners', { exact: false })).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'Baseline Rate' })).toBeVisible();
    await expect(page.locator('table tbody td', { hasText: '/hr' }).first()).toBeVisible();
    await expectNoErrorOverlay(page);
  });

  test('H2 · a Project Manager sees cost rates, margins and variance masked', async () => {
    await signInAs(page, 'pm@a2rventures-demo.test', 'password12345');

    // Control Tower — the Avg. Baseline Margin KPI is masked
    await expect(page.locator('.card', { hasText: 'Avg. Baseline Margin' })).toContainText('••••');

    // Financials page — restricted notice + masked EAC margin + masked cost column
    await page.goto('/financials');
    await page.getByRole('link', { name: /Customer Data Platform Rollout/ }).click();
    await page.waitForURL(/\/financials\/[a-z0-9]+/i);
    await expect(page.getByText(/restricted to Partners/i).first()).toBeVisible();
    await expect(page.locator('.card', { hasText: 'True EAC Margin' })).toContainText('••••');
    await expect(page.locator('.card', { hasText: 'Contractor / 3rd-Party Exposure' })).toContainText('••••');
    // hours columns stay visible (not financially sensitive)
    await expect(page.getByRole('columnheader', { name: 'Actual Hrs' })).toBeVisible();
    // the burn curve (hours) still renders
    await expect(page.locator('svg[aria-label*="burn"]')).toBeVisible();
    await expectNoErrorOverlay(page);
  });

  test('H3 · the Executive Briefing masks cost/margin KPIs for a restricted role', async () => {
    await page.goto('/reports');
    await expect(page.getByRole('heading', { name: 'Executive Briefing Hub', level: 1 })).toBeVisible();
    await expect(page.locator('.exec-briefing').getByText(/restricted to Partners/i)).toBeVisible();
    await expect(page.locator('.exec-card', { hasText: 'Blended EAC Margin' })).toContainText('••••');
    // non-financial sections still fully visible
    await expect(page.getByRole('heading', { name: /4 · Critical Risk Register/ })).toBeVisible();
    await expect(page.locator('.exec-briefing').getByText('Delivery Risk Distribution')).toBeVisible();
    await expectNoErrorOverlay(page);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Suite I — Super-Admin Tenant & Data Sovereignty Engine
// (runs last — needs the master admin session; Suite H left us as a PM)
// ────────────────────────────────────────────────────────────────────────────
test.describe('Suite I — Tenant & Data Sovereignty', () => {
  const PURGE_TENANT = 'Purge Target Inc';
  const PURGE_ADMIN_EMAIL = `founder+purge${RUN_ID}@purge-target.test`;

  test.beforeAll(async () => {
    await signInAs(page, MASTER_EMAIL, MASTER_PASSWORD);
    await elevateOps(page); // Suite I is all mutating ops — impersonate / export / provision / purge
  });

  test('I1 · every tenant row exposes the actions menu (Suspend / Impersonate / Export / Purge)', async () => {
    await page.goto('/ops/tenants');
    const menuBtn = page.getByRole('button', { name: /Tenant actions for A2R DOS Demo/ });
    await expect(menuBtn).toBeVisible();
    await menuBtn.click();
    const menu = page.getByRole('menu', { name: /Actions for A2R DOS Demo/ });
    for (const item of ['Suspend', 'Impersonate (View As)', 'Export Data', 'Execute Purge']) {
      await expect(menu.getByRole('menuitem', { name: item, exact: true })).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await expectNoErrorOverlay(page);
  });

  test('I2 · Impersonation Gateway opens a read-only tenant session with an audit-logged reason', async () => {
    await page.goto('/ops/tenants');
    await page.getByRole('button', { name: /Tenant actions for Acme Health/ }).click();
    await page.getByRole('menuitem', { name: 'Impersonate (View As)', exact: true }).click();

    const dialog = page.getByRole('dialog', { name: /Impersonate Acme Health/ });
    await dialog.getByRole('textbox').fill('E2E check — investigating ticket 4821');
    await dialog.getByRole('button', { name: 'Start read-only session' }).click();

    await page.waitForURL((u) => !/\/ops|\/launch/.test(u.pathname), { timeout: 30_000 });
    const banner = page.locator('div', { has: page.getByRole('button', { name: 'Exit impersonation' }) }).last();
    await expect(banner).toContainText('Impersonating');
    await expect(banner).toContainText('Acme Health');
    await expect(banner).toContainText('read-only');

    // the impersonation is on that tenant's compliance ledger
    await page.goto('/admin/audit-log');
    await expect(page.locator('.badge', { hasText: 'Admin impersonation access' }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Exit impersonation' }).click();
    await page.waitForURL(/\/ops\/tenants/);
    await expect(page.getByRole('button', { name: 'Exit impersonation' })).toHaveCount(0);
    await expectNoErrorOverlay(page);
  });

  test('I3 · Cryptographic Data Export requires type-to-confirm and returns a payload digest', async () => {
    await page.goto('/ops/tenants');
    await page.getByRole('button', { name: /Tenant actions for A2R DOS Demo/ }).click();
    await page.getByRole('menuitem', { name: 'Export Data', exact: true }).click();

    const dialog = page.getByRole('dialog', { name: /Export A2R DOS Demo data/ });
    const generate = dialog.getByRole('button', { name: 'Generate export package' });
    await expect(generate).toBeDisabled();
    await dialog.getByRole('textbox').fill('A2R DOS Demo');
    await expect(generate).toBeEnabled();
    await generate.click();

    await expect(dialog.getByText('Data export ready')).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByText('Payload digest:')).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Download .json' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expectNoErrorOverlay(page);
  });

  test('I4 · Purge Protocol soft-deletes a tenant and issues a Certificate of Destruction', async () => {
    // provision a throwaway tenant to purge
    await page.goto('/ops/tenants');
    await page.getByRole('button', { name: 'Provision New Tenant' }).click();
    const prov = page.getByRole('dialog');
    await prov.getByPlaceholder('Contoso Health').fill(PURGE_TENANT);
    await prov.getByPlaceholder('Jordan Reyes').fill('Purge Admin');
    await prov.getByPlaceholder('admin@contoso.com').fill(PURGE_ADMIN_EMAIL);
    await prov.getByRole('button', { name: 'Provision tenant' }).click();
    await expect(prov.getByText('Tenant provisioned')).toBeVisible({ timeout: 30_000 });
    await prov.getByRole('button', { name: 'Done' }).click();
    await expect(page.locator('table td', { hasText: PURGE_TENANT }).first()).toBeVisible();

    // purge it
    await page.getByRole('button', { name: new RegExp(`Tenant actions for ${PURGE_TENANT}`) }).click();
    await page.getByRole('menuitem', { name: 'Execute Purge', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: new RegExp(`Execute Purge Protocol — ${PURGE_TENANT}`) });
    const execute = dialog.getByRole('button', { name: 'Execute Purge Protocol' });
    await expect(execute).toBeDisabled();
    await dialog.getByRole('textbox').fill(PURGE_TENANT);
    await execute.click();

    await expect(dialog.getByText('Certificate of Destruction')).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByText('Certificate hash:')).toBeVisible();
    await dialog.getByRole('button', { name: 'Done' }).click();

    // gone from the fleet table
    await expect(page.locator('table td', { hasText: PURGE_TENANT })).toHaveCount(0);
    await expectNoErrorOverlay(page);
  });
});
