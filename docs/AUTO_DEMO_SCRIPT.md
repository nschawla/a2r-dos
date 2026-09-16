# PS-DOS — Auto Demo Voiceover Script &amp; Production Cue Sheet

**Source of truth:** `src/lib/demo/demo-script.ts` (`DEMO_SCRIPT`). Every
line, route, duration, and beat id below is transcribed verbatim from that
file — if you change a caption or a `durationMs` there, update this
document in the same commit, and vice versa if a re-record changes what a
beat should say. This is a production document for recording and syncing
the voiceover, not a second copy of the config to drift from it.

**What drives what:** `AutoDemoProvider` pushes the browser to a step's
`route`, holds it there for `durationMs`, and `CinematicOverlay` shows the
step's `caption` as an on-screen subtitle for the same window — the
recorded voiceover is the audio the subtitle is presently standing in for.
Nothing in the app plays audio yet; this script is what a producer records
against those exact windows.

**Current as of v1.16.0** — this revision adds the four-beat **Security &amp;
Trust** segment (`tenant-isolation`, `operator-roles`, `step-up-mfa`,
`audit-ledger`) and a fourth playback track (**Security &amp; Trust**), and
re-points the `ops-console` beat at `/ops/telemetry` (bare `/ops` now
307-redirects to the operator's role landing route).

**Current as of v1.17.0** — adds one beat, `persona-preview` (Admin and
Security tracks, right after `scoped-practice-view`), showcasing the new
Persona Preview banner.

**Current as of v1.18.0** — adds one beat, `external-integrations` (Admin
and Security tracks, the new last beat of the Security &amp; Trust segment,
right before `closing`), showcasing the Read-Only External Integration
Adapters and the Ops Console's Connection Health Matrix. 17 beats total
now; every cue sheet in §4 except Executive Lens (which doesn't play
either new beat) shifts again from this point on.

---

## 1. Track overview

Four playback tracks share one 17-beat master script — a track is a
persona-filtered *subsequence* of it, in the same order, never a rewrite:

| Track | Persona value | Beats played | Total runtime |
| --- | --- | --- | --- |
| **Full Platform Tour** | `'Full Tour'` | All 17, in script order | **3:50** (230s) |
| **Executive Lens** | `'Executive'` | Welcome → Command Center → Scoped Practice View → SteerCo → Executive Hub → Tenant Isolation → Closing (7 beats) | **1:15** (75s) |
| **Admin / Ops Lens** | `'Admin'` | Welcome → Command Center → Scoped Practice View → Persona Preview → Admin Setup → Batch Import → Custom KPI Builder → Ops Console → Platform Pulse → Tenant Isolation → Operator Roles → Step-Up MFA → Audit Ledger → External Integrations → Closing (15 beats) | **3:33** (213s) |
| **Security &amp; Trust** | `'Security'` | Welcome → Scoped Practice View → Persona Preview → Tenant Isolation → Operator Roles → Step-Up MFA → Audit Ledger → External Integrations → Closing (9 beats) | **2:20** (140s) |

Because a beat's line is identical everywhere it appears, **only 17 unique
voiceover files are ever needed** — not one per track/beat combination.
Record each beat once; the per-track cue sheets in §4 just tell you which
recording plays when, on which track.

- **"Scoped Practice View"** is shared by all three single-persona tracks —
  it's the Role-Based Scoped Filtering capability and reads the same way to
  any audience.
- **"Persona Preview"** (v1.17.0) plays right after it on the Admin and
  Security tracks only — never Executive, since only a tenant Admin or A2R
  staff can see the banner at all, and it's the natural next beat after
  "every view is role-aware": now show the tool that lets you *become* any
  role on demand.
- **"Tenant Isolation"** is the one Security &amp; Trust beat that also plays
  on the Executive and Admin tracks — it's the tenant-facing half of the
  security story (your data is walled off at the database), which every
  audience should hear.
- **"Operator Roles / Step-Up MFA / Audit Ledger / External Integrations"**
  are the deep operator beats — Admin and Security tracks only, never the
  board-level Executive track. **"External Integrations"** (v1.18.0) closes
  the segment: read-only-by-construction PSA/CRM connectors and the
  Connection Health Matrix that monitors them.

---

## 2. ElevenLabs recording setup

- **Voice character:** a confident, warm, mid-paced narrator — the voice
  of someone demoing their own product to a peer, not a movie-trailer
  announcer. American or neutral international English. Avoid anything
  overtly "salesy" or breathless; the app's own tone (see its copy
  throughout) is plain, declarative, and a little dry. The Security &amp;
  Trust beats especially should read *matter-of-fact* — these are
  statements of how it works, not a pitch.
