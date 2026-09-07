/**
 * A2R — production health probe.
 *
 *   npm run health:prod                      # https://www.a2rventures.com
 *   npm run health:prod -- https://<host>    # any deployment / preview
 *
 * Hits the two unauthenticated probes (src/app/api/health/*):
 *   GET /api/health        — liveness  ("is the Node process serving?")
 *   GET /api/health/ready  — readiness ("can it run a SELECT against Postgres?")
 *
 * Exit 0 only when both return their healthy shape; exit 1 otherwise, so a
 * deploy step or a watch loop can gate on it. No auth, no DB access from
 * this side — pure HTTP.
 */
const DEFAULT_BASE = 'https://www.a2rventures.com';

function baseUrl(): string {
  const arg = process.argv.slice(2).find((a) => a.startsWith('http'));
  return (arg || process.env.HEALTH_URL || DEFAULT_BASE).replace(/\/$/, '');
}

async function probe(url: string): Promise<{ status: number; body: unknown; ms: number }> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'cache-control': 'no-store' } });
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
