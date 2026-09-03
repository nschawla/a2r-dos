/**
 * Cmd+K result assembly — pure and testable.
 *
 * Merges the natural-language navigation resolver (resolveCommand) with
 * fuzzy entity search over people and open escalated risks into one flat,
 * ranked, sectioned list the palette renders. Engagement matches come from
 * resolveCommand and are enriched here with a health dot + client.
 */
import { fuzzyFilter } from '@/lib/fuzzy-match';
import { resolveCommand, type CommandAction, type CommandContext } from '@/lib/command-center/commands';

export type CommandKSection = 'Navigate' | 'Actions' | 'Engagements' | 'People' | 'Risks';
export type CommandKDot = 'good' | 'warn' | 'critical' | 'neutral';

export interface CommandKItem {
  id: string;
  label: string;
  sub?: string;
  section: CommandKSection;
  dot?: CommandKDot;
  action: CommandAction;
}

export interface CommandKEntities {
  projects: { id: string; name: string; client?: string | null; healthCode?: 'G' | 'Y' | 'R' }[];
  resources: { id: string; name: string; roleName?: string | null; practiceName?: string | null }[];
  raidAlerts: { id: string; projectId: string; projectName: string; description: string; severity: string }[];
  isStaff: boolean;
}

const HEALTH_DOT: Record<string, CommandKDot> = { G: 'good', Y: 'warn', R: 'critical' };
const SEVERITY_DOT: Record<string, CommandKDot> = {
  CRITICAL: 'critical',
  HIGH: 'warn',
  MED: 'neutral',
  LOW: 'neutral',
};

const SECTION_BY_KIND = { nav: 'Navigate', action: 'Actions', engagement: 'Engagements' } as const;

/** Last path segment of a navigate href, e.g. "/financials/p1" -> "p1". */
function lastSegment(href: string): string {
  return href.split('/').filter(Boolean).pop() ?? '';
}

/** The full ranked item list for the current query. Capped. */
export function buildCommandKItems(query: string, ctx: CommandKEntities, limit = 10): CommandKItem[] {
  const commandCtx: CommandContext = { projects: ctx.projects, isStaff: ctx.isStaff };
  const projectById = new Map(ctx.projects.map((p) => [p.id, p]));
  const items: CommandKItem[] = [];
  const seen = new Set<string>();
  const seenHrefs = new Set<string>();

  const add = (item: CommandKItem) => {
    if (seen.has(item.id)) return;
    if (item.action.type === 'navigate') {
      if (seenHrefs.has(item.action.href)) return;
      seenHrefs.add(item.action.href);
    }
    seen.add(item.id);
    items.push(item);
  };

  // 1 — navigation / actions / engagements (from the NL resolver)
  for (const s of resolveCommand(query, commandCtx)) {
    const base: CommandKItem = {
      id: s.id,
      label: s.label,
      sub: s.hint,
      section: SECTION_BY_KIND[s.kind],
      action: s.action,
    };
    if (s.kind === 'engagement' && s.action.type === 'navigate') {
      const project = projectById.get(lastSegment(s.action.href));
      if (project) {
        base.dot = project.healthCode ? HEALTH_DOT[project.healthCode] : undefined;
        base.sub = project.client ?? s.hint;
      }
    }
    add(base);
  }

  const q = query.trim();
  if (q.length >= 2) {
    // 2 — people
    for (const r of fuzzyFilter(q, ctx.resources, (x) => `${x.name} ${x.roleName ?? ''} ${x.practiceName ?? ''}`, 4)) {
      add({
        id: `cmdk-person:${r.id}`,
        label: r.name,
        sub: [r.roleName, r.practiceName].filter(Boolean).join(' · ') || 'No role assigned',
        section: 'People',
        dot: 'neutral',
        action: { type: 'navigate', href: '/admin' },
      });
    }

    // 3 — open escalated risks
    for (const a of fuzzyFilter(q, ctx.raidAlerts, (x) => `${x.description} ${x.projectName}`, 4)) {
      add({
        id: `cmdk-risk:${a.id}`,
        label: a.description.length > 90 ? `${a.description.slice(0, 90)}…` : a.description,
        sub: `${a.projectName} · SteerCo-escalated`,
        section: 'Risks',
        dot: SEVERITY_DOT[a.severity] ?? 'neutral',
        action: { type: 'navigate', href: `/raid/${a.projectId}` },
      });
    }
  }

  return items.slice(0, limit);
}

/** Group an item list by section, preserving order. */
export function groupCommandKItems(items: CommandKItem[]): { section: CommandKSection; items: CommandKItem[] }[] {
  const order: CommandKSection[] = [];
  const map = new Map<CommandKSection, CommandKItem[]>();
  for (const item of items) {
    if (!map.has(item.section)) {
      map.set(item.section, []);
      order.push(item.section);
    }
    map.get(item.section)!.push(item);
  }
  return order.map((section) => ({ section, items: map.get(section)! }));
}
