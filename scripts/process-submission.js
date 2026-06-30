#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, '..', 'data', 'products.json');

const PATTERN_TYPES = ['circuit', 'grid', 'dots', 'waves'];
const COLOR_PALETTES = [
  ['#7c3aed', '#4f46e5'], ['#84cc16', '#22c55e'], ['#ef4444', '#f97316'],
  ['#06b6d4', '#3b82f6'], ['#eab308', '#f59e0b'], ['#8b5cf6', '#a855f7'],
  ['#ec4899', '#f43f5e'], ['#14b8a6', '#06b6d4'], ['#3b82f6', '#1d4ed8'],
  ['#6366f1', '#4f46e5'], ['#22c55e', '#16a34a'], ['#f59e0b', '#d97706'],
];

function parseIssueBody(body) {
  const fields = {};
  const lines = body.split('\n');

  let currentKey = null;
  let currentValue = [];

  for (const line of lines) {
    const headerMatch = line.match(/^### (.+)/);
    if (headerMatch) {
      if (currentKey) {
        fields[currentKey] = currentValue.join('\n').trim();
      }
      currentKey = headerMatch[1].trim();
      currentValue = [];
    } else if (currentKey) {
      currentValue.push(line);
    }
  }
  if (currentKey) {
    fields[currentKey] = currentValue.join('\n').trim();
  }

  return fields;
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return '';
  }
}

function parseTags(tagsText) {
  if (!tagsText) return ['new'];
  const tags = [];
  const lines = tagsText.split('\n');
  for (const line of lines) {
    const match = line.match(/\[X\]\s*(.+)/i);
    if (match) tags.push(match[1].trim().toLowerCase());
  }
  return tags.length ? tags : ['new'];
}

function main() {
  const body = process.env.ISSUE_BODY;
  if (!body) {
    console.error('No ISSUE_BODY env var');
    process.exit(1);
  }

  const fields = parseIssueBody(body);
  console.log('Parsed fields:', Object.keys(fields));

  const name = fields['Product Name'] || '';
  const url = fields['Website URL'] || '';
  const tagline = fields['Tagline'] || '';
  const description = fields['Description'] || tagline;
  const maker = fields['Maker Name'] || 'Unknown';
  const category = fields['Category'] || 'Tools';
  const price = fields['Pricing'] || 'Check website';
  const tags = parseTags(fields['Tags (select all that apply)']);
  const problem = fields['What problem does it solve?'] || tagline;

  if (!name || !url) {
    console.error('Missing required fields: name or url');
    process.exit(1);
  }

  const products = JSON.parse(fs.readFileSync(OUTPUT, 'utf-8'));

  if (products.some(p => p.url === url || p.domain === extractDomain(url))) {
    console.log('Product already exists, skipping');
    process.exit(0);
  }

  const manualIds = products.filter(p => p.id < 100).map(p => p.id);
  const nextId = manualIds.length ? Math.max(...manualIds) + 1 : 50;

  if (nextId >= 100) {
    console.error('Manual product ID space full (max 99)');
    process.exit(1);
  }

  const newProduct = {
    id: nextId,
    name,
    tagline,
    description,
    url,
    domain: extractDomain(url),
    category,
    maker,
    price,
    colors: COLOR_PALETTES[nextId % COLOR_PALETTES.length],
    pattern: PATTERN_TYPES[nextId % PATTERN_TYPES.length],
    tags,
    problem,
  };

  products.push(newProduct);
  fs.writeFileSync(OUTPUT, JSON.stringify(products, null, 2));
  console.log(`Added "${name}" with id ${nextId}`);
}

main();
