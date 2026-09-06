import { describe, it, expect, vi } from 'vitest';
import { withTimeout, TimeoutError } from '@/lib/util/with-timeout';

describe('withTimeout', () => {
  it('resolves with the value when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve(42), 50)).resolves.toBe(42);
  });

  it('propagates a rejection from the wrapped promise', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 50)).rejects.toThrow('boom');
  });

  it('rejects with TimeoutError when the promise is too slow', async () => {
    vi.useFakeTimers();
    const slow = new Promise((r) => setTimeout(r, 10_000));
    const raced = withTimeout(slow, 100, 'db query');
    const assertion = expect(raced).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(150);
    await assertion;
    vi.useRealTimers();
  });

  it('the TimeoutError message names the label and the budget', () => {
    const e = new TimeoutError(2500, 'session-state lookup');
    expect(e.message).toBe('session-state lookup timed out after 2500ms');
    expect(e.name).toBe('TimeoutError');
  });
});
