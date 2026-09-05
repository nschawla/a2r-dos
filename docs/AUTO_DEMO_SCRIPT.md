# A2R DOS — Auto Demo Voiceover Script & Production Cue Sheet

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

---

## 1. Track overview

Three playback tracks share one 11-beat master script — a track is a
persona-filtered *subsequence* of it, in the same order, never a rewrite:

| Track | Persona value | Beats played | Total runtime |
| --- | --- | --- | --- |
| **Full Platform Tour** | `'Full Tour'` | All 11, in script order | **2:02** (122s) |
| **Executive Lens** | `'Executive'` | Welcome → Command Center → Scoped Practice View → SteerCo → Executive Hub → Closing (6 beats) | **0:59** (59s) |
| **Admin / Ops Lens** | `'Admin'` | Welcome → Command Center → Scoped Practice View → Admin Setup → Batch Import → Custom KPI Builder → Ops Console → Platform Pulse → Closing (9 beats) | **1:45** (105s) |

Because a beat's line is identical everywhere it appears, **only 11 unique
voiceover files are ever needed** — not one per track/beat combination.
Record each beat once; the per-track cue sheets in §4 just tell you which
recording plays when, on which track. "Scoped Practice View" is the one
beat shared by both single-persona tracks that isn't `welcome`,
`command-center`, or `closing` — it's the Role-Based Scoped Filtering
capability, and it reads the same way to either audience.

---

## 2. ElevenLabs recording setup

- **Voice character:** a confident, warm, mid-paced narrator — the voice
  of someone demoing their own product to a peer, not a movie-trailer
  announcer. American or neutral international English. Avoid anything
  overtly "salesy" or breathless; the app's own tone (see its copy
  throughout) is plain, declarative, and a little dry.
- **Model:** a full-quality/multilingual-tier model for the final,
  delivered files; a faster turbo-tier model is fine for rough
  timing-check drafts while beats are still being tuned against the
  on-screen durations in §3.
- **Suggested voice settings** (starting point — adjust by ear against the
  chosen voice):
  - Stability: **0.45–0.55** (expressive enough to sound human across 11
    fairly technical beats, stable enough not to wander mid-sentence).
  - Similarity: **0.75+**.
  - Style exaggeration: **0.15–0.30** (this is narration, not a character
    read — keep it low).
  - Speaker boost: **on**.
- **Pacing:** narrate for clarity, not speed — every beat's `durationMs`
  is tuned to a comfortable **150–180 words-per-minute** read (see §3's
  per-beat pacing figures). Land each line naturally inside its window
  rather than rushing it; a few hundred milliseconds of early finish
  before the next route change is expected and fine.
- **Delivery:** one continuous take per beat (no mid-line pauses/edits) —
  each recording plays back-to-back against a hard route change, so a
  clean start and a clean tail (no trailing breath/room tone beyond
  natural sentence-final decay) matters more than it would in a single
  long-form narration. Beat 3 (`scoped-practice-view`) is the one beat
  that explicitly sets up a comparison — land a small, natural emphasis on
  *"VP or Ops lead"* vs. *"Practice Director's seat"* so the contrast the
  screen itself is about to show (the scope-indicator line flips between
  "Tenant-wide" and "Scoped to your practice") reads clearly in audio too.
- **File naming & delivery:** `vo-<beat-id>.mp3`, one file per beat id in
  §3 (`vo-welcome.mp3`, `vo-command-center.mp3`, … `vo-closing.mp3` — 11
  files total). Deliver alongside a duration report (actual recorded
  length per file) so it can be checked against §3's on-screen budget
  before anything is wired into the app.

### Pronunciation & terminology

| Term | Say it as |
| --- | --- |
| A2R | "A, two, R" (three distinct sounds, not "aitor") |
| SteerCo | "steer-co" (one word, rhymes with "hero-co") |
| OS (in "A2R Delivery OS") | "O, S" (letters, not "oss") |
| PDF | "P, D, F" (letters) |
| KPI | "K, P, I" (letters) |
| RAID | said as the word "raid," not spelled out |
| Contoso | "con-TOE-so" — the example client name in beat 2, not a real customer |

---

## 3. Master script — all 11 beats

Grouped by act, exactly as `DEMO_SCRIPT` orders them. **Pacing** is words
in the caption ÷ (`durationMs` ÷ 60000) — i.e. the words-per-minute a
narrator would need to hit to finish exactly on cue. Every beat below sits
inside the comfortable 150–180 wpm band.

### ACT I — Introduction

#### Beat 1 — `welcome`
- **Route:** `/` (Portfolio Control Tower) · **Duration:** 10s · **Personas:** Executive, Admin, Full Tour
- **Highlight:** `#global-header`
- **VO:**
  > Welcome to A2R Delivery OS — the delivery operating system built for professional services firms. This is the Portfolio Control Tower: every engagement, rolled up into one live view.
- **Pacing:** 28 words / 10s ≈ **168 wpm**

#### Beat 2 — `command-center`
- **Route:** `/command` · **Duration:** 10s · **Personas:** Executive, Admin, Full Tour
- **Highlight:** — (general page view)
- **VO:**
  > The Command Center puts your portfolio's vital signs, and a natural-language command bar, in one pane — type "financials for Contoso" and it just takes you there.
