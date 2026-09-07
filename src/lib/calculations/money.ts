/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 * Proprietary and confidential.
 */

/**
 * WP2 — exact-decimal arithmetic for the calculation engine.
 *
 * Every `$` amount and rate the engine computes is accumulated in
 * `decimal.js` (no IEEE-754 drift when summing hundreds of `hours × rate`
 * products or many `eacCost` rows), then rounded ONCE at its accounting
 * boundary. Percentages / ratios / hours are still plain `number` — they are
 * derived from the exact-decimal money values in a single operation and are
 * always displayed through a formatter, so they carry no accumulation risk.
 *
 * The engine stays database-client-independent: this imports `decimal.js`
 * directly (a pure math library), never `@prisma/client`.
 */
import Decimal from 'decimal.js';

// Engine-local config: generous working precision, HALF_UP at the boundary
// (the common invoicing convention). Cloned so we never mutate the global.
const Money = Decimal.clone({ precision: 34, rounding: Decimal.ROUND_HALF_UP });

/**
 * The type a money/rate value crosses the engine boundary as. `Decimal` is
 * accepted at runtime by `d()` but kept out of the *type* so the engine's
 * plain-data input shapes stay assignable to plain `number | string`
 * consumers (e.g. `src/lib/security/masking.ts`).
 */
export type DecimalInput = number | string;

/** Construct an exact Decimal from a number / string / Decimal-like. `null` /
 *  `undefined` / non-finite → `0` (mirrors `_internal.numOr`'s intent). */
export function d(v: DecimalInput | Decimal | { toString(): string } | null | undefined): Decimal {
  if (v === null || v === undefined) return new Money(0);
  try {
    if (typeof v === 'number') return Number.isFinite(v) ? new Money(v) : new Money(0);
    // string, decimal.js Decimal, a Decimal.clone() instance, or Prisma.Decimal
    const x = new Money(typeof v === 'string' ? v : v.toString());
    return x.isFinite() ? x : new Money(0);
  } catch {
    return new Money(0);
  }
}

/** Round a Decimal to a `$` amount — 2 dp, HALF_UP. */
export function roundMoney(v: Decimal): Decimal {
  return v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

type DLike = DecimalInput | Decimal;

/** A `$` amount as a plain `number`, correctly rounded to cents. Exact —
 *  any `X.XX` value fits an IEEE-754 double without loss. */
export function money(v: DLike): number {
  return roundMoney(d(v)).toNumber();
}

/** Exact sum of a list of Decimals (no float accumulation). */
export function sumMoney(values: Decimal[]): Decimal {
  return values.reduce((acc, v) => acc.plus(v), new Money(0));
}

/** A rate ($/hr) as a plain `number` — full precision, no engine rounding
 *  (rates are always shown via a formatter that rounds for display). */
export function rate(v: DLike): number {
  return d(v).toNumber();
}

export { Decimal };
