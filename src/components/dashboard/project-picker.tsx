import Link from 'next/link';
import { requireOrgContext } from '@/lib/session';
import { db } from '@/lib/db';

/**
 * Shared "pick a project" landing for module index routes
 * (/commercial-baseline, /audit, /raid, /financials, /schedule) — each
 * module operates on one project at a time, addressed as
 * /<module>/[projectId].
 */
export async function ProjectPicker({
  modulePath,
  moduleLabel,
  moduleDesc,
}: {
  modulePath: string;
  moduleLabel: string;
  moduleDesc: string;
}) {
  const { organizationId } = await requireOrgContext();
  const projects = await db.project.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, client: true },
  });

  return (
    <div className="card">
      <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">{moduleLabel}</div>
      <h2 className="text-[15.5px] font-bold mb-1">Select an engagement</h2>
      <p className="text-[12.5px] text-ink-muted mb-4">{moduleDesc}</p>
      {projects.length === 0 ? (
        <p className="text-ink-muted text-sm">
          No projects yet —{' '}
          <Link href="/" className="text-brand">
            register one from the Control Tower
          </Link>
          .
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`${modulePath}/${p.id}`}
                className="flex items-center justify-between bg-surface-2 rounded-sm px-3 py-2.5 text-sm hover:border-brand border border-transparent transition-colors"
              >
                <span className="font-semibold">{p.name}</span>
                <span className="text-ink-muted text-xs">{p.client || '—'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