- **Model:** a full-quality/multilingual-tier model for the final,
  delivered files; a faster turbo-tier model is fine for rough
  timing-check drafts while beats are still being tuned against the
  on-screen durations in §3.
- **Suggested voice settings** (starting point — adjust by ear against the
  chosen voice):
  - Stability: **0.45–0.55**.
  - Similarity: **0.75+**.
  - Style exaggeration: **0.15–0.30** (narration, not a character read).
  - Speaker boost: **on**.
- **Pacing:** narrate for clarity, not speed — every beat's `durationMs`
  is tuned to a comfortable **150–180 words-per-minute** read (see §3's
  per-beat pacing figures). Land each line naturally inside its window; a
  few hundred milliseconds of early finish before the next route change is
  expected and fine.
- **Delivery:** one continuous take per beat (no mid-line pauses/edits) —
  each recording plays back-to-back against a hard route change, so a
  clean start and a clean tail matters. Two beats set up an explicit
  comparison — land the emphasis:
  - Beat 3 (`scoped-practice-view`): *"VP or Ops lead"* vs. *"Practice
    Director's seat"*.
  - Beat 12 (`tenant-isolation`): *"Not a UI rule — a database guarantee."*
    — the last line is the whole point of the beat; let it land flat and
    certain, no lift.
- **File naming &amp; delivery:** `vo-<beat-id>.mp3`, one file per beat id
  in §3 (17 files total). Deliver alongside a duration report (actual
  recorded length per file) so it can be checked against §3's on-screen
  budget before anything is wired into the app.

### Pronunciation &amp; terminology

| Term | Say it as |
| --- | --- |
| A2R | "A, two, R" (three distinct sounds, not "aitor") |
| SteerCo | "steer-co" (one word) |
| OS (in "PS-DOS") | "O, S" (letters) |
| PDF / KPI / UI / OS | spell the letters |
| RAID | said as the word "raid" |
| MFA | "M, F, A" (letters) |
| TOTP | "T, O, T, P" (letters) — never "toe-tip" |
| row-level security | say it in full; do not say "R-L-S" |
| hash-chained | "hash — chained" (two words, light hyphen) |
| step-up | "step — up" (the security sense: an extra auth challenge) |
| Contoso | "con-TOE-so" — the example client in beat 2, not a real customer |

---

## 3. Master script — all 17 beats

Grouped by act, exactly as `DEMO_SCRIPT` orders them. **Pacing** is words
in the caption ÷ (`durationMs` ÷ 60000). Every beat sits inside the
comfortable 150–180 wpm band.

### ACT I — Introduction

#### Beat 1 — `welcome`
- **Route:** `/portfolio` · **Duration:** 10s · **Personas:** Executive, Admin, Security, Full Tour
- **Highlight:** `#global-header`
- **VO:**
  > Welcome to PS-DOS — the delivery operating system built for professional services firms. This is the Portfolio Control Tower: every engagement, rolled up into one live view.
- **Pacing:** 28 words / 10s ≈ **168 wpm**

#### Beat 2 — `command-center`
- **Route:** `/command` · **Duration:** 10s · **Personas:** Executive, Admin, Full Tour
- **Highlight:** —
- **VO:**
  > The Command Center puts your portfolio's vital signs, and a natural-language command bar, in one pane — type "financials for Contoso" and it just takes you there.
- **Pacing:** 26 words / 10s ≈ **156 wpm**

