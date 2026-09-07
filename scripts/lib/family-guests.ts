/**
 * A2R — the family guest / observer roster.
 *
 * Shared by scripts/seed-guests.ts (create the accounts as strict read-only
 * VIEWERs) and scripts/set-guest-access.ts (flip the whole roster between
 * the `viewer` launch posture and pre-launch `full` build-feedback access).
 *
 * Adding a family member: add one row here, then
 *   npm run guests:access -- --tier full --yes-prod
 * which creates any missing account (shared password) and promotes it.
 */
export const SHARED_PASSWORD = 'a2r-DOS-233444';

export interface FamilyGuest {
  name: string;
  email: string;
}

export const FAMILY_GUESTS: readonly FamilyGuest[] = [
  { name: 'Abha', email: 'abha@a2rventures.local' },
  { name: 'Janvi', email: 'janvi@a2rventures.local' },
  { name: 'Honey', email: 'honey@a2rventures.local' },
  { name: 'Griffin', email: 'griffin@a2rventures.local' },
  { name: 'Chan', email: 'chan@a2rventures.local' },
  { name: 'Lucky', email: 'lucky@a2rventures.local' },
  { name: 'Angad', email: 'angad@a2rventures.local' },
  { name: 'Mani', email: 'mani@a2rventures.local' },
  { name: 'Urvashi', email: 'urvashi@a2rventures.local' },
  { name: 'Ananya', email: 'ananya@a2rventures.local' },
] as const;

export const FAMILY_GUEST_EMAILS: readonly string[] = FAMILY_GUESTS.map((g) => g.email);
