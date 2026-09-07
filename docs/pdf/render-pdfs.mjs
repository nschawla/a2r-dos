/**
 * Build a2r-security-briefing.pdf (repo root) from
 * docs/pdf/security-briefing.html.
 *
 * The executive summary uses a separate WeasyPrint pipeline for finer
 * pagination control (one section per page, running page-number footers) —
 * see docs/pdf/build_exec_summary.py.
 *
 * Fonts (Spectral / IBM Plex Sans / IBM Plex Mono) are fetched once from
 * Google Fonts and embedded as base64 `@font-face` blocks, so the rendered
 * PDF is byte-deterministic and needs no network at render time. The
 * embedded CSS is cached at docs/pdf/fonts-embedded.css (gitignored).
 *
 * Uses the repo's own Playwright chromium — no extra dependency.
 *
 * Run:  node docs/pdf/render-pdfs.mjs      (from the repo root)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(DIR, '../..');
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Spectral:wght@400;600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap';

async function buildFontCss() {
  const cache = join(DIR, 'fonts-embedded.css');
  if (existsSync(cache)) return readFileSync(cache, 'utf8');

  const css = await (await fetch(GOOGLE_FONTS_URL, { headers: { 'User-Agent': UA } })).text();
  const out = [];
  for (const raw of css.split('@font-face').slice(1)) {
    const block = '@font-face' + raw.slice(0, raw.indexOf('}') + 1);
    if (!/unicode-range:[^;]*U\+0000/.test(block)) continue; // core latin subset only
    const m = block.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/);
    if (!m) continue;
    const buf = Buffer.from(await (await fetch(m[1], { headers: { 'User-Agent': UA } })).arrayBuffer());
    const uri = `url(data:font/woff2;base64,${buf.toString('base64')}) format('woff2')`;
    out.push(block.replace(/url\([^)]+\)\s*format\('woff2'\)/, uri));
  }
  const embedded = out.join('\n');
  writeFileSync(cache, embedded);
  console.log(`  embedded ${out.length} font faces (${(embedded.length / 1024).toFixed(0)} KB)`);
  return embedded;
}

const JOBS = [{ html: 'security-briefing.html', pdf: 'a2r-security-briefing.pdf' }];

const fontCss = await buildFontCss();
const browser = await chromium.launch();
try {
  for (const job of JOBS) {
    const html = readFileSync(join(DIR, job.html), 'utf8').replace('/* FONT-FACES */', fontCss);
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.emulateMedia({ media: 'print' });
    await page.pdf({
      path: join(REPO_ROOT, job.pdf),
      format: 'A4',
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
      preferCSSPageSize: true,
    });
    await page.close();
    console.log(`  wrote ${job.pdf}`);
  }
} finally {
  await browser.close();
}
console.log('done');