#### Beat 3 — `scoped-practice-view`
- **Route:** `/capacity` · **Duration:** 15s · **Personas:** Executive, Admin, Security, Full Tour
- **Highlight:** `#capacity-scope-indicator`
- **VO:**
  > Every view in PS-DOS is role-aware. A VP or Ops lead sees the whole portfolio here — tenant-wide. Switch to a Practice Director's seat, and the exact same screen scopes itself to just their own practice's roster and projects, automatically.
- **Delivery note:** land the *comparison* — the highlighted line flips between "Tenant-wide — every practice." and "Scoped to your practice — N resources."
- **Pacing:** 41 words / 15s ≈ **164 wpm**

#### Beat 4 — `persona-preview`
- **Route:** `/portfolio` · **Duration:** 18s · **Personas:** Admin, Security, Full Tour
- **Highlight:** `#persona-preview-bar`
- **VO:**
  > Any admin can instantly preview the app as any other role — Executive, Project Manager, even a read-only guest — right from this banner. The sidebar, every module tab, and every write control morph to match exactly, so you can verify access control without creating test accounts or switching who's signed in.
- **Delivery note:** land on "without creating test accounts" — that's the payoff line.
- **Pacing:** 50 words / 18s ≈ **167 wpm**

#### Beat 5 — `steerco`
- **Route:** `/steerco` · **Duration:** 8s · **Personas:** Executive, Full Tour
- **Highlight:** —
- **VO:**
  > For the steering committee, the SteerCo Briefing distills the whole portfolio into a lean, board-ready read-out — and prints straight to a clean PDF.
- **Pacing:** 23 words / 8s ≈ **172 wpm**

#### Beat 6 — `executive-hub`
- **Route:** `/reports` · **Duration:** 9s · **Personas:** Executive, Full Tour
- **Highlight:** —
- **VO:**
  > The Executive Hub goes one layer deeper — a full four-section portfolio briefing, also print-ready, for whenever the board wants the detail behind the headline.
- **Pacing:** 24 words / 9s ≈ **160 wpm**

### ACT II — Ops Console

#### Beat 7 — `admin-setup`
- **Route:** `/admin` · **Duration:** 10s · **Personas:** Admin, Full Tour
- **Highlight:** —
- **VO:**
  > Now let's step behind the curtain. Admin &amp; Org Setup is where a delivery leader manages the roster, the rate card, and enterprise governance policy — no spreadsheet required.
- **Delivery note:** "Now let's step behind the curtain" is the act's turn — a small tonal shift.
- **Pacing:** 27 words / 10s ≈ **162 wpm**

#### Beat 8 — `admin-ingestion`
- **Route:** `/admin/ingestion?v=batch` · **Duration:** 13s · **Personas:** Admin, Full Tour
- **Highlight:** `#batch-import-zone`
- **VO:**
  > And this is brand new: the Self-Service Batch Import Engine. A client's own team drops in a week of actuals, and anything that doesn't check out is quarantined — never silently dropped, never committed until it's clean.
- **Pacing:** 36 words / 13s ≈ **166 wpm**

#### Beat 9 — `admin-kpis`
- **Route:** `/admin/kpis` · **Duration:** 22s · **Personas:** Admin, Full Tour
- **Highlight:** `#new-kpi-button`
- **VO:**
  > And this is the Custom KPI Builder. An admin picks a real metric — margin, schedule health, RAID exposure, utilization — sets a target and a warning line, and assigns it to exactly the personas who should see it. Save it, and the card appears immediately on the Control Tower and the Executive Hub for everyone in that persona — no redeploy, no waiting.
- **Delivery note:** the *builder* list in one breath group each, then the *payoff* — a small lift on "immediately".
- **Pacing:** 61 words / 22s ≈ **166 wpm**

#### Beat 10 — `ops-console`
- **Route:** `/ops/telemetry` · **Duration:** 10s · **Personas:** Admin, Full Tour
- **Highlight:** —
- **VO:**
  > Zooming out further, the A2R Ops Console is our own operator view across every client we run — platform health, tenant provisioning, and identity federation, all in one place.
- **Note:** the beat routes to `/ops/telemetry` directly — bare `/ops`
  307-redirects to the operator's role landing route, which would show a
  flash on screen.