- **Delivery note:** land cleanly on the quoted example — a brief, natural emphasis on *"financials for Contoso"*, not a full character voice.
- **Pacing:** 26 words / 10s ≈ **156 wpm**

#### Beat 3 — `scoped-practice-view`
- **Route:** `/capacity` · **Duration:** 15s · **Personas:** Executive, Admin, Full Tour
- **Highlight:** `#capacity-scope-indicator`
- **VO:**
  > Every view in A2R Delivery OS is role-aware. A VP or Ops lead sees the whole portfolio here — tenant-wide. Switch to a Practice Director's seat, and the exact same screen scopes itself to just their own practice's roster and projects, automatically.
- **Delivery note:** this is Role-Based Scoped Filtering's own beat — the highlighted line on screen literally reads "Tenant-wide — every practice." for a global role and "Scoped to your practice — N resources." for a Practice Director/Delivery Manager. The VO should land the *comparison*, not just describe one state.
- **Pacing:** 41 words / 15s ≈ **164 wpm**

#### Beat 4 — `steerco`
- **Route:** `/steerco` · **Duration:** 8s · **Personas:** Executive, Full Tour
- **Highlight:** — (general page view)
- **VO:**
  > For the steering committee, the SteerCo Briefing distills the whole portfolio into a lean, board-ready read-out — and prints straight to a clean PDF.
- **Pacing:** 23 words / 8s ≈ **172 wpm**

#### Beat 5 — `executive-hub`
- **Route:** `/reports` · **Duration:** 9s · **Personas:** Executive, Full Tour
- **Highlight:** — (general page view)
- **VO:**
  > The Executive Hub goes one layer deeper — a full four-section portfolio briefing, also print-ready, for whenever the board wants the detail behind the headline.
- **Pacing:** 24 words / 9s ≈ **160 wpm**

### ACT II — Ops Console

#### Beat 6 — `admin-setup`
- **Route:** `/admin` · **Duration:** 10s · **Personas:** Admin, Full Tour
- **Highlight:** — (general page view)
- **VO:**
  > Now let's step behind the curtain. Admin & Org Setup is where a delivery leader manages the roster, the rate card, and enterprise governance policy — no spreadsheet required.
- **Delivery note:** "Now let's step behind the curtain" is the act's own turn — a small tonal shift into "and here's how it's built," not a continuation of Act I's pace.
- **Pacing:** 27 words / 10s ≈ **162 wpm**

#### Beat 7 — `admin-ingestion`
- **Route:** `/admin/ingestion?v=batch` · **Duration:** 13s · **Personas:** Admin, Full Tour
- **Highlight:** `#batch-import-zone`
- **VO:**
  > And this is brand new: the Self-Service Batch Import Engine. A client's own team drops in a week of actuals, and anything that doesn't check out is quarantined — never silently dropped, never committed until it's clean.
- **Pacing:** 36 words / 13s ≈ **166 wpm** — the longest line in the script.

#### Beat 8 — `admin-kpis`
- **Route:** `/admin/kpis` · **Duration:** 22s · **Personas:** Admin, Full Tour
- **Highlight:** `#new-kpi-button`
- **VO:**
  > And this is the Custom KPI Builder. An admin picks a real metric — margin, schedule health, RAID exposure, utilization — sets a target and a warning line, and assigns it to exactly the personas who should see it. Save it, and the card appears immediately on the Control Tower and the Executive Hub for everyone in that persona — no redeploy, no waiting.
- **Delivery note:** two distinct beats inside one line — the *builder* ("margin, schedule health, RAID exposure, utilization" as a clean list, one breath group each) and the *payoff* ("Save it, and the card appears immediately…"). Land a small lift on "immediately" — this is the line that closes the loop from configuration to the live dashboard widget (src/components/kpi/KpiWidgetCard.tsx), not just describing a settings screen.
- **Pacing:** 61 words / 22s ≈ **166 wpm**

#### Beat 9 — `ops-console`
- **Route:** `/ops` · **Duration:** 10s · **Personas:** Admin, Full Tour
- **Highlight:** — (general page view)
- **VO:**
  > Zooming out further, the A2R Ops Console is our own operator view across every client we run — platform health, tenant provisioning, and identity federation, all in one place.
- **Pacing:** 28 words / 10s ≈ **168 wpm**

#### Beat 10 — `ops-pulse`
- **Route:** `/ops/pulse` · **Duration:** 8s · **Personas:** Admin, Full Tour
- **Highlight:** — (general page view)
- **VO:**
  > Platform Pulse is engineering telemetry for A2R Delivery OS itself — build, tests, and database health, ingested automatically, never typed in by hand.
- **Pacing:** 22 words / 8s ≈ **165 wpm**

### Closing (both tracks rejoin here)

#### Beat 11 — `closing`
- **Route:** `/` · **Duration:** 7s · **Personas:** Executive, Admin, Full Tour
- **Highlight:** — (general page view)
- **VO:**
  > That's the tour. Feel free to take the wheel from here — everything you just saw is one click away.
