/**
 * A2R Delivery OS — pure calculation engine.
 *
 * Every export here is a deterministic function of its arguments: no
 * fetch, no Prisma, no React, no module-level mutable state. Given the
 * same inputs, they always return the same outputs, which is what makes
 * them unit-testable in isolation (see tests/calculations.test.ts) and
 * safe to call from a server action, a route handler, a background job,
 * or a client component — anywhere in the stack.
 */

export * from './types';
export * from './sizing';
export * from './audit';
export * from './financials';
export * from './schedule';
export * from './portfolio';
