/** Shared display formatters. Pure. */

/** `$1.43M` · `$640K` · `$0` — compact currency for headline figures. */
export function compactMoney(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return `${sign}$${Math.round(abs)}`;
}

/** A fraction (0.802) → "80.2%". */
export function pctFromFraction(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** An already-scaled percentage number (37.5) → "37.5%". */
export function pctFromNumber(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

/** Signed points delta: `+2.4 pts` / `-1.1 pts`. */
export function pointsDelta(points: number, digits = 1): string {
  return `${points >= 0 ? '+' : ''}${points.toFixed(digits)} pts`;
}
