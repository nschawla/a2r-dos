/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Generates src/lib/ops/docs-hub-content.generated.ts — the raw markdown
 * content the in-app Documentation Hub (/ops/docs) renders, baked in as
 * plain string exports at BUILD time (not read from the filesystem at
 * runtime).
 *
 * Why build-time, not a runtime `fs.readFileSync`: a Next.js route on
 * Vercel runs in a serverless function whose file bundle is determined by
 * static-import tracing — a dynamic `fs` read of a project file by path is
 * not guaranteed to be included in that bundle (it works in local `next
 * dev`, where the whole repo is on disk, and can silently 404/throw in
 * production). A generated TS module with the content as string literals
 * needs no special bundler configuration and behaves identically in dev
 * and prod, at the cost of one manual step (this script) after editing a
 * doc the hub shows.
 *
 * `npm run build` always runs this first (see package.json's `build`
 * script), so a real production build can never ship stale content
 * regardless of whether anyone remembered to. For local `next dev`, run
 * it manually after editing a curated doc:
 *   npm run docs:hub:build
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');

export interface CuratedDoc {
  /** URL-safe id, used for the ?doc= query param and as the React key. */
  slug: string;
  /** Repo-relative path, from the project root. */
  file: string;
  category: string;
}

/** Category display order matches this array's order, top to bottom in
 * the hub's sidebar — deliberately curated, not "every file in docs/":
 * internal single-topic runbooks (RLS_ENFORCEMENT_RUNBOOK.md, SESSION_
 * STATE_MACHINE.md, …) stay repo-only rather than cluttering an
 * executive/support-facing hub with content neither audience needs. */
export const CURATED_DOCS: CuratedDoc[] = [
  { slug: 'erd', file: 'docs/ERD.md', category: 'Architecture' },
  { slug: 'tenant-model-inventory', file: 'docs/TENANT_MODEL_INVENTORY.md', category: 'Architecture' },
  { slug: 'data-access-layer', file: 'docs/DATA_ACCESS_LAYER.md', category: 'Architecture' },

  { slug: 'rtm', file: 'docs/RTM.md', category: 'Requirements Traceability (RTM)' },
  { slug: 'frd', file: 'docs/FRD.md', category: 'Requirements Traceability (RTM)' },

  { slug: 'executive-triage-standard', file: 'docs/EXECUTIVE_TRIAGE_STANDARD.md', category: 'Module Specs' },
  { slug: 'raid-triage', file: 'docs/RAID_EXECUTIVE_TRIAGE.md', category: 'Module Specs' },
  { slug: 'financial-triage', file: 'docs/FINANCIAL_REALIZATION_TRIAGE.md', category: 'Module Specs' },
  { slug: 'schedule-triage', file: 'docs/SCHEDULE_MILESTONES_TRIAGE.md', category: 'Module Specs' },
  { slug: 'resource-triage', file: 'docs/RESOURCE_CAPACITY_TRIAGE.md', category: 'Module Specs' },
  { slug: 'commercial-triage', file: 'docs/COMMERCIAL_BASELINE_TRIAGE.md', category: 'Module Specs' },
  { slug: 'portfolio-orchestration', file: 'docs/PORTFOLIO_ORCHESTRATION.md', category: 'Module Specs' },
  { slug: 'ui-design-system', file: 'docs/UI_DESIGN_SYSTEM.md', category: 'Module Specs' },

  { slug: 'test-coverage', file: 'docs/TEST_COVERAGE.md', category: 'QA & Testing' },
  { slug: 'uat-test-runbook', file: 'docs/UAT_TEST_RUNBOOK.md', category: 'QA & Testing' },

  { slug: 'implementation-guide', file: 'docs/IMPLEMENTATION_GUIDE.md', category: 'Implementation Guide' },
  { slug: 'vercel-deployment', file: 'docs/VERCEL_DEPLOYMENT.md', category: 'Implementation Guide' },

  { slug: 'changelog', file: 'CHANGELOG.md', category: 'Release Notes' },

  { slug: 'client-support-runbook', file: 'docs/CLIENT_SUPPORT_RUNBOOK.md', category: 'Operations & Support' },
  { slug: 'security', file: 'docs/SECURITY.md', category: 'Operations & Support' },
  { slug: 'role-access-matrix', file: 'docs/ROLE_ACCESS_MATRIX.md', category: 'Operations & Support' },
  { slug: 'demo-walkthrough', file: 'docs/DEMO_WALKTHROUGH.md', category: 'Operations & Support' },
];

export const CATEGORY_ORDER = [...new Set(CURATED_DOCS.map((d) => d.category))];

/** The doc's own first `# Heading` line, stripped of markdown emphasis —
 * falls back to the slug if a file somehow has none. */
function titleFor(content: string, slug: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  if (!match) return slug;
  return match[1]!.replace(/[*_`]/g, '').trim();
}

function main(): void {
  const entries = CURATED_DOCS.map(({ slug, file, category }) => {
    const content = readFileSync(join(root, file), 'utf8');
    return { slug, file, category, title: titleFor(content, slug), content };
  });

  const body = entries
    .map(
      (e) =>
        `  { slug: ${JSON.stringify(e.slug)}, file: ${JSON.stringify(e.file)}, category: ${JSON.stringify(
          e.category
        )}, title: ${JSON.stringify(e.title)}, content: ${JSON.stringify(e.content)} },`
    )
    .join('\n');

  const out = `/**
 * GENERATED — do not hand-edit. Run \`npm run docs:hub:build\` after
 * changing any file scripts/build-docs-hub.ts's CURATED_DOCS lists, or
 * after editing one of those files' content. Source of truth for what's
 * curated: scripts/build-docs-hub.ts.
 */

export interface DocsHubEntry {
  slug: string;
  file: string;
  category: string;
  title: string;
  content: string;
}

export const DOCS_HUB_CATEGORY_ORDER: readonly string[] = ${JSON.stringify(CATEGORY_ORDER)};

export const DOCS_HUB_ENTRIES: readonly DocsHubEntry[] = [
${body}
];
`;

  const outPath = join(root, 'src/lib/ops/docs-hub-content.generated.ts');
  writeFileSync(outPath, out, 'utf8');
  console.log(`[docs-hub] wrote ${entries.length} entries to ${outPath}`);
}

main();
