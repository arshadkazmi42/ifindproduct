#!/usr/bin/env node
// Generate full-page screenshots on THIS server (served via the tunnel from
// ../screenshots). Concurrent, compressed, skips existing, progressive.
// NOT run in CI — screenshots are gitignored so the repo stays small.

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const DATA = path.join(__dirname, '..', 'data', 'products.json');
const DIR = path.join(__dirname, '..', 'screenshots');
const CHROME = process.env.PUPPETEER_EXECUTABLE_PATH
  || '/root/.cache/puppeteer/chrome/linux-149.0.7827.22/chrome-linux64/chrome';
const CONCURRENCY = Number(process.env.SHOT_CONCURRENCY || 3);
const WIDTH = Number(process.env.SHOT_WIDTH || 700);
const QUALITY = Number(process.env.SHOT_QUALITY || 62);
const MAX_HEIGHT = Number(process.env.SHOT_MAX_HEIGHT || 5000); // clip absurdly long pages
const NAV_TIMEOUT = Number(process.env.SHOT_TIMEOUT || 25000);
const CAP = Number(process.env.SHOT_CAP || 100000);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const exists = f => { try { return fs.statSync(f).size > 5000; } catch { return false; } };

async function shoot(browser, p) {
  const out = path.join(DIR, `${p.id}.jpg`);
  let page;
  try {
    page = await browser.newPage();
    await page.setViewport({ width: WIDTH, height: 1200, deviceScaleFactor: 1 });
    await page.goto(p.url, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });
    await sleep(1200);
    const h = await page.evaluate(() => document.body.scrollHeight).catch(() => 0);
    const clip = (h && h > MAX_HEIGHT) ? { x: 0, y: 0, width: WIDTH, height: MAX_HEIGHT } : null;
    await page.screenshot(clip
      ? { path: out, type: 'jpeg', quality: QUALITY, clip }
      : { path: out, type: 'jpeg', quality: QUALITY, fullPage: true });
    return 'ok';
  } catch (e) {
    return 'fail';
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

async function main() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  const products = JSON.parse(fs.readFileSync(DATA, 'utf8'))
    .filter(p => p.url && !p.url.includes('producthunt.com'));
  const todo = products.filter(p => !exists(path.join(DIR, `${p.id}.jpg`))).slice(0, CAP);
  console.log(`Full-page screenshots: ${todo.length} to generate (concurrency ${CONCURRENCY}, ${WIDTH}px q${QUALITY})`);

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  let ok = 0, fail = 0, i = 0;
  async function worker() {
    while (i < todo.length) {
      const p = todo[i++];
      const r = await shoot(browser, p);
      r === 'ok' ? ok++ : fail++;
      if ((ok + fail) % 25 === 0) console.log(`  ${ok + fail}/${todo.length} (ok ${ok}, fail ${fail})`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await browser.close();
  console.log(`Done: ${ok} generated, ${fail} failed.`);
}

main().catch(e => { console.error('gen error:', e.message); process.exit(1); });
