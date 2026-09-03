/**
 * A2R Operator Control Plane — the pure "is this an A2R staff account?"
 * predicate, kept dependency-free so both the NextAuth jwt callback
 * (src/lib/auth.ts) and the request-time guard (src/lib/ops-auth.ts) can
 * use it without an import cycle.
 *
 * An account is A2R staff if EITHER its User.isA2rStaff flag is set OR its
 * email is on the A2R Ventures corporate domain — the email path lets the
 * very first operator sign in and reach /ops before anyone has flipped a
 * boolean in the database.
 */
export const A2R_STAFF_EMAIL_DOMAINS = ['a2rventures.com'] as const;

export function isA2rStaffEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const domain = email.toLowerCase().trim().split('@')[1];
  return domain != null && (A2R_STAFF_EMAIL_DOMAINS as readonly string[]).includes(domain);
}

export function resolveIsA2rStaff(input: { email?: string | null; isA2rStaff?: boolean | null }): boolean {
  return input.isA2rStaff === true || isA2rStaffEmail(input.email);
}
