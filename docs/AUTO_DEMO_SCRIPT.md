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

Three playback tracks share one 9-beat master script — a track is a
persona-filtered *subsequence* of it, in the same order, never a rewrite:

| Track | Persona value | Beats played | Total runtime |
| --- | --- | --- | --- |
| **Full Platform Tour** | `'Full Tour'` | All 9, in script order | **1:06** (66s) |
| **Executive Lens** | `'Executive'` | Welcome → Command Center → SteerCo → Executive Hub → Closing (5 beats) | **0:35** (35s) |
| **Admin / Ops Lens** | `'Admin'` | Welcome → Command Center → Admin Setup → Batch Import → Ops Console → Platform Pulse → Closing (7 beats) | **0:52** (52s) |

Because a beat's line is identical everywhere it appears, **only 9 unique
voiceover files are ever needed** — not one per track/beat combination.
Record each beat once; the per-track cue sheets in §4 just tell you which
recording plays when, on which track.

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
  - Stability: **0.45–0.55** (expressive enough to sound human across 9
    fairly technical beats, stable enough not to wander mid-sentence).
  - Similarity: **0.75+**.
  - Style exaggeration: **0.15–0.30** (this is narration, not a character
    read — keep it low).
  - Speaker boost: **on**.
- **Pacing:** narrate for clarity, not speed — a comfortable delivery pace
  is roughly 140–160 words per minute. §3's pacing column flags every beat
  where the *current* on-screen duration is tighter than that (all nine
  are — see the note at the top of §3), so budget for either a brisker
  read than usual or a follow-up pass that extends `durationMs` in
  `demo-script.ts` once real recordings exist to time against.
- **Delivery:** one continuous take per beat (no mid-line pauses/edits) —
  each recording plays back-to-back against a hard route change, so a
  clean start and a clean tail (no trailing breath/room tone beyond
  natural sentence-final decay) matters more than it would in a single
  long-form narration.
