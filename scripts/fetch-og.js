#!/usr/bin/env node
// Enrich products.json with each product's own og:image (Open Graph / Twitter card)
// URL — a curated preview image hosted on the maker's site. We store only the URL
// (a few bytes); the feed renders it blur-filled. Best-effort, throttled, progressive.

const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data', 'products.json');
const CONCURRENCY = Number(process.env.OG_CONCURRENCY || 12);
const CAP = Number(process.env.OG_CAP || 100000); // max products to enrich per run
const TIMEOUT = Number(process.env.OG_TIMEOUT || 12000);

async function ogImage(pageUrl) {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), TIMEOUT);
    const r = await fetch(pageUrl, {
      redirect: 'follow',
      signal: ac.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; iFoundBot/1.0; +https://ifound.today)' },
    });
    clearTimeout(t);
    if (!r.ok) return '';
    const html = await r.text();
    const m =
      html.match(/<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::url)?["']/i) ||
      html.match(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i);
    let img = m ? m[1].trim() : '';
    if (img) {
      try { img = new URL(img, r.url || pageUrl).href; } catch { img = ''; }
    }
    return /^https?:\/\//.test(img) ? img : '';
  } catch {
    return '';
  }
}

async function main() {
  let products;
  try { products = JSON.parse(fs.readFileSync(DATA, 'utf8')); }
  catch { console.error('No products.json'); process.exit(1); }

  const save = () => fs.writeFileSync(DATA, JSON.stringify(products, null, 2));

  // Only products not yet attempted (og_image === undefined) with a real URL.
  const todo = products.filter(p => p.og_image === undefined && p.url && !p.url.includes('producthunt.com')).slice(0, CAP);
  console.log(`Enriching og:image for ${todo.length} products (concurrency ${CONCURRENCY})...`);

  let done = 0, found = 0;
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const batch = todo.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async p => {
      const img = await ogImage(p.url);
      p.og_image = img || '';   // '' = attempted, none found (won't retry next run)
      if (img) found++;
    }));
    done += batch.length;
    if (done % 60 === 0 || done >= todo.length) { save(); console.log(`  ${done}/${todo.length} (found ${found})`); }
  }
  save();
  console.log(`Done: attempted ${done}, found og:image for ${found}.`);
}

main();