- **Pacing:** 28 words / 10s ≈ **168 wpm**

#### Beat 11 — `ops-pulse`
- **Route:** `/ops/pulse` · **Duration:** 8s · **Personas:** Admin, Full Tour
- **Highlight:** —
- **VO:**
  > Platform Pulse is engineering telemetry for PS-DOS itself — build, tests, and database health, ingested automatically, never typed in by hand.
- **Pacing:** 22 words / 8s ≈ **165 wpm**

### ACT III — Security &amp; Trust

#### Beat 12 — `tenant-isolation`
- **Route:** `/portfolio` · **Duration:** 16s · **Personas:** Executive, Admin, Security, Full Tour
- **Highlight:** `#global-header`
- **VO:**
  > Everything you have seen sits inside one tenant. PS-DOS enforces that at the database itself — row-level security, composite keys, and a query layer scoped by default. One client's data is never one bug away from another's. Not a UI rule — a database guarantee.
- **Delivery note:** the last sentence is the point of the beat — flat and certain, no lift, small pause before "a database guarantee."
- **Pacing:** 45 words / 16s ≈ **169 wpm**

#### Beat 13 — `operator-roles`
- **Route:** `/ops/access` · **Duration:** 21s · **Personas:** Admin, Security, Full Tour
- **Highlight:** `#operator-capability-matrix`
- **VO:**
  > Our own operators run under least privilege. Six roles — provisioning, support, audit, billing, read-only, owner — each with an exact capability set, enforced in three independent layers: the edge, the page, and the action itself. No operator can widen their own access, and no role can reach a screen it is not cleared for.
- **Delivery note:** the six-role list is a clean, even list — one light beat per role, don't rush it. The three layers ("the edge, the page, and the action itself") is the second list — same treatment.
- **Pacing:** 53 words / 21s ≈ **151 wpm**

#### Beat 14 — `step-up-mfa`
- **Route:** `/ops/security` · **Duration:** 17s · **Personas:** Admin, Security, Full Tour
- **Highlight:** `#operator-mfa-panel`
- **VO:**
  > And there is no standing admin access. Every privileged action takes a fresh step-up — a stated reason, a re-entered password, and a one-time code from an authenticator app — valid for a few minutes, then gone. Changing a password kills every active elevation instantly.
- **Delivery note:** "no standing admin access" is the headline — land it. The three-part step-up list, then the consequence ("kills every active elevation instantly") clean and final.
- **Pacing:** 43 words / 17s ≈ **152 wpm**

#### Beat 15 — `audit-ledger`
- **Route:** `/ops/audit` · **Duration:** 15s · **Personas:** Admin, Security, Full Tour
- **Highlight:** `#jit-elevation-log`
- **VO:**
  > Every elevation, and every action taken on a client's data, is written to a hash-chained ledger that is immutable at the database engine — the application's own role cannot update or delete a single row of it. What happened, happened, on the record.
- **Delivery note:** "What happened, happened, on the record." — three short beats, spoken like a closing statement.
- **Pacing:** 42 words / 15s ≈ **168 wpm**

#### Beat 16 — `external-integrations`
- **Route:** `/ops/integrations` · **Duration:** 21s · **Personas:** Admin, Security, Full Tour
- **Highlight:** `#integration-health-matrix`
- **VO:**
  > And one more layer of trust: when PS-DOS pulls telemetry from a client's Jira, Salesforce, or NetSuite, every connector is read-only by construction — there is no write method in the code to misuse. Credentials are sealed with the same encryption protecting single sign-on secrets, and every failure is logged here in plain language, never a raw stack trace.
- **Delivery note:** "read-only by construction" is the headline claim — land it plainly, not defensively. The closing line ("never a raw stack trace") is the payoff, same treatment as the audit-ledger beat before it.
- **Pacing:** 58 words / 21s ≈ **166 wpm**

### Closing (all tracks rejoin here)

#### Beat 17 — `closing`
- **Route:** `/portfolio` · **Duration:** 7s · **Personas:** Executive, Admin, Security, Full Tour
- **Highlight:** —
- **VO:**
  > That's the tour. Feel free to take the wheel from here — everything you just saw is one click away.