- **File naming & delivery:** `vo-<beat-id>.mp3`, one file per beat id in
  §3 (`vo-welcome.mp3`, `vo-command-center.mp3`, … `vo-closing.mp3` — 9
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
| Contoso | "con-TOE-so" — the example client name in beat 2, not a real customer |

---

## 3. Master script — all 9 beats

Grouped by act, exactly as `DEMO_SCRIPT` orders them. **Pacing** is words
in the caption ÷ (`durationMs` ÷ 60000) — i.e. the words-per-minute a
narrator would need to hit to finish exactly on cue. Every beat currently
requires a brisker-than-comfortable read (see §2); ⚠ marks the one beat
that's tightest against a natural pace and most worth a follow-up
`durationMs` increase once a real recording exists.

### ACT I — Introduction

#### Beat 1 — `welcome`
- **Route:** `/` (Portfolio Control Tower) · **Duration:** 8s · **Personas:** Executive, Admin, Full Tour
- **Highlight:** `#global-header`
- **VO:**
  > Welcome to A2R Delivery OS — the delivery operating system built for professional services firms. This is the Portfolio Control Tower: every engagement, rolled up into one live view.
- **Pacing:** 28 words / 8s ≈ **210 wpm**

#### Beat 2 — `command-center`
- **Route:** `/command` · **Duration:** 7s · **Personas:** Executive, Admin, Full Tour
- **Highlight:** — (general page view)
- **VO:**
  > The Command Center puts your portfolio's vital signs, and a natural-language command bar, in one pane — type "financials for Contoso" and it just takes you there.
- **Delivery note:** land cleanly on the quoted example — a brief, natural emphasis on *"financials for Contoso"*, not a full character voice.
- **Pacing:** 26 words / 7s ≈ **222 wpm**

#### Beat 3 — `steerco`
- **Route:** `/steerco` · **Duration:** 7s · **Personas:** Executive, Full Tour
- **Highlight:** — (general page view)
- **VO:**
  > For the steering committee, the SteerCo Briefing distills the whole portfolio into a lean, board-ready read-out — and prints straight to a clean PDF.
- **Pacing:** 23 words / 7s ≈ **197 wpm**

#### Beat 4 — `executive-hub`
- **Route:** `/reports` · **Duration:** 7s · **Personas:** Executive, Full Tour
- **Highlight:** — (general page view)
- **VO:**
  > The Executive Hub goes one layer deeper — a full four-section portfolio briefing, also print-ready, for whenever the board wants the detail behind the headline.
- **Pacing:** 24 words / 7s ≈ **205 wpm**

### ACT II — Ops Console

#### Beat 5 — `admin-setup`
- **Route:** `/admin` · **Duration:** 8s · **Personas:** Admin, Full Tour
- **Highlight:** — (general page view)
- **VO:**
  > Now let's step behind the curtain. Admin & Org Setup is where a delivery leader manages the roster, the rate card, and enterprise governance policy — no spreadsheet required.
- **Delivery note:** "Now let's step behind the curtain" is the act's own turn — a small tonal shift into "and here's how it's built," not a continuation of Act I's pace.
- **Pacing:** 27 words / 8s ≈ **202 wpm**

#### Beat 6 — `admin-ingestion` ⚠
- **Route:** `/admin/ingestion?v=batch` · **Duration:** 8s · **Personas:** Admin, Full Tour
- **Highlight:** `#batch-import-zone`
- **VO:**
  > And this is brand new: the Self-Service Batch Import Engine. A client's own team drops in a week of actuals, and anything that doesn't check out is quarantined — never silently dropped, never committed until it's clean.
- **Pacing:** 36 words / 8s ≈ **270 wpm** — the longest line on the shortest realistic read; flag this one specifically for a `durationMs` bump (≈14s at a comfortable pace) once a take exists to measure.

#### Beat 7 — `ops-console`
- **Route:** `/ops` · **Duration:** 8s · **Personas:** Admin, Full Tour
- **Highlight:** — (general page view)
- **VO:**
  > Zooming out further, the A2R Ops Console is our own operator view across every client we run — platform health, tenant provisioning, and identity federation, all in one place.
- **Pacing:** 28 words / 8s ≈ **210 wpm**

#### Beat 8 — `ops-pulse`
- **Route:** `/ops/pulse` · **Duration:** 7s · **Personas:** Admin, Full Tour
- **Highlight:** — (general page view)
- **VO:**
  > Platform Pulse is engineering telemetry for A2R Delivery OS itself — build, tests, and database health, ingested automatically, never typed in by hand.
- **Pacing:** 22 words / 7s ≈ **189 wpm**

### Closing (both tracks rejoin here)

#### Beat 9 — `closing`
- **Route:** `/` · **Duration:** 6s · **Personas:** Executive, Admin, Full Tour
- **Highlight:** — (general page view)
- **VO:**
  > That's the tour. Feel free to take the wheel from here — everything you just saw is one click away.
- **Delivery note:** the one beat that should sound like a sign-off, not a segue — let the pace ease down from the rest of the read.
- **Pacing:** 19 words / 6s ≈ **190 wpm**

---

## 4. Per-track production cue sheets

Timecodes are cumulative **from a cold start of that track** (`0:00` =
the instant `startDemo(persona)` fires) — precise to the second, since
every beat's duration is a whole number of seconds. Each row's OUT point
is the next beat's IN point; the route change happens exactly on cue.

### 4.1 Full Platform Tour — 1:06 total, all 9 beats

| Timecode | Sec | Beat | Route | Highlight |
| --- | --- | --- | --- | --- |
| 0:00–0:08 | 0–8 | `welcome` | `/` | `#global-header` |
| 0:08–0:15 | 8–15 | `command-center` | `/command` | — |
| 0:15–0:22 | 15–22 | `steerco` | `/steerco` | — |
| 0:22–0:29 | 22–29 | `executive-hub` | `/reports` | — |
| 0:29–0:37 | 29–37 | `admin-setup` | `/admin` | — |
| 0:37–0:45 | 37–45 | `admin-ingestion` | `/admin/ingestion?v=batch` | `#batch-import-zone` |
| 0:45–0:53 | 45–53 | `ops-console` | `/ops` | — |
| 0:53–1:00 | 53–60 | `ops-pulse` | `/ops/pulse` | — |
| 1:00–1:06 | 60–66 | `closing` | `/` | — |

### 4.2 Executive Lens — 0:35 total, 5 beats

| Timecode | Sec | Beat | Route | Highlight |
| --- | --- | --- | --- | --- |
| 0:00–0:08 | 0–8 | `welcome` | `/` | `#global-header` |
| 0:08–0:15 | 8–15 | `command-center` | `/command` | — |
| 0:15–0:22 | 15–22 | `steerco` | `/steerco` | — |
| 0:22–0:29 | 22–29 | `executive-hub` | `/reports` | — |
| 0:29–0:35 | 29–35 | `closing` | `/` | — |

### 4.3 Admin / Ops Lens — 0:52 total, 7 beats

| Timecode | Sec | Beat | Route | Highlight |
| --- | --- | --- | --- | --- |
| 0:00–0:08 | 0–8 | `welcome` | `/` | `#global-header` |
| 0:08–0:15 | 8–15 | `command-center` | `/command` | — |
| 0:15–0:23 | 15–23 | `admin-setup` | `/admin` | — |
| 0:23–0:31 | 23–31 | `admin-ingestion` | `/admin/ingestion?v=batch` | `#batch-import-zone` |
| 0:31–0:39 | 31–39 | `ops-console` | `/ops` | — |
| 0:39–0:46 | 39–46 | `ops-pulse` | `/ops/pulse` | — |
| 0:46–0:52 | 46–52 | `closing` | `/` | — |

---

## 5. Notes for the next pass

- **Timing reconciliation:** once real ElevenLabs takes exist, re-time
  each beat's `durationMs` in `demo-script.ts` against the *actual*
  recorded file length (not the estimate in §3) and update this document
  in the same change — beat 6 (`admin-ingestion`) almost certainly needs
  to grow from 8s.
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
