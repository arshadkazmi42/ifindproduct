#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'products.json');

function parseIssueBody(body) {
  const fields = {};
  const lines = body.split('\n');
  let currentKey = null;
  let currentValue = [];

  for (const line of lines) {
    const headerMatch = line.match(/^### (.+)/);
    if (headerMatch) {
      if (currentKey) fields[currentKey] = currentValue.join('\n').trim();
      currentKey = headerMatch[1].trim();
      currentValue = [];
    } else if (currentKey) {
      currentValue.push(line);
    }
  }
  if (currentKey) fields[currentKey] = currentValue.join('\n').trim();
  return fields;
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return ''; }
}

function main() {
  const body = process.env.ISSUE_BODY;
  if (!body) { console.error('No ISSUE_BODY'); process.exit(1); }

  const fields = parseIssueBody(body);
  const productUrl = fields['Product URL'] || '';
  const github = fields['Your GitHub Username'] || '';

  if (!productUrl) { console.error('Missing product URL'); process.exit(1); }

  const domain = extractDomain(productUrl);
  const products = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  const product = products.find(p => p.url === productUrl || p.domain === domain);

  if (!product) {
    console.error(`No product found matching "${productUrl}"`);
    process.exit(1);
  }

  if (product.verified) {
    console.log(`"${product.name}" is already verified`);
    process.exit(0);
  }

  product.verified = true;
  if (github) product.claimedBy = github;

  fs.writeFileSync(DATA_FILE, JSON.stringify(products, null, 2));
  console.log(`Verified "${product.name}" (id ${product.id}) — claimed by @${github}`);
}

main();
