import { PrismaClient } from '@prisma/client';
import { captureMessage } from '@/lib/observability';

/**
 * CMP-4 (GA-readiness audit) — DB channel security check.
 *
 * Prisma takes its TLS settings from the DATABASE_URL query string, not
 * from the client constructor: a production connection string must carry
 * `sslmode=require` (or stricter — `verify-full` with a CA bundle). See
 * .env.example. This check is loud but non-fatal — a misconfigured prod
 * deploy shows up in logs immediately instead of silently running an
 * unencrypted database channel, without taking the app down over it.
 */
function assertDbChannelSecurity(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const url = process.env.DATABASE_URL ?? '';
  const hasTls = /[?&](sslmode=(require|verify-ca|verify-full)|ssl=true)/i.test(url);
  const isLoopback = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
  if (!hasTls && !isLoopback) {
    captureMessage(
      'DATABASE_URL is missing sslmode=require — the database channel may be unencrypted in production.',
      { scope: 'db/ssl' },
      'warning'
    );
  }
}

function createPrismaClient(): PrismaClient {
  assertDbChannelSecurity();
  return new PrismaClient({
    // Slow-query visibility is OBS-2's job; for now keep prod quiet
    // (errors only) and dev at warn+error.
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

// Standard Next.js dev-mode singleton: without this, hot-reload creates a
// fresh PrismaClient (and a fresh connection pool) on every file save.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