- **Delivery note:** the one beat that should sound like a sign-off, not a segue — let the pace ease down from the rest of the read.
- **Pacing:** 19 words / 7s ≈ **163 wpm**

---

## 4. Per-track production cue sheets

Timecodes are cumulative **from a cold start of that track** (`0:00` =
the instant `startDemo(persona)` fires) — precise to the second, since
every beat's duration is a whole number of seconds. Each row's OUT point
is the next beat's IN point; the route change happens exactly on cue.

### 4.1 Full Platform Tour — 2:02 total, all 11 beats

| Timecode | Sec | Beat | Route | Highlight |
| --- | --- | --- | --- | --- |
| 0:00–0:10 | 0–10 | `welcome` | `/` | `#global-header` |
| 0:10–0:20 | 10–20 | `command-center` | `/command` | — |
| 0:20–0:35 | 20–35 | `scoped-practice-view` | `/capacity` | `#capacity-scope-indicator` |
| 0:35–0:43 | 35–43 | `steerco` | `/steerco` | — |
| 0:43–0:52 | 43–52 | `executive-hub` | `/reports` | — |
| 0:52–1:02 | 52–62 | `admin-setup` | `/admin` | — |
| 1:02–1:15 | 62–75 | `admin-ingestion` | `/admin/ingestion?v=batch` | `#batch-import-zone` |
| 1:15–1:37 | 75–97 | `admin-kpis` | `/admin/kpis` | `#new-kpi-button` |
| 1:37–1:47 | 97–107 | `ops-console` | `/ops` | — |
| 1:47–1:55 | 107–115 | `ops-pulse` | `/ops/pulse` | — |
| 1:55–2:02 | 115–122 | `closing` | `/` | — |

### 4.2 Executive Lens — 0:59 total, 6 beats

| Timecode | Sec | Beat | Route | Highlight |
| --- | --- | --- | --- | --- |
| 0:00–0:10 | 0–10 | `welcome` | `/` | `#global-header` |
| 0:10–0:20 | 10–20 | `command-center` | `/command` | — |
| 0:20–0:35 | 20–35 | `scoped-practice-view` | `/capacity` | `#capacity-scope-indicator` |
| 0:35–0:43 | 35–43 | `steerco` | `/steerco` | — |
| 0:43–0:52 | 43–52 | `executive-hub` | `/reports` | — |
| 0:52–0:59 | 52–59 | `closing` | `/` | — |

### 4.3 Admin / Ops Lens — 1:45 total, 9 beats

| Timecode | Sec | Beat | Route | Highlight |
| --- | --- | --- | --- | --- |
| 0:00–0:10 | 0–10 | `welcome` | `/` | `#global-header` |
| 0:10–0:20 | 10–20 | `command-center` | `/command` | — |
| 0:20–0:35 | 20–35 | `scoped-practice-view` | `/capacity` | `#capacity-scope-indicator` |
| 0:35–0:45 | 35–45 | `admin-setup` | `/admin` | — |
| 0:45–0:58 | 45–58 | `admin-ingestion` | `/admin/ingestion?v=batch` | `#batch-import-zone` |
| 0:58–1:20 | 58–80 | `admin-kpis` | `/admin/kpis` | `#new-kpi-button` |
| 1:20–1:30 | 80–90 | `ops-console` | `/ops` | — |
| 1:30–1:38 | 90–98 | `ops-pulse` | `/ops/pulse` | — |
| 1:38–1:45 | 98–105 | `closing` | `/` | — |

---

## 5. Notes for the next pass

- **Timing reconciliation:** §3's durations are still an *estimate* tuned
  against a target wpm, not a measured recording. Once real ElevenLabs
  takes exist, re-time each beat's `durationMs` in `demo-script.ts`
  against the *actual* recorded file length and update this document in
  the same change — a take that runs long or short by more than a second
  or so against its budget should adjust the duration, not be re-edited
  to fit it.
- **Visual highlight:** `CinematicOverlay` renders a soft pulsing glow
  ring around `activeStep.highlightSelector`'s element when a beat sets
  one (`welcome` → `#global-header`, `scoped-practice-view` →
  `#capacity-scope-indicator`, `admin-ingestion` → `#batch-import-zone`,
  `admin-kpis` → `#new-kpi-button`) — tracked live via
  `getBoundingClientRect()`, so it holds position through
  scrolling/resizing and waits for the element to mount after a route
  change. A future beat that wants one just sets `highlightSelector` to a
  real, stable id already in the DOM.
- **Playback wiring:** nothing in the app plays audio today —
  `CinematicOverlay` is subtitle-only. Wiring the `vo-<beat-id>.mp3` files
  in is a follow-on (e.g. an `<audio>` element keyed by `activeStep.id`,
  autoplaying in step with the existing route-push/timer effects in
  `AutoDemoProvider`).
- **New beats:** a future beat only needs an entry in `DEMO_SCRIPT` (id,
  route, duration, caption, act, personas) and a matching row here — the
  per-track cue sheets in §4 are mechanically derived from
  `getStepsForPersona()` and should be regenerated by hand the same way
  whenever the script changes.
