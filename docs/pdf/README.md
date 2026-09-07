# Print-ready PDFs

Source for the two external-facing PDFs kept at the repo root:

| Source (`docs/pdf/`) | Output (repo root) | Audience |
| --- | --- | --- |
| `exec-summary.html` | `a2r-executive-summary.pdf` | Executive / stakeholder / family review |
| `security-briefing.html` | `a2r-security-briefing.pdf` | External executive, security, and audit review |

Both track the current production state (**v1.16.0**, commit `e1a0c09`) and
should be regenerated whenever `docs/EXECUTIVE_SUMMARY.md`,
`docs/ROADMAP.md`, or `docs/SECURITY.md` change materially — edit the HTML
here in the same commit, then rebuild.

## Rebuild

```bash
node docs/pdf/render-pdfs.mjs
```

Uses the repo's own Playwright chromium — no extra dependency. Fonts
(Spectral, IBM Plex Sans, IBM Plex Mono) are fetched once from Google Fonts
and embedded as base64, so the rendered PDF is deterministic and needs no
network at render time. The embedded-font cache
(`docs/pdf/fonts-embedded.css`) is gitignored and regenerates on a clean
checkout.
