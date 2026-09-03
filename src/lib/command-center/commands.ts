/**
 * Command Bar — natural-language → intent resolution.
 *
 * Pure and testable. `resolveCommand(raw, ctx)` returns ranked suggestions;
 * the CommandBar component renders them and executes the chosen one
 * (navigate / open search / sign out).
 *
 * It understands three shapes:
 *   • a bare destination        "raid", "capacity", "go to financials"
 *   • an action                 "search", "sign out", "ops console"
 *   • a module + engagement     "financials for Acme", "audit on Contoso"
 * plus a fuzzy match on engagement names for anything left over.
 */
import { fuzzyFilter } from '@/lib/fuzzy-match';

export interface CommandContext {
  /** id + name of every engagement in the caller's scope. */
  projects: { id: string; name: string }[];
  /** A2R staff — unlocks the Ops Console command. */
  isStaff: boolean;
}

export type CommandAction =
  | { type: 'navigate'; href: string }
  | { type: 'search' }
  | { type: 'signout' };

export interface CommandSuggestion {
  id: string;
  label: string;
  hint?: string;
  kind: 'nav' | 'action' | 'engagement';
  action: CommandAction;
}

interface RouteDef {
  keys: string[];
  label: string;
  href: string;
  staffOnly?: boolean;
}

const ROUTES: RouteDef[] = [
  { keys: ['command center', 'command', 'pulse', 'stream'], label: 'Command Center', href: '/command' },
  { keys: ['control tower', 'tower', 'portfolio', 'home', 'dashboard'], label: 'Control Tower', href: '/' },
  { keys: ['capacity', 'resource', 'resources', 'utilization', 'bench', 'forecast'], label: 'Resource & Capacity', href: '/capacity' },
  { keys: ['commercial baseline', 'baseline', 'sizing', 'deal', 'scope'], label: 'Commercial Baseline', href: '/commercial-baseline' },
  { keys: ['control audit', 'audit', 'controls', 'stage gate'], label: 'Control Audit', href: '/audit' },
  { keys: ['raid', 'risk', 'risks', 'issues', 'dependencies'], label: 'RAID Cockpit', href: '/raid' },
  { keys: ['financials', 'financial realization', 'eac', 'margin', 'burn'], label: 'Financial Realization', href: '/financials' },
  { keys: ['schedule', 'milestones', 'timeline', 'phases'], label: 'Schedule & Milestones', href: '/schedule' },
  { keys: ['reports', 'executive hub', 'briefing', 'steerco'], label: 'Executive Hub', href: '/reports' },
  { keys: ['methodology', 'playbook', 'reference', 'guidance'], label: 'Methodology Reference', href: '/methodology' },
  { keys: ['admin', 'org setup', 'settings', 'roster', 'rate card'], label: 'Admin & Org Setup', href: '/admin' },
  { keys: ['compliance ledger', 'ledger', 'audit log', 'soc 2', 'soc2'], label: 'Compliance Ledger', href: '/admin/audit-log' },
  { keys: ['ingestion', 'templates', 'import', 'intake'], label: 'Data Ingestion & Templates', href: '/admin/ingestion' },
  { keys: ['ops', 'ops console', 'operator', 'tenants', 'telemetry'], label: 'A2R Ops Console', href: '/ops', staffOnly: true },
];

/** module keyword → route segment, for "<module> for <engagement>". */
const MODULE_SEGMENTS: { keys: string[]; seg: string; label: string }[] = [
  { keys: ['baseline', 'commercial', 'sizing', 'scope'], seg: 'commercial-baseline', label: 'Commercial Baseline' },
  { keys: ['audit', 'controls', 'stage gate'], seg: 'audit', label: 'Control Audit' },
  { keys: ['raid', 'risk', 'risks'], seg: 'raid', label: 'RAID' },
  { keys: ['financials', 'financial', 'eac', 'margin', 'burn'], seg: 'financials', label: 'Financial Realization' },
  { keys: ['schedule', 'milestones', 'timeline'], seg: 'schedule', label: 'Schedule' },
];

const ACTIONS: { keys: string[]; label: string; action: CommandAction }[] = [
  { keys: ['search', 'find', 'lookup', 'jump'], label: 'Open search', action: { type: 'search' } },
  { keys: ['sign out', 'log out', 'logout', 'exit'], label: 'Sign out', action: { type: 'signout' } },
];

const VERB_PREFIX = /^(?:go(?:\s+to)?|open|show(?:\s+me)?|nav(?:igate)?(?:\s+to)?|jump\s+to|take\s+me\s+to)\s+/;

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function bestProject(text: string, projects: CommandContext['projects']) {
  return fuzzyFilter(text, projects, (p) => p.name, 1)[0];
}

const DEFAULTS: RouteDef[] = ROUTES.filter((r) =>
  ['/command', '/', '/capacity', '/raid', '/financials'].includes(r.href)
);

export function resolveCommand(raw: string, ctx: CommandContext): CommandSuggestion[] {
  const routes = ROUTES.filter((r) => !r.staffOnly || ctx.isStaff);
  const q = norm(raw).replace(VERB_PREFIX, '');

  if (!q) {
    return DEFAULTS.map((r) => ({
      id: `nav:${r.href}`,
      label: r.label,
      hint: 'Go',
      kind: 'nav' as const,
      action: { type: 'navigate' as const, href: r.href },
    }));
  }

  const out: CommandSuggestion[] = [];
  const seen = new Set<string>();
  const push = (s: CommandSuggestion) => {
    if (seen.has(s.id)) return;
    seen.add(s.id);
    out.push(s);
  };

  // "<module> for <engagement>"
  const forMatch = q.match(/^(.+?)\s+(?:for|on|of|in)\s+(.+)$/);
  if (forMatch) {
    const mod = MODULE_SEGMENTS.find((m) => m.keys.some((k) => forMatch[1]!.includes(k)));
    const proj = bestProject(forMatch[2]!, ctx.projects);
    if (mod && proj) {
      push({
        id: `mod:${mod.seg}:${proj.id}`,
        label: `${mod.label} · ${proj.name}`,
        hint: 'Open',
        kind: 'engagement',
        action: { type: 'navigate', href: `/${mod.seg}/${proj.id}` },
      });
    }
  }

  // destination keyword matches (prefix / containment either way)
  for (const r of routes) {
    if (r.keys.some((k) => k.startsWith(q) || q.startsWith(k) || (q.length >= 3 && k.includes(q)))) {
      push({
        id: `nav:${r.href}`,
        label: r.label,
        hint: 'Go',
        kind: 'nav',
        action: { type: 'navigate', href: r.href },
      });
    }
  }

  // actions
  for (const a of ACTIONS) {
    if (a.keys.some((k) => k.startsWith(q) || q.startsWith(k))) {
      push({ id: `act:${a.label}`, label: a.label, hint: 'Run', kind: 'action', action: a.action });
    }
  }

  // engagement name fuzzy
  for (const p of fuzzyFilter(q, ctx.projects, (x) => x.name, 4)) {
    push({
      id: `eng:${p.id}`,
      label: p.name,
      hint: 'Open engagement',
      kind: 'engagement',
      action: { type: 'navigate', href: `/commercial-baseline/${p.id}` },
    });
  }

  return out.slice(0, 7);
}
