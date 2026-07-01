#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const DATA_FILE = path.join(__dirname, '..', 'data', 'products.json');
const SCREENSHOTS_DIR = path.join(__dirname, '..', 'screenshots');

const WIDTH = 768;
const HEIGHT = 1024;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Resolve a Chrome binary across environments (CI runner, local box). The feed
// falls back to remote previews when a local screenshot is missing, so this is
// best-effort: if no browser is found we skip rather than fail the pipeline.
function resolveChrome() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    '/root/.cache/puppeteer/chrome/linux-149.0.7827.22/chrome-linux64/chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean);
  return candidates.find(c => { try { return fs.existsSync(c); } catch { return false; } }) || null;
}

async function main() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR);

  const products = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  const toFetch = products.filter(p => !p.url.includes('producthunt.com'));

  // Keep the on-disk screenshot set BOUNDED: never generate beyond TOTAL_CAP total
  // (existing + new). Products without a screenshot just show the branded gradient.
  const TOTAL_CAP = Number(process.env.SCREENSHOT_TOTAL_CAP || 600);
  const existingCount = fs.readdirSync(SCREENSHOTS_DIR).filter(f => /\.(jpe?g|png)$/i.test(f)).length;
  const MAX_SHOTS = Math.min(Number(process.env.MAX_SHOTS || 40), Math.max(0, TOTAL_CAP - existingCount));
  if (MAX_SHOTS <= 0) {
    console.log(`Screenshot total cap reached (${existingCount}/${TOTAL_CAP} on disk) — skipping generation.`);
    return;
  }

  console.log(`Taking up to ${MAX_SHOTS} new screenshots (${existingCount}/${TOTAL_CAP} on disk, ${WIDTH}x${HEIGHT})...\n`);

  const chromePath = resolveChrome();
  if (!chromePath) {
    console.warn('No Chrome binary found — skipping screenshots (feed falls back to remote previews).');
    console.warn('Set PUPPETEER_EXECUTABLE_PATH or install Chrome to enable local screenshots.');
    return;
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: chromePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
  } catch (err) {
    console.warn(`Could not launch Chrome at ${chromePath}: ${err.message}`);
    console.warn('Skipping screenshots (feed falls back to remote previews).');
    return;
  }

  let fetched = 0, skipped = 0, failed = 0;

  for (const p of toFetch) {
    if (fetched >= MAX_SHOTS) {
      console.log(`Reached per-run cap of ${MAX_SHOTS} new screenshots — remaining use remote previews.`);
      break;
    }
    const outFile = path.join(SCREENSHOTS_DIR, `${p.id}.jpg`);

    if (fs.existsSync(outFile)) {
      const stat = fs.statSync(outFile);
      if (stat.size > 5000) {
        skipped++;
        continue;
      }
    }

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: WIDTH, height: HEIGHT });
      await page.goto(p.url, { waitUntil: 'networkidle2', timeout: 20000 });
      await sleep(1500);
      await page.screenshot({ path: outFile, type: 'jpeg', quality: 85, fullPage: true });
      await page.close();
      const sz = fs.statSync(outFile).size;
      fetched++;
      console.log(`  ✓ ${p.name} (${Math.round(sz / 1024)}KB)`);
    } catch (err) {
      failed++;
      console.log(`  ✗ ${p.name}: ${err.message.split('\n')[0]}`);
    }
  }

  await browser.close();
  console.log(`\nDone: ${fetched} fetched, ${skipped} cached, ${failed} failed`);
}

main().catch(err => {
  // Screenshots are best-effort — never fail the pipeline (and thus the product
  // commit) over them. The feed falls back to remote previews.
  console.warn('Screenshots step error (non-fatal):', err.message);
  process.exit(0);
});
