/**
 * Pure persona constants + helpers, deliberately in a NON-client module so
 * they can be used from Server Components (e.g. the dashboard layout calling
 * defaultPersonaForRole). The React context/provider that consumes these
 * lives in ./dashboard-ui-context ('use client'), which re-exports this
 * module's surface so existing client imports keep working.
 *
 * Persona is a client-only RBAC UI simulation (the header's Persona
 * Switcher) — it is NOT Prisma's MembershipRole (OWNER/ADMIN/MEMBER/VIEWER),
 * the real server-enforced access tier. Persona never gates data fetching or
 * server actions; it only toggles what a given render shows.
 */
export const PERSONAS = [
  { key: 'ADMIN', label: 'Admin' },
  { key: 'PRACTICE_DIRECTOR', label: 'Practice Director' },
  { key: 'DELIVERY_MANAGER', label: 'Delivery Manager' },
  { key: 'PROJECT_MANAGER', label: 'Project Manager' },
  { key: 'EXECUTIVE_VIEWER', label: 'Executive Viewer' },
] as const;

export type Persona = (typeof PERSONAS)[number]['key'];

/** Personas allowed to lock/unlock a baseline and export governance artifacts in the UI simulation. */
export const PERSONAS_WITH_WRITE_ACCESS: readonly Persona[] = ['ADMIN', 'PRACTICE_DIRECTOR', 'DELIVERY_MANAGER'];

export const PERSONA_STORAGE_KEY = 'a2r_active_persona';

/** Reasonable starting persona for a freshly-loaded session, derived from the user's real Membership role. */
export function defaultPersonaForRole(role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'): Persona {
  switch (role) {
    case 'OWNER':
    case 'ADMIN':
      return 'ADMIN';
    case 'MEMBER':
      return 'PROJECT_MANAGER';
    case 'VIEWER':
      return 'EXECUTIVE_VIEWER';
  }
}
