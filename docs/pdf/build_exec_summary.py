#!/usr/bin/env python3
"""
Build a2r-executive-summary.pdf (repo root) from docs/pdf/exec-summary.html
via WeasyPrint.

The HTML mirrors docs/EXECUTIVE_SUMMARY.md + docs/ROADMAP.md — edit it in the
same commit when those change, then rebuild.

Fonts (Spectral / IBM Plex Sans / IBM Plex Mono) are fetched once from Google
Fonts and embedded as base64 @font-face blocks, cached at
docs/pdf/fonts-embedded.css (gitignored), so the render is deterministic and
needs no network once cached.

Run:
    python3 docs/pdf/build_exec_summary.py

Requires WeasyPrint. It is not a project dependency; install it into an
isolated environment, e.g.:
    micromamba create -y -p /tmp/wp -c conda-forge python=3.12 weasyprint
    /tmp/wp/bin/python docs/pdf/build_exec_summary.py
"""
import base64
import re
import sys
import urllib.request
from pathlib import Path

DIR = Path(__file__).resolve().parent
REPO = DIR.parent.parent
OUT = REPO / "a2r-executive-summary.pdf"

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
GOOGLE_FONTS = (
    "https://fonts.googleapis.com/css2?"
    "family=Spectral:wght@400;600&"
    "family=IBM+Plex+Sans:wght@400;500;600&"
    "family=IBM+Plex+Mono:wght@400;500&display=swap"
)


def _get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    return urllib.request.urlopen(req, timeout=30).read()


def font_css() -> str:
    cache = DIR / "fonts-embedded.css"
    if cache.exists():
        return cache.read_text()

    css = _get(GOOGLE_FONTS).decode()
    faces = []
    for chunk in css.split("@font-face")[1:]:
        block = "@font-face" + chunk[: chunk.index("}") + 1]
        if "U+0000" not in block:  # keep the core latin subset only
            continue
        m = re.search(r"url\((https://fonts\.gstatic\.com/[^)]+\.woff2)\)", block)
        if not m:
            continue
        b64 = base64.b64encode(_get(m.group(1))).decode()
        block = re.sub(
            r"url\([^)]+\)\s*format\('woff2'\)",
            f"url(data:font/woff2;base64,{b64}) format('woff2')",
            block,
        )
        faces.append(block)
    embedded = "\n".join(faces)
    cache.write_text(embedded)
    print(f"  embedded {len(faces)} font faces ({len(embedded) // 1024} KB)")
    return embedded


def main() -> int:
    try:
        from weasyprint import HTML
    except Exception as exc:  # pragma: no cover
        print(f"WeasyPrint not importable: {exc}", file=sys.stderr)
        print("See the module docstring for an isolated install.", file=sys.stderr)
        return 1

    html = (DIR / "exec-summary.html").read_text().replace("/* FONT-FACES */", font_css())
    HTML(string=html, base_url=str(DIR)).write_pdf(str(OUT))
    print(f"  wrote {OUT.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
