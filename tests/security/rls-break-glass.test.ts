import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { db } from '@/lib/db';
import {
  isBreakGlassActive,
  engageBreakGlass,
  disengageBreakGlass,
  breakGlassStatus,
  __resetBreakGlassCache,
  MAX_WINDOW_MINUTES,
} from '@/lib/db/rls-break-glass';

/**
 * Phase 2 (v1.12.0) — the RLS break-glass control plane
 * (src/lib/db/rls-break-glass.ts + migration 20's `_rls_control`).
 *
 * Auto-skips unless `_rls_control` exists (migration 20 applied). Live DB,
 * self-restoring — the singleton row is cleared after every test.
 */
let tableExists = false;
const ACTOR = 'break-glass-test@a2rventures.com';

beforeAll(async () => {
  const rows = await db.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*)::bigint AS n FROM information_schema.tables WHERE table_name = '_rls_control'`,
  );
  tableExists = rows[0]!.n > 0n;
});

afterEach(async () => {
  if (tableExists) {
    await db.$executeRawUnsafe(
      `UPDATE "_rls_control"
          SET "breakGlassUntil" = NULL, "reason" = NULL, "engagedAt" = NULL
        WHERE "id" = 'singleton'`,
    );
  }
  __resetBreakGlassCache();
});

describe('RLS break-glass control', () => {
  it('is inactive by default', async () => {
    if (!tableExists) return;
    __resetBreakGlassCache();
    expect(await isBreakGlassActive()).toBe(false);
    expect((await breakGlassStatus()).active).toBe(false);
  });

  it('engage opens a window; disengage closes it', async () => {
    if (!tableExists) return;

    const { minutes } = await engageBreakGlass({
      minutes: 5,
      reason: 'vitest — break-glass smoke',
      actorEmail: ACTOR,
    });
    expect(minutes).toBe(5);
    expect(await isBreakGlassActive()).toBe(true);

    const status = await breakGlassStatus();
    expect(status.active).toBe(true);
    expect(status.reason).toBe('vitest — break-glass smoke');
    expect(status.actorEmail).toBe(ACTOR);

    await disengageBreakGlass({ actorEmail: ACTOR });
    __resetBreakGlassCache();
    expect(await isBreakGlassActive()).toBe(false);
  });

  it('clamps the window to MAX_WINDOW_MINUTES', async () => {
    if (!tableExists) return;
    const { minutes } = await engageBreakGlass({
      minutes: 999,
      reason: 'vitest — clamp check',
      actorEmail: ACTOR,
    });
    expect(minutes).toBe(MAX_WINDOW_MINUTES);
  });

  it('a past-expiry window reads as inactive (auto-expiry)', async () => {
    if (!tableExists) return;
    await db.$executeRawUnsafe(
      `UPDATE "_rls_control"
          SET "breakGlassUntil" = now() - interval '1 minute', "reason" = 'expired'
        WHERE "id" = 'singleton'`,
    );
    __resetBreakGlassCache();
    expect(await isBreakGlassActive()).toBe(false);
  });

  it('honours the in-process cache within its TTL, then re-reads', async () => {
    if (!tableExists) return;

    await engageBreakGlass({ minutes: 5, reason: 'vitest — cache check', actorEmail: ACTOR });
    expect(await isBreakGlassActive()).toBe(true); // populates the cache

    // Wipe the row WITHOUT clearing the cache — the cached "active" stands.
    await db.$executeRawUnsafe(
      `UPDATE "_rls_control" SET "breakGlassUntil" = NULL WHERE "id" = 'singleton'`,
    );
    expect(await isBreakGlassActive()).toBe(true);

    __resetBreakGlassCache();
    expect(await isBreakGlassActive()).toBe(false); // fresh read
  });
});
