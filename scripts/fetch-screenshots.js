#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const DATA_FILE = path.join(__dirname, '..', 'data', 'products.json');
const SCREENSHOTS_DIR = path.join(__dirname, '..', 'screenshots');

const WIDTH = 768;
const HEIGHT = 1024;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR);

  const products = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  const toFetch = products.filter(p => !p.url.includes('producthunt.com'));

  console.log(`Taking screenshots for ${toFetch.length} products (${WIDTH}x${HEIGHT} viewport)...\n`);

  const chromePath = '/root/.cache/puppeteer/chrome/linux-149.0.7827.22/chrome-linux64/chrome';
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: chromePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  let fetched = 0, skipped = 0, failed = 0;

  for (const p of toFetch) {
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
  console.error('Failed:', err.message);
  process.exit(1);
});
