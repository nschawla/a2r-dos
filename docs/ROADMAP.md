# Product Roadmap &amp; PM Pulse — A2R Delivery OS™

_Current production baseline: **v1.16.0** (`e1a0c09`). This document is the
forward plan; it does not describe shipped behaviour (see `docs/FRD.md` for
that). Target audience: beta clients and internal PM._

---

## 1. Immediate next release (beta) — themes

The next minor release is scoped for the first cohort of beta clients. Three
themes, in priority order.

### Theme A — Deep PM Pulse: health scoring &amp; milestone velocity

**Goal.** Turn the existing five-lens health vector into a single, trend-aware
engagement health score that a sponsor can read at a glance and drill into.

| Item | Description |
| --- | --- |
| Composite Pulse score | Weighted roll-up of schedule, cost, scope, risk, and stakeholder-sentiment lenses into one 0–100 score per engagement, with a documented weighting model (tenant-overridable via governance config). |
| Milestone velocity | Rolling measure of milestones completed vs. planned per period; a velocity trend (accelerating / steady / slipping) shown against baseline. |
| Trend arrows &amp; sparklines | Every Pulse score and sub-lens carries a period-over-period delta and an inline sparkline on the Control Tower and the project header. |
| Pulse history | Snapshotted weekly so the score is auditable and back-testable; stored per engagement, immutable once written. |
| Early-warning surfacing | Engagements whose Pulse crosses a downward threshold are promoted to the top of the Control Tower and the Executive Briefing Hub. |

**Depends on:** the existing `Project` EVM rollups and 5-lens health vector
(`src/lib/calculations/**`), the SteerCo briefing aggregator, and weekly
snapshotting infrastructure.

### Theme B — Real-time telemetry alerts &amp; webhook notifications

**Goal.** Move platform and engagement signals from pull (dashboards) to push
(alerts), for both operators and tenant admins.

| Item | Description |
| --- | --- |
| Alert rules | Threshold and simple anomaly rules on platform signals (build / test / DB health, ingestion failures, rate-limit denials) and engagement signals (Pulse drop, milestone slip, margin-drift breach, RAID escalation). |
| Webhook delivery | Tenant-configured HTTPS endpoints receive signed JSON payloads (HMAC over the body, replay-window timestamp, delivery id); at-least-once with exponential backoff and a dead-letter view. |
| In-app activity stream | Every alert also lands in the tenant activity stream and the operator Platform Pulse feed. |
| Delivery audit | Every alert evaluation and every webhook attempt is logged (rule, signal value, endpoint, response code) for support and compliance. |
| Quiet hours &amp; dedup | Per-rule cool-down and digest windows so a flapping signal does not storm an endpoint. |

**Security posture (carried forward).** Webhook config is a tenant-admin
capability; endpoints are validated (no private-range SSRF targets); payloads
never include masked financial figures for a tenant whose governance config
masks them.

### Theme C — Expanded self-service Viewer widgets with strict data masking

**Goal.** Make the read-only Viewer / guest tier genuinely useful for clients
and stakeholders without loosening a single control.

| Item | Description |
| --- | --- |
| Viewer widget library | Portfolio heat map, milestone timeline, RAG summary, Pulse trend, upcoming-decisions list — all read-only. |
| Composable Viewer home | A Viewer (or the admin provisioning them) can arrange a small set of widgets into a personal landing view; layout stored per user. |
| Masking guarantee | Every widget renders through `src/lib/security/masking.ts` at the `restricted` tier — cost rates, margins, and variance are scrubbed before they reach the client, identical to the current Viewer surfaces. |
| Scope guarantee | Widgets read only through the RBAC-scoped portfolio queries; a Viewer sees the whole org read-only and nothing outside it. |
| No new write paths | The widget system adds zero mutations; Suite Q (guest walled off from `/ops` + `/admin`) is extended to cover every new widget route. |

---

## 2. Sequencing &amp; gates

1. **Theme A** first — it is the headline beta value and the other themes
   reference the Pulse score.
2. **Theme B** second — alert rules consume the Pulse history from Theme A.
3. **Theme C** third — the Viewer Pulse-trend widget consumes Theme A; the
   rest can proceed in parallel.

Each theme ships behind the same release discipline as v1.10.0 → v1.16.0:
migration rehearsal, full green suite (adding Vitest + Playwright coverage for
the new surface), a production build, and a tag at the deployed commit.

---

## 3. Beyond the next release (tracked, not scheduled)

| Item | Notes |
| --- | --- |
| WebAuthn / passkeys for operator elevation | Phishing-resistant AAL2 at the `verifySecondFactor` seam. |
| `FORCE ROW LEVEL SECURITY` on production | After the RLS soak window. |
| Dedicated `a2r_ops` database role | Replace `runUnscoped`-as-`postgres` for the cross-tenant admin path. |
| Tenant-facing SSO for the Viewer tier | Let client organizations bring their own IdP for guest access. |
| Third-party SOC 1 / SOC 2 attestation | Business decision; the control-design work and evidence artifacts are already in place. |
