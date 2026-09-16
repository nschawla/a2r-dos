# Read-Only External Integration Adapters — PS-DOS™

_Introduced v1.18.0._ How PS-DOS pulls telemetry from a tenant's existing
PSA/CRM stack — Jira/Asana/Monday, NetSuite/Certinia/Kantata/OpenAir,
Salesforce — and how an operator manages and troubleshoots those
connections from the Ops Console.

---

## 1. Design principle: strictly read-only, by construction

Nothing in `src/lib/integrations/` ever writes back to an external system.
This isn't a convention a developer has to remember — it's structural:

- `BaseAdapter` (`src/lib/integrations/types.ts`) exposes exactly two
  methods, `testConnection` and `pull`. There is no `push`/`write`/`update`
  method anywhere in the interface for an adapter to implement, and every
  adapter is unit-tested (`tests/integrations.test.ts`) to confirm it
  exposes nothing beyond those two.
- Every HTTP call goes through `src/lib/integrations/http.ts`'s `getJson` /
  `postJson` — both issue `GET`/`POST` requests whose body (when there is
  one, e.g. Monday's GraphQL transport) is always a `query`, never a
  `mutation`. Salesforce/Certinia adapters issue SOQL `query` calls, never
  the `sobjects` DML endpoints.
- The sync pipeline (`sync-runner.ts`) only ever reads a connection's
  config/credential and writes to PS-DOS's *own* tables
  (`integration_connections`, `integration_sync_runs`,
  `integration_errors`) — never to a tenant's delivery/financial models.
  See §5 for what that means for v1's scope.

## 2. Data model

Three tenant-owned tables (migration `00000000000026_integration_adapters`,
composite `organizationId` FKs throughout, same WP1 closure pattern as
every other tenant table — RLS `tenant_isolation` policy included in the
same migration, extending migration 17's policy set):

| Table | Purpose |
| --- | --- |
| `integration_connections` | One row per tenant per provider. `config` (JSON, non-secret: base URL, project/board key, account id) + `credentialCiphertext` (AES-256-GCM, `src/lib/identity/crypto.ts` — the same primitive the SSO client secret uses) + `credentialFingerprint` (a safe-to-display sha256 prefix). Health fields (`lastSyncAt`, `lastSyncStatus`, `lastSyncRecordCount`, `avgSyncDurationMs`, `rateLimitRemaining`, `rateLimitResetAt`) are the Connection Health Matrix's columns. |
| `integration_sync_runs` | One row per pull attempt (manual or scheduled) — `status`, `recordsIngested`, `durationMs`, `triggeredBy`. |
| `integration_errors` | One row per categorized failure — `category` (`AUTH_EXPIRED` / `RATE_LIMITED` / `NETWORK_TIMEOUT` / `SCHEMA_MISMATCH` / `UNKNOWN`), a pre-computed `humanMessage`, and `rawDetail` for support escalation. `resolved` lets an operator mark one addressed. |

`CustomKpi.targetPersonas`-style drift risk doesn't apply here — these are
new tables with an enum column (`IntegrationProvider`), not a `String[]`
free-text field.

## 3. The adapter framework

```
src/lib/integrations/
  types.ts            BaseAdapter, RawDeliveryMetric / RawFinancialMetric / RawPipelineRecord
  http.ts              getJson / postJson — the one fetch wrapper every adapter uses
  errors.ts             classifyHttpError / classifyThrown / classifySchemaMismatch / notConfiguredError
  normalize.ts          the Normalization Layer's runtime shape-guard (zod)
  registry.ts            provider -> adapter instance
  registry-labels.ts      PROVIDER_LABEL (split out to avoid a client-bundle-unsafe import)
  provider-meta.ts       client-safe {label, dataKind, configFields} — what the Ops Console form reads
  sync-runner.ts         runSync() / findDueConnections() — the shared pipeline
  adapters/
    jira.ts asana.ts monday.ts                  DELIVERY_METRIC (sprint velocity / issue counts / milestone status)
    netsuite.ts certinia.ts kantata.ts openair.ts FINANCIAL_METRIC (baseline margin / actuals / allocation)
    salesforce.ts                                 PIPELINE_RECORD (book of business / deal stages)
```

Adding a ninth provider: implement `BaseAdapter`, register it in
`registry.ts`'s `ADAPTERS` map, and add a matching entry to
`provider-meta.ts` (a drift-guard test,
`tests/integrations.test.ts`'s "provider-meta.ts stays in sync" block,
fails if the two lists disagree). No schema change needed unless the new
provider needs a data kind beyond the existing three.

### Normalization

Each adapter's own `pull()` implementation is half of "normalization" — it
maps its provider's raw response into one of the three shared shapes
(`RawDeliveryMetric` / `RawFinancialMetric` / `RawPipelineRecord`), so
Jira, Asana, and Monday all speak the same shape to the rest of the app.
`normalize.ts` is the other half: a zod runtime shape-guard every pulled
record passes through in `sync-runner.ts` before being counted — the
defense against a provider silently changing its API shape in a way a
TypeScript type alone can't catch at compile time.

### Error classification

Every failure — an HTTP error status, a thrown network error, or a 2xx
response that doesn't parse into the expected shape — is translated once,
centrally (`errors.ts`), into a `{ category, humanMessage }` pair. The
Ops Console never shows a raw stack trace; `rawDetail` (truncated to 2 KB)
is kept alongside for support escalation. Examples of the generated
messages:

- `"Jira API token expired or lacks read scope on the configured
  project/board. Re-enter a valid token in this connection's settings."`
- `"NetSuite rate limit reached; backing off for 15 minutes before the
  next automatic retry."`
- `"Couldn't reach Salesforce — the base URL in this connection's settings
  may be wrong, or Salesforce is temporarily unreachable."`

Node's `fetch` (undici) wraps a DNS/connection failure as `TypeError:
fetch failed` with the real cause nested in `.cause`, not the top-level
message — `classifyThrown` checks both (a real bug caught by
`tests/integrations-sync-runner.test.ts`'s live-network test, not by
inspection).

## 4. Ops Console — Connection Health Matrix (`/ops/integrations`)

Platform infrastructure an A2R operator configures on a tenant's behalf —
the same trust model as `/ops/identity` (SSO): external-system credentials
are not tenant self-service. Gated by two new `OperatorCapability` values
(`src/lib/ops/operator-roles.ts`):

- `integrations:view` — the health matrix + error log. No elevation
  required (Provisioning, Support, Auditor, Super Admin).
- `integrations:manage` — add/edit/delete a connection, or trigger a
  retry sync. Requires a live JIT elevation
  (`requireElevatedOps('integrations:manage')`), same as every other
  mutating `/ops` action (Provisioning, Support, Super Admin).

Every config/credential change and every manual retry is written to the
tenant's Compliance Ledger (`INTEGRATION_CONFIG_CHANGE`).

## 5. v1 scope — what this does NOT do yet

- **No project mapping.** `runSync` pulls, validates, and counts records,
  but does not yet write them into a specific `Project`'s
  `RaidEntry`/`FinancialActual`/`SchedulePhase` rows. Doing that safely
  needs a "which internal Project does this external board/company
  correspond to" configuration step this work packet didn't specify —
  inventing that mapping unreviewed risked writing plausible-looking mock
  data into a real tenant's delivery records. The pipeline (pull → error-
  classify → normalize → count → log) is fully built and tested up to
  that boundary; wiring the write-through is the natural next increment,
  following the same "stage, then let an admin commit" pattern the
  4-pillar Batch Import Engine already uses for CSV imports.
- **Auth is a pre-issued token, not a full OAuth handshake.** Real
  deployments of NetSuite, Salesforce/Certinia, and Kantata authenticate
  via OAuth 1.0a/2.0 flows this work packet's scope didn't cover — each
  adapter takes an already-issued access token as `credential` so the read
  shape is real and testable now; wiring the token-acquisition flow per
  vendor is a follow-on once a real sandbox account exists to develop
  against.
- **The scheduled sync is built but not live.** `POST
  /api/internal/integrations-sync` (mirrors `/api/internal/retention`'s
  shared-token pattern) exists and is tested, but is **not** registered in
  `vercel.json`'s cron config — flipping on an automatically-firing
  schedule in production is a deliberate step for a human to take, not
  something to enable unreviewed.
- **Migration 26 is applied to staging only.** Production has not been
  touched — see the release notes for the explicit "apply to production"
  step this still needs.
