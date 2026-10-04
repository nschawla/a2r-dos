'use client';

/**
 * The interactive half of `<ProjectPicker>` (project-picker.tsx) — split
 * into its own client component because the picker itself is an async
 * Server Component (it queries Prisma directly) and `<SearchableSelect>`
 * needs client state + `useRouter`. The server half still owns all the
 * data fetching, scoping, and sorting; this just renders the choice and
 * navigates on select.
 */
import { SearchableSelect } from '@/components/ui/searchable-select';

const HEALTH_DOT: Record<string, string> = { G: 'bg-success', Y: 'bg-warning', R: 'bg-critical' };

export interface ProjectPickerRow {
  id: string;
  name: string;
  client: string | null;
  health: string;
  locked: boolean;
}

export function ProjectPickerSearch({ modulePath, rows }: { modulePath: string; rows: ProjectPickerRow[] }) {
  return (
    <SearchableSelect
      label="Select Engagement"
      placeholder="Search engagements…"
      options={rows.map((p) => ({
        id: p.id,
        label: p.name,
        sublabel: p.client,
        dotClassName: HEALTH_DOT[p.health],
        badge: p.locked ? 'Locked' : null,
      }))}
      selectedId={null}
      // Real <Link>s, not router.push on a button — preserves open-in-
      // new-tab and keeps this an <a href="/<module>/<id>"> a test (or a
      // screen reader) can find as a link, matching what the plain-list
      // version of this picker always rendered.
      getHref={(id) => `${modulePath}/${id}`}
    />
  );
}
