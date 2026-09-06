/**
 * Types for env-isolation-core.mjs (plain ESM so next.config.mjs can import
 * the same logic that runs at runtime). See P0 #4.
 */
export const DEFAULT_PRODUCTION_SUPABASE_REF: string;

export type EnvIsolationVerdict =
  | { ok: true; warning?: string }
  | { ok: false; code: string; message: string };

export function evaluateEnvironmentIsolation(
  env: Record<string, string | undefined>,
): EnvIsolationVerdict;
