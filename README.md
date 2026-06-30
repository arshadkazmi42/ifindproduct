# iFound.today

Discover indie products you'll actually use. A TikTok-style feed for indie products — no rankings, no upvotes, just great tools served one at a time.

## What is this?

A PWA that shows indie products in a full-screen scrollable feed. No sign-ups, no database, no backend. Products are loaded from a JSON file that auto-updates from Product Hunt daily.

## Submit your product

Anyone can submit a product by opening a GitHub Issue:

1. Click the **+ Submit** button in the app, or go to [Submit a Product](https://github.com/arshadkazmi42/ifindproduct/issues/new?template=submit-product.yml)
2. Fill in the details: name, URL, tagline, category, pricing
3. A GitHub Action automatically creates a PR to add your product
4. Once the PR is merged, your product goes live in the feed

## Claim your product

If your product is already listed and you want to verify ownership:

1. Click the **Claim** button on your product's card, or go to [Claim a Product](https://github.com/arshadkazmi42/ifindproduct/issues/new?template=claim-product.yml)
2. Provide proof of ownership (e.g. add `<meta name="ifound-verify" content="your-github-username">` to your site)
3. Once verified, your listing gets a verified maker badge

## Run locally

```bash
python3 -m http.server 8888
# or
npx serve .
```

Open `http://localhost:8888`

## Add products manually

Edit `data/products.json`. Manual entries use ids 1-99 (preserved across PH syncs).

```json
{
  "id": 31,
  "name": "Your Product",
  "tagline": "One line pitch",
  "description": "What it does",
  "url": "https://yourproduct.com",
  "domain": "yourproduct.com",
  "category": "Developer Tools",
  "maker": "Your Name",
  "price": "Free",
  "colors": ["#7c3aed", "#4f46e5"],
  "pattern": "circuit",
  "tags": ["solo maker", "free"],
  "problem": "The pain point it solves"
}
```

## Auto-fetch from Product Hunt

A GitHub Action runs daily at 08:00 UTC to fetch trending and newest products from Product Hunt.

### Setup

1. Go to [Product Hunt API Dashboard](https://www.producthunt.com/v2/oauth/applications)
2. Click **Add an Application**
3. Fill in **Name** (anything), **Redirect URI** (`https://localhost`)
4. Click **Create Token** and copy the Developer Token
5. In your repo: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
6. Name: `PH_TOKEN`, Value: your token
7. Go to **Actions** tab → **Fetch Product Hunt Products** → **Run workflow** to test

## How it works

- Pure HTML/CSS/JS PWA — no framework, no backend
- Products from static JSON + Product Hunt GraphQL API
- Full-page screenshots via Puppeteer (768px viewport)
- Submissions via GitHub Issues + Actions automation
- PWA with service worker for offline support
- Mobile-first, notch-safe, scroll-snap feed

## License

MIT
