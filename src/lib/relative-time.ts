/**
 * Compact relative timestamps for the Active Stream — "just now", "5m",
 * "3h", "2d", then an absolute short date once it's older than a week.
 * Pure; `now` is injectable for tests.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function relativeTime(iso: string | Date, now: Date = new Date()): string {
  const then = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(then.getTime())) return '';

  const deltaMs = now.getTime() - then.getTime();
  if (deltaMs < 0) return 'just now';

  const sec = Math.floor(deltaMs / 1000);
  if (sec < 45) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;

  const sameYear = then.getFullYear() === now.getFullYear();
  const base = `${MONTHS[then.getMonth()]} ${then.getDate()}`;
  return sameYear ? base : `${base}, ${then.getFullYear()}`;
}
