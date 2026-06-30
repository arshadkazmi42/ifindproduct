#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const API_BASE = 'https://trustmrr.com/api/v1';
const TOKEN = process.env.TRUSTMRR_TOKEN;
const OUTPUT = path.join(__dirname, '..', 'data', 'products.json');

const PATTERN_TYPES = ['circuit', 'grid', 'dots', 'waves'];
const COLOR_PALETTES = [
  ['#7c3aed', '#4f46e5'], ['#84cc16', '#22c55e'], ['#ef4444', '#f97316'],
  ['#06b6d4', '#3b82f6'], ['#eab308', '#f59e0b'], ['#8b5cf6', '#a855f7'],
  ['#ec4899', '#f43f5e'], ['#14b8a6', '#06b6d4'], ['#3b82f6', '#1d4ed8'],
  ['#6366f1', '#4f46e5'], ['#22c55e', '#16a34a'], ['#f59e0b', '#d97706'],
  ['#a855f7', '#7c3aed'], ['#0ea5e9', '#0284c7'], ['#f02e65', '#e91e63'],
];

const CATEGORY_MAP = {
  'saas': 'SaaS',
  'ai': 'AI / Automation',
  'fintech': 'Fintech',
  'developer-tools': 'Developer Tools',
  'devtools': 'Developer Tools',
  'productivity': 'Productivity',
  'marketing': 'Marketing',
  'ecommerce': 'E-Commerce',
  'e-commerce': 'E-Commerce',
  'analytics': 'Analytics',
  'education': 'Education',
  'health': 'Health',
  'social': 'Social Media',
  'design': 'Design',
  'security': 'Security',
  'infrastructure': 'Infrastructure',
  'no-code': 'No-Code',
  'nocode': 'No-Code',
};

function mapCategory(category) {
  if (!category) return 'Tools';
  const key = category.toLowerCase().replace(/\s+/g, '-');
  return CATEGORY_MAP[key] || category;
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return ''; }
}

function formatMRR(mrr) {
  if (!mrr || mrr <= 0) return 'Check website';
  if (mrr >= 100000) return `$${Math.round(mrr / 1000)}k/mo MRR`;
  if (mrr >= 1000) return `$${(mrr / 1000).toFixed(1)}k/mo MRR`;
  return `$${mrr}/mo MRR`;
}

function inferTags(startup) {
  const tags = [];
  if (startup.customers_count <= 50) tags.push('early stage');
  if (startup.customers_count > 500) tags.push('growing');
  if (startup.mom_growth > 20) tags.push('trending');
  if (startup.is_for_sale) tags.push('for sale');
  tags.push('verified revenue');
  return tags;
}

async function fetchStartups(page = 1) {
  const url = `${API_BASE}/startups?page=${page}&per_page=50`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${TOKEN}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TrustMRR API ${res.status}: ${text}`);
  }

  return res.json();
}

async function main() {
  if (!TOKEN) {
    console.error('Missing TRUSTMRR_TOKEN env var. Get one from https://trustmrr.com/docs/api');
    process.exit(1);
  }

  console.log('Fetching from TrustMRR API...');

  let allStartups = [];
  for (let page = 1; page <= 5; page++) {
    try {
      const data = await fetchStartups(page);
      const startups = data.startups || data.data || data;
      if (!Array.isArray(startups) || startups.length === 0) break;
      allStartups.push(...startups);
      console.log(`Page ${page}: ${startups.length} startups`);
      await new Promise(r => setTimeout(r, 3100));
    } catch (err) {
      console.error(`Page ${page} failed: ${err.message}`);
      break;
    }
  }

  console.log(`Fetched ${allStartups.length} total startups from TrustMRR`);

  let existing = [];
  try {
    existing = JSON.parse(fs.readFileSync(OUTPUT, 'utf-8'));
    console.log(`Loaded ${existing.length} existing products`);
  } catch {
    console.log('No existing products.json, starting fresh');
  }

  const existingDomains = new Set(existing.map(p => p.domain).filter(Boolean));
  const maxId = existing.reduce((max, p) => Math.max(max, p.id), 99);
  let nextId = Math.max(maxId + 1, 100);

  let added = 0;
  for (let i = 0; i < allStartups.length; i++) {
    const s = allStartups[i];
    const url = s.website || s.url || '';
    if (!url) continue;

    const domain = extractDomain(url);
    if (!domain || existingDomains.has(domain)) continue;

    const product = {
      id: nextId++,
      name: s.name || '',
      tagline: s.description || s.tagline || '',
      description: s.description || s.tagline || '',
      url: url,
      domain: domain,
      category: mapCategory(s.category),
      maker: s.founder || s.maker || 'Unknown Maker',
      price: formatMRR(s.mrr || s.monthly_revenue),
      colors: COLOR_PALETTES[i % COLOR_PALETTES.length],
      pattern: PATTERN_TYPES[i % PATTERN_TYPES.length],
      tags: inferTags(s),
      problem: s.tagline || s.description || '',
      source: 'trustmrr',
      mrr: s.mrr || s.monthly_revenue || 0,
      growth: s.mom_growth || 0,
    };

    existing.push(product);
    existingDomains.add(domain);
    added++;
  }

  console.log(`Added ${added} new products from TrustMRR`);

  fs.writeFileSync(OUTPUT, JSON.stringify(existing, null, 2));
  console.log(`Wrote ${existing.length} total products to ${OUTPUT}`);
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
