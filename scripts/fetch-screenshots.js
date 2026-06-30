#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const DATA_FILE = path.join(__dirname, '..', 'data', 'products.json');
const SCREENSHOTS_DIR = path.join(__dirname, '..', 'screenshots');

function download(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('too many redirects'));
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ifound-bot/1.0)' }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let loc = res.headers.location;
        if (loc.startsWith('/')) loc = new URL(loc, url).href;
        res.resume();
        return download(loc, maxRedirects - 1).then(resolve).catch(reject);
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

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ifound-bot/1.0)' }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let loc = res.headers.location;
        if (loc.startsWith('/')) loc = new URL(loc, url).href;
        res.resume();
        return fetchHtml(loc).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function extractOgImage(html) {
  const patterns = [
    /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
    /<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1] && !m[1].includes('favicon')) return m[1];
  }
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchOgImageForProduct(product) {
  try {
    const html = await fetchHtml(product.url);
    let ogUrl = extractOgImage(html);
    if (!ogUrl) return null;

    if (ogUrl.startsWith('//')) ogUrl = 'https:' + ogUrl;
    else if (ogUrl.startsWith('/')) ogUrl = new URL(ogUrl, product.url).href;

    const buf = await download(ogUrl);
    if (buf.length < 3000) return null;
    return buf;
  } catch {
    return null;
  }
}

async function fetchThumbScreenshot(product) {
  const url = `https://image.thum.io/get/width/1280/crop/900/noanimate/${product.url}`;
  try {
    const buf = await download(url);
    return buf.length > 5000 ? buf : null;
  } catch {
    return null;
  }
}

async function main() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR);

  const products = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  const toFetch = products.filter(p => !p.url.includes('producthunt.com'));

  console.log(`Fetching images for ${toFetch.length} products (OG image → thum.io fallback)...\n`);

  let ogCount = 0, thumbCount = 0, skipped = 0, failed = 0;

  for (const p of toFetch) {
    const outFile = path.join(SCREENSHOTS_DIR, `${p.id}.jpg`);

    if (fs.existsSync(outFile)) {
      const stat = fs.statSync(outFile);
      if (stat.size > 5000) {
        skipped++;
        continue;
      }
    }

    // Try OG image first
    const ogBuf = await fetchOgImageForProduct(p);
    if (ogBuf) {
      fs.writeFileSync(outFile, ogBuf);
      ogCount++;
      console.log(`  ✓ ${p.name} — OG image (${Math.round(ogBuf.length / 1024)}KB)`);
      await sleep(500);
      continue;
    }

    // Fall back to thum.io screenshot
    const thumbBuf = await fetchThumbScreenshot(p);
    if (thumbBuf) {
      fs.writeFileSync(outFile, thumbBuf);
      thumbCount++;
      console.log(`  ✓ ${p.name} — thum.io (${Math.round(thumbBuf.length / 1024)}KB)`);
      await sleep(1500);
      continue;
    }

    failed++;
    console.log(`  ✗ ${p.name} — no image found`);
  }

  console.log(`\nDone: ${ogCount} OG images, ${thumbCount} thum.io, ${skipped} cached, ${failed} failed`);
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
