/**
 * Bound a promise with a timeout. On timeout the returned promise REJECTS
 * (with `TimeoutError`) — callers that need fail-closed semantics treat any
 * rejection as failure.
 *
 * Used by the session-state check in src/lib/auth.ts so a hung database
 * connection fails the session closed instead of hanging the request.
 */
export class TimeoutError extends Error {
  constructor(ms: number, label: string) {
    super(`${label} timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'operation'): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms, label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