- **Delivery note:** a sign-off, not a segue — ease the pace down.
- **Pacing:** 19 words / 7s ≈ **163 wpm**

---

## 4. Per-track production cue sheets

Timecodes are cumulative **from a cold start of that track** (`0:00` =
the instant `startDemo(persona)` fires) — precise to the second, since
every beat's duration is a whole number of seconds. Each row's OUT point
is the next beat's IN point; the route change happens exactly on cue.

### 4.1 Full Platform Tour — 3:50 total, all 17 beats

| Timecode | Sec | Beat | Route | Highlight |
| --- | --- | --- | --- | --- |
| 0:00–0:10 | 0–10 | `welcome` | `/portfolio` | `#global-header` |
| 0:10–0:20 | 10–20 | `command-center` | `/command` | — |
| 0:20–0:35 | 20–35 | `scoped-practice-view` | `/capacity` | `#capacity-scope-indicator` |
| 0:35–0:53 | 35–53 | `persona-preview` | `/portfolio` | `#persona-preview-bar` |
| 0:53–1:01 | 53–61 | `steerco` | `/steerco` | — |
| 1:01–1:10 | 61–70 | `executive-hub` | `/reports` | — |
| 1:10–1:20 | 70–80 | `admin-setup` | `/admin` | — |
| 1:20–1:33 | 80–93 | `admin-ingestion` | `/admin/ingestion?v=batch` | `#batch-import-zone` |
| 1:33–1:55 | 93–115 | `admin-kpis` | `/admin/kpis` | `#new-kpi-button` |
| 1:55–2:05 | 115–125 | `ops-console` | `/ops/telemetry` | — |
| 2:05–2:13 | 125–133 | `ops-pulse` | `/ops/pulse` | — |
| 2:13–2:29 | 133–149 | `tenant-isolation` | `/portfolio` | `#global-header` |
| 2:29–2:50 | 149–170 | `operator-roles` | `/ops/access` | `#operator-capability-matrix` |
| 2:50–3:07 | 170–187 | `step-up-mfa` | `/ops/security` | `#operator-mfa-panel` |
| 3:07–3:22 | 187–202 | `audit-ledger` | `/ops/audit` | `#jit-elevation-log` |
| 3:22–3:43 | 202–223 | `external-integrations` | `/ops/integrations` | `#integration-health-matrix` |
| 3:43–3:50 | 223–230 | `closing` | `/portfolio` | — |

### 4.2 Executive Lens — 1:15 total, 7 beats

| Timecode | Sec | Beat | Route | Highlight |
| --- | --- | --- | --- | --- |
| 0:00–0:10 | 0–10 | `welcome` | `/portfolio` | `#global-header` |
| 0:10–0:20 | 10–20 | `command-center` | `/command` | — |
| 0:20–0:35 | 20–35 | `scoped-practice-view` | `/capacity` | `#capacity-scope-indicator` |
| 0:35–0:43 | 35–43 | `steerco` | `/steerco` | — |
| 0:43–0:52 | 43–52 | `executive-hub` | `/reports` | — |
| 0:52–1:08 | 52–68 | `tenant-isolation` | `/portfolio` | `#global-header` |
| 1:08–1:15 | 68–75 | `closing` | `/portfolio` | — |

### 4.3 Admin / Ops Lens — 3:33 total, 15 beats

