/**
 * A2R — production health probe.
 *
 *   npm run health:prod                      # https://www.a2rventures.com
 *   npm run health:prod -- https://<host>    # any deployment / preview
 *
 * Hits the two public probes (src/app/api/health/*):
 *   GET /api/health        — liveness  ("is the Node process serving?")
 *   GET /api/health/ready  — readiness ("can it run a SELECT against Postgres?")
 *
 * Public callers get { status } only. When `HEALTH_CHECK_TOKEN` is present
 * in the environment (from .env) this script sends it, so /ready also
 * returns { database, latencyMs }. Pure HTTP — no DB access from this side.
 *
 * Exit 0 only when both return their healthy shape; exit 1 otherwise.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Best-effort .env load — only to pick up HEALTH_CHECK_TOKEN.
try {
  for (const line of readFileSync(join(process.cwd(), '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(HEALTH_CHECK_TOKEN)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
} catch {
  /* absent — probe stays fully public */
}

const DEFAULT_BASE = 'https://www.a2rventures.com';

function baseUrl(): string {
  const arg = process.argv.slice(2).find((a) => a.startsWith('http'));
  return (arg || process.env.HEALTH_URL || DEFAULT_BASE).replace(/\/$/, '');
}

async function probe(url: string): Promise<{ status: number; body: unknown; ms: number }> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  // Present the health-check token when configured (locally, from .env) so
  // the readiness probe returns the full { database, latencyMs } diagnostic
  // rather than the public { status }-only body.
  const headers: Record<string, string> = { 'cache-control': 'no-store' };
  if (process.env.HEALTH_CHECK_TOKEN) headers['x-a2r-internal-token'] = process.env.HEALTH_CHECK_TOKEN;
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* keep raw text */
    }
    return { status: res.status, body, ms: Date.now() - startedAt };
  } finally {
    clearTimeout(timer);
  }
}

async function main(): Promise<number> {
  const base = baseUrl();
  console.log(`Probing ${base}\n`);

  let ok = true;

  try {
    const live = await probe(`${base}/api/health`);
    const healthy = live.status === 200 && (live.body as { status?: string })?.status === 'ok';
    ok &&= healthy;
    console.log(`  liveness   /api/health        ${live.status}  ${live.ms}ms  ${JSON.stringify(live.body)}`);
  } catch (err) {
    ok = false;
    console.log(`  liveness   /api/health        ERROR  ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const ready = await probe(`${base}/api/health/ready`);
    const healthy = ready.status === 200 && (ready.body as { status?: string })?.status === 'ready';
    ok &&= healthy;
    console.log(`  readiness  /api/health/ready  ${ready.status}  ${ready.ms}ms  ${JSON.stringify(ready.body)}`);
  } catch (err) {
    ok = false;
    console.log(`  readiness  /api/health/ready  ERROR  ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log(`\n${ok ? '✓ healthy' : '✗ NOT healthy'}`);
  return ok ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('[health-prod] failed', err);
    process.exit(1);
  });
