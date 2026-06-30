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

// PH enforces a 500k per-query complexity cap. The old queries used
// posts(first: 50) with an UNBOUNDED nested topics connection -> 815k -> rejected.
// Fix: bound topics, keep each page small, and paginate for volume instead.
const PER_PAGE = 20;                                       // confirmed under PH's 500k complexity cap
const MAX_PAGES = Number(process.env.PH_MAX_PAGES || 60);  // deep pagination for volume (~1200/order)
const TOPICS_LIMIT = 5;                                    // bound the nested connection (category/tags only)
const MAX_RETRIES = 4;                                     // backoff retries for transient rate limits
const RESET_WAIT_CAP = Number(process.env.PH_RESET_WAIT || 20); // wait short quota resets; skip long ones (set high to ride windows for bulk)

function buildQuery(order, after) {
  const afterArg = after ? `, after: "${after}"` : '';
  return `{
    posts(order: ${order}, first: ${PER_PAGE}${afterArg}) {
      pageInfo { hasNextPage endCursor }
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
          topics(first: ${TOPICS_LIMIT}) { edges { node { name slug } } }
          thumbnail { url }
        }
      }
    }
  }`;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Follow redirects (PH's `website` is usually a producthunt.com/r/ link) to the
// real destination URL. Returns '' on any failure/timeout — caller skips it.
async function finalUrl(url, ms = 12000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      signal: ac.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; iFoundBot/1.0)' },
    });
    try { await r.body?.cancel(); } catch {}
    return r.url || '';
  } catch {
    return '';
  } finally {
    clearTimeout(t);
  }
}

async function fetchPHPage(query) {
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

  const posts = data.data?.posts || {};
  return {
    nodes: (posts.edges || []).map(e => e.node),
    pageInfo: posts.pageInfo || {},
  };
}

// Paginate one order, accumulating posts. Resilient: a mid-pagination failure
// (e.g. a rate limit) stops that order but keeps everything fetched so far; a
// failure on the very first page (e.g. complexity/auth) is surfaced so we notice.
async function fetchAllPosts(order) {
  let after = null;
  let pages = 0;
  let firstPageErr = null;
  const out = [];
  while (pages < MAX_PAGES) {
    // Fetch one page, retrying transient rate limits (429 / "rate limit") with
    // exponential backoff. Non-retryable errors (e.g. complexity) stop the order.
    let page = null;
    for (let attempt = 0; ; attempt++) {
      try {
        page = await fetchPHPage(buildQuery(order, after));
        break;
      } catch (e) {
        const msg = e.message || '';
        const transient = /\b429\b|rate.?limit|too many/i.test(msg);
        const m = msg.match(/reset_in["':\s]+(\d+)/i);
        const resetIn = m ? Number(m[1]) : null;
        // Short reset window → wait it out and retry. Long reset (budget drained
        // for several minutes) → stop and keep the partial haul (NON-FATAL).
        if (transient && resetIn !== null && resetIn <= RESET_WAIT_CAP && attempt < MAX_RETRIES) {
          console.warn(`  ${order}: rate limited — waiting ${resetIn + 1}s for reset (retry ${attempt + 1})`);
          await sleep((resetIn + 1) * 1000);
          continue;
        }
        if (transient) {
          console.warn(`  ${order}: PH quota reached (reset_in=${resetIn ?? '?'}s) — stopping with ${out.length} posts kept`);
        } else {
          if (pages === 0) firstPageErr = e;
          console.warn(`  ${order}: page ${pages + 1} failed (${msg}) — stopping`);
        }
        break;
      }
    }
    if (!page) break;
    out.push(...page.nodes);
    pages++;
    console.log(`  ${order}: page ${pages} -> +${page.nodes.length} (running total ${out.length})`);
    if (!page.pageInfo.hasNextPage || !page.pageInfo.endCursor) break;
    after = page.pageInfo.endCursor;
    await sleep(300); // be gentle on PH rate limits
  }
  if (out.length === 0 && firstPageErr) {
    console.warn(`  ${order}: nothing fetched (${firstPageErr.message})`);
  }
  return out;
}

async function transformPost(post, index) {
  const phUrl = post.url || '';
  let website = post.website || '';
  if (!website) return null;

  // PH's `website` is usually a producthunt.com/r/ redirect — follow it to the real site.
  if (website.includes('producthunt.com')) {
    website = await finalUrl(website);
  }
  if (!website || website.includes('producthunt.com')) return null;

  const domain = extractDomain(website);
  if (!domain) return null;

  const makerName = post.makers?.[0]?.name || 'Unknown Maker';
  const topics = (post.topics?.edges || []).map(e => e.node);
  const thumbnail = post.thumbnail?.url || '';

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
    thumbnail: thumbnail,
    ph_url: phUrl,
    created_at: post.createdAt,
  };
}

async function main() {
  if (!TOKEN) {
    console.warn('Missing PH_TOKEN env var — skipping Product Hunt (other sources still run).');
    return;
  }

  console.log('Fetching from Product Hunt API...');

  // Sequential (gentler on rate limits than parallel pagination)
  const trending = await fetchAllPosts('RANKING');
  const newest = await fetchAllPosts('NEWEST');

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

  // Load ALL existing products and accumulate new ones
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

  const save = () => fs.writeFileSync(OUTPUT, JSON.stringify(existing, null, 2));

  // PROGRESSIVE: resolve redirects in parallel batches and checkpoint-save after
  // each batch, so a later error never discards products already fetched/resolved.
  const CONCURRENCY = 8;
  let added = 0;
  try {
    for (let i = 0; i < all.length; i += CONCURRENCY) {
      const batch = all.slice(i, i + CONCURRENCY);
      const resolved = await Promise.all(
        batch.map((post, j) => transformPost(post, i + j).catch(() => null))
      );
      for (const p of resolved) {
        if (!p || !p.domain || existingDomains.has(p.domain)) continue;
        p.id = nextId++;
        p.source = 'producthunt';
        existing.push(p);
        existingDomains.add(p.domain);
        added++;
      }
      save(); // checkpoint
      console.log(`  resolved ${Math.min(i + CONCURRENCY, all.length)}/${all.length} — +${added} new kept`);
    }
  } finally {
    save();
    console.log(`Added ${added} new products from Product Hunt. Wrote ${existing.length} total to ${OUTPUT}`);
  }
}

main().catch(err => {
  // Data is saved progressively inside main(); never abort the pipeline (the commit
  // step still publishes whatever was fetched before the error).
  console.warn('PH fetch ended with error (non-fatal):', err.message);
  process.exit(0);
});
