#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const DATA_FILE = path.join(__dirname, '..', 'data', 'products.json');
const SCREENSHOTS_DIR = path.join(__dirname, '..', 'screenshots');

function download(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR);

  const products = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  const toFetch = products.filter(p => !p.url.includes('producthunt.com'));

  console.log(`Fetching screenshots for ${toFetch.length} products...`);

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

    const screenshotUrl = `https://image.thum.io/get/width/1280/crop/900/noanimate/${p.url}`;
    try {
      const buf = await download(screenshotUrl);
      if (buf.length > 5000) {
        fs.writeFileSync(outFile, buf);
        fetched++;
        console.log(`  ✓ ${p.name} (${Math.round(buf.length/1024)}KB)`);
      } else {
        failed++;
        console.log(`  ✗ ${p.name} (too small: ${buf.length}B)`);
      }
    } catch (err) {
      failed++;
      console.log(`  ✗ ${p.name}: ${err.message}`);
    }

    await sleep(1500);
  }

  console.log(`\nDone: ${fetched} fetched, ${skipped} cached, ${failed} failed`);
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
