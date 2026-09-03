/**
 * Private helpers shared across the calculation engine. Not part of the
 * public API (see index.ts) — import from the module files, not this one.
 */

/**
 * Coerces `v` to a finite number, falling back otherwise.
 *
 * Deliberately treats `null` the same as `undefined` (both fall back). The
 * prototype's original `numOr` only ever saw JS objects where an unset
 * field was simply absent (`undefined`), so `Number(v)` failing was the
 * only fallback path. Here, values round-trip through Postgres nullable
 * columns and arrive as explicit `null` — and `Number(null) === 0`, which
 * is finite, so a naive port would silently turn "not provided" into a
 * real zero. Guarding for `null` up front is required for correctness,
 * not a stylistic choice.
 */
export function numOr(v: unknown, fallback: number): number {
  if (v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Accepts a Date or an ISO-ish string/number and always returns a Date. */
export function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

export const MS_PER_DAY = 86_400_000;