| Timecode | Sec | Beat | Route | Highlight |
| --- | --- | --- | --- | --- |
| 0:00–0:10 | 0–10 | `welcome` | `/portfolio` | `#global-header` |
| 0:10–0:20 | 10–20 | `command-center` | `/command` | — |
| 0:20–0:35 | 20–35 | `scoped-practice-view` | `/capacity` | `#capacity-scope-indicator` |
| 0:35–0:53 | 35–53 | `persona-preview` | `/portfolio` | `#persona-preview-bar` |
| 0:53–1:03 | 53–63 | `admin-setup` | `/admin` | — |
| 1:03–1:16 | 63–76 | `admin-ingestion` | `/admin/ingestion?v=batch` | `#batch-import-zone` |
| 1:16–1:38 | 76–98 | `admin-kpis` | `/admin/kpis` | `#new-kpi-button` |
| 1:38–1:48 | 98–108 | `ops-console` | `/ops/telemetry` | — |
| 1:48–1:56 | 108–116 | `ops-pulse` | `/ops/pulse` | — |
| 1:56–2:12 | 116–132 | `tenant-isolation` | `/portfolio` | `#global-header` |
| 2:12–2:33 | 132–153 | `operator-roles` | `/ops/access` | `#operator-capability-matrix` |
| 2:33–2:50 | 153–170 | `step-up-mfa` | `/ops/security` | `#operator-mfa-panel` |
| 2:50–3:05 | 170–185 | `audit-ledger` | `/ops/audit` | `#jit-elevation-log` |
| 3:05–3:26 | 185–206 | `external-integrations` | `/ops/integrations` | `#integration-health-matrix` |
| 3:26–3:33 | 206–213 | `closing` | `/portfolio` | — |

### 4.4 Security &amp; Trust — 2:20 total, 9 beats

| Timecode | Sec | Beat | Route | Highlight |
| --- | --- | --- | --- | --- |
| 0:00–0:10 | 0–10 | `welcome` | `/portfolio` | `#global-header` |
| 0:10–0:25 | 10–25 | `scoped-practice-view` | `/capacity` | `#capacity-scope-indicator` |
| 0:25–0:43 | 25–43 | `persona-preview` | `/portfolio` | `#persona-preview-bar` |
| 0:43–0:59 | 43–59 | `tenant-isolation` | `/portfolio` | `#global-header` |
| 0:59–1:20 | 59–80 | `operator-roles` | `/ops/access` | `#operator-capability-matrix` |
| 1:20–1:37 | 80–97 | `step-up-mfa` | `/ops/security` | `#operator-mfa-panel` |
| 1:37–1:52 | 97–112 | `audit-ledger` | `/ops/audit` | `#jit-elevation-log` |
| 1:52–2:13 | 112–133 | `external-integrations` | `/ops/integrations` | `#integration-health-matrix` |
| 2:13–2:20 | 133–140 | `closing` | `/portfolio` | — |

---

## 5. Notes for the next pass

- **Timing reconciliation:** §3's durations are still an *estimate* tuned
  against a target wpm, not a measured recording. Once real ElevenLabs
  takes exist, re-time each beat's `durationMs` in `demo-script.ts`
  against the *actual* recorded file length and update this document in
  the same change.
- **Visual highlight:** `CinematicOverlay` renders a soft pulsing glow
  ring around `activeStep.highlightSelector`'s element. The nine ids in
  use are all real, stable elements already in the DOM (see the
  `highlightSelector` doc comment in `demo-script.ts` for the file map).
  A future beat that wants one just sets `highlightSelector` to a real,
  stable id.
- **Security &amp; Trust beats need an operator session.** Beats 12–14
  route to `/ops/access`, `/ops/security`, `/ops/audit` — a live demo run
  has to be signed in as an operator whose role can reach them (a full
  `SUPER_ADMIN` / owner grant reaches all three; `prisma/seed.ts` gives
  the master and E2E-master logins exactly that). `/ops/access` also needs
  a live JIT elevation to *change* a role, but the demo only *views* the
  matrix, which the page renders unelevated.
- **Playback wiring:** nothing in the app plays audio today —
  `CinematicOverlay` is subtitle-only. Wiring the `vo-<beat-id>.mp3` files
  in is a follow-on (an `<audio>` element keyed by `activeStep.id`,
  autoplaying in step with the route-push/timer effects in
  `AutoDemoProvider`).
- **New beats / tracks:** a new beat needs an entry in `DEMO_SCRIPT` (id,
  route, duration, caption, act, personas) and a matching row here. A new
  track needs the persona added to `DemoPersona` / `DEMO_PERSONAS` in
  `demo-script.ts`, a `TRACKS` entry in `AutoDemoLaunchModal.tsx`, and its
  own §4 cue sheet — the cue sheet is mechanically derived from
  `getStepsForPersona()` and regenerated by hand the same way whenever the
  script changes.
