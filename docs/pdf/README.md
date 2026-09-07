# Print-ready PDFs

Source for the two external-facing PDFs kept at the repo root. Both track
the current production state (**v1.16.0**, commit `e1a0c09`) and should be
regenerated whenever `docs/EXECUTIVE_SUMMARY.md`, `docs/ROADMAP.md`, or
`docs/SECURITY.md` change materially — edit the HTML here in the same
commit, then rebuild.

| Source (`docs/pdf/`) | Output (repo root) | Pipeline | Audience |
| --- | --- | --- | --- |
| `exec-summary.html` | `a2r-executive-summary.pdf` | WeasyPrint (Python) | Executive / stakeholder / family review |
| `security-briefing.html` | `a2r-security-briefing.pdf` | Playwright chromium (Node) | External executive, security, and audit review |

## Executive summary — `build_exec_summary.py` (WeasyPrint)

```bash
python3 docs/pdf/build_exec_summary.py
```

WeasyPrint gives finer print control than a browser engine: **one section
per page** (`break-before: page`), running `@page` footers with live page
numbers (`counter(page) "/" counter(pages)`), a running confidentiality
header, and no orphaned section headings.

WeasyPrint is **not** a project dependency. Install it into an isolated
environment (it needs the Pango/Cairo native stack, plus `brotli` to decode
the embedded WOFF2 fonts):

```bash
# micromamba (self-contained, does not touch the system):
micromamba create -y -p /tmp/wp -c conda-forge python=3.12 weasyprint brotli-python
/tmp/wp/bin/python docs/pdf/build_exec_summary.py
```

## Security briefing — `render-pdfs.mjs` (Playwright chromium)

```bash
node docs/pdf/render-pdfs.mjs
```

Uses the repo's own Playwright chromium — no extra dependency.

## Fonts

Both pipelines fetch Spectral / IBM Plex Sans / IBM Plex Mono once from
Google Fonts and embed the core-latin subset as base64 `@font-face` blocks,
so the rendered PDF is deterministic and needs no network once cached. The
cache (`docs/pdf/fonts-embedded.css`) is gitignored and regenerates on a
clean checkout.
