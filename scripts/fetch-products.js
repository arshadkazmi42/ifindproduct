#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const PH_API = 'https://api.producthunt.com/v2/api/graphql';
const TOKEN = process.env.PH_TOKEN;
const OUTPUT = path.join(__dirname, '..', 'data', 'products.json');

const PATTERN_TYPES = ['circuit', 'grid', 'dots', 'waves'];
const COLOR_PALETTES = [
  ['#7c3aed', '#4f46e5'],
  ['#84cc16', '#22c55e'],
  ['#ef4444', '#f97316'],
  ['#06b6d4', '#3b82f6'],
  ['#eab308', '#f59e0b'],
  ['#8b5cf6', '#a855f7'],
  ['#ec4899', '#f43f5e'],
  ['#14b8a6', '#06b6d4'],
  ['#3b82f6', '#1d4ed8'],
  ['#6366f1', '#4f46e5'],
  ['#22c55e', '#16a34a'],
  ['#f59e0b', '#d97706'],
  ['#a855f7', '#7c3aed'],
  ['#0ea5e9', '#0284c7'],
  ['#f02e65', '#e91e63'],
  ['#22d3ee', '#06b6d4'],
];

const CATEGORY_MAP = {
  'artificial-intelligence': 'AI / Automation',
  'developer-tools': 'Developer Tools',
  'productivity': 'Productivity',
  'design-tools': 'Design',
  'marketing': 'Marketing',
  'fintech': 'Fintech',
  'saas': 'SaaS',
  'open-source': 'Open Source',
  'chrome-extensions': 'Chrome Extension',
  'github': 'Developer Tools',
  'api': 'Infrastructure',
  'analytics': 'Analytics',
  'security': 'Security',
  'devops': 'DevOps',
  'no-code': 'No-Code',
  'education': 'Education',
  'health-fitness': 'Health',
  'social-media': 'Social Media',
};

function mapCategory(topics) {
  if (!topics || !topics.length) return 'Tools';
  for (const t of topics) {
    const slug = t.slug || t.name?.toLowerCase().replace(/\s+/g, '-');
    if (CATEGORY_MAP[slug]) return CATEGORY_MAP[slug];
  }
  return topics[0]?.name || 'Tools';
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return '';
  }
}

function inferTags(post) {
  const tags = [];
  const topics = (post.topics?.edges || []).map(e => e.node?.slug || '');

  if (topics.includes('open-source')) tags.push('open source');
  if (topics.includes('chrome-extensions')) tags.push('chrome extension');
  if (topics.includes('no-code')) tags.push('no-code');

  if (post.makers?.length === 1) tags.push('solo maker');
  else if (post.makers?.length <= 3) tags.push('small team');

  const pricing = (post.pricing_type || '').toLowerCase();
  if (pricing === 'free') tags.push('free');
  else if (pricing === 'freemium') tags.push('freemium');
  else if (pricing === 'open_source') tags.push('open source');

  if (tags.length === 0) tags.push('new');

  return [...new Set(tags)];
}

function inferPrice(post) {
  const pricing = (post.pricing_type || '').toLowerCase();
  if (pricing === 'free') return 'Free';
  if (pricing === 'freemium') return 'Free tier available';
  if (pricing === 'open_source') return 'Free & Open Source';
  if (pricing === 'paid') return 'Paid';
  return 'Check website';
}

const QUERIES = {
  newest: `{
    posts(order: NEWEST, first: 20) {
      edges {
        node {
          id
          name
          tagline
          description
          url
          website
          votesCount
          createdAt
          makers { name }
          topics { edges { node { name slug } } }
          thumbnail { url }
        }
      }
    }
  }`,
  trending: `{
    posts(order: RANKING, first: 20) {
      edges {
        node {
          id
          name
          tagline
          description
          url
          website
          votesCount
          createdAt
          makers { name }
          topics { edges { node { name slug } } }
          thumbnail { url }
        }
      }
    }
  }`,
};

async function fetchPH(query) {
  const res = await fetch(PH_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PH API ${res.status}: ${text}`);
  }

  const data = await res.json();
  if (data.errors) {
    throw new Error(`PH GraphQL: ${JSON.stringify(data.errors)}`);
  }

  return (data.data?.posts?.edges || []).map(e => e.node);
}

function transformPost(post, index) {
  const website = post.website || post.url;
  const domain = extractDomain(website);
  const makerName = post.makers?.[0]?.name || 'Unknown Maker';
  const topics = (post.topics?.edges || []).map(e => e.node);

  return {
    id: index + 1,
    name: post.name,
    tagline: post.tagline || '',
    description: post.description || post.tagline || '',
    url: website,
    domain: domain,
    category: mapCategory(topics),
    maker: makerName,
    price: inferPrice(post),
    colors: COLOR_PALETTES[index % COLOR_PALETTES.length],
    pattern: PATTERN_TYPES[index % PATTERN_TYPES.length],
    tags: inferTags(post),
    problem: post.tagline || '',
    votes: post.votesCount || 0,
    ph_url: post.url,
    created_at: post.createdAt,
  };
}

async function main() {
  if (!TOKEN) {
    console.error('Missing PH_TOKEN env var. Get one from https://www.producthunt.com/v2/oauth/applications');
    process.exit(1);
  }

  console.log('Fetching from Product Hunt API...');

  const [newest, trending] = await Promise.all([
    fetchPH(QUERIES.newest),
    fetchPH(QUERIES.trending),
  ]);

  // Merge and deduplicate by PH id
  const seen = new Set();
  const all = [];
  for (const post of [...trending, ...newest]) {
    if (!seen.has(post.id)) {
      seen.add(post.id);
      all.push(post);
    }
  }

  console.log(`Fetched ${all.length} unique products (${trending.length} trending + ${newest.length} newest)`);

  // Load existing manual products (ids < 100 are reserved for manual entries)
  let existing = [];
  try {
    existing = JSON.parse(fs.readFileSync(OUTPUT, 'utf-8'));
    existing = existing.filter(p => p.id < 100);
    console.log(`Keeping ${existing.length} manual products`);
  } catch {
    console.log('No existing products.json, starting fresh');
  }

  // Transform PH products starting from id 100
  const phProducts = all.map((post, i) => transformPost(post, i));
  phProducts.forEach((p, i) => { p.id = 100 + i; });

  const merged = [...existing, ...phProducts];
  fs.writeFileSync(OUTPUT, JSON.stringify(merged, null, 2));
  console.log(`Wrote ${merged.length} total products to ${OUTPUT}`);
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
