# iFound.today

Discover indie products you'll actually use. A TikTok-style feed for indie products — no rankings, no upvotes, just great tools served one at a time.

## What is this?

A PWA that shows indie products in a full-screen scrollable feed. No sign-ups, no database, no backend. Products are loaded from a JSON file that auto-updates from Product Hunt every 6 hours.

## Run locally

```bash
# Any static server works
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

A GitHub Action runs every 6 hours to fetch trending and newest products from Product Hunt and merge them into `data/products.json`. Here's how to set it up:

### Step 1: Create a Product Hunt API Token

1. Go to [Product Hunt API Dashboard](https://www.producthunt.com/v2/oauth/applications)
2. Click **Add an Application**
3. Fill in:
   - **Name**: `ifound-fetcher` (or anything you like)
   - **Redirect URI**: `https://localhost` (not used, but required)
4. Click **Create Token** — this generates a Developer Token
5. Copy the token (you'll need it in the next step)

### Step 2: Add the Token to GitHub Secrets

1. Go to your fork's GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Set:
   - **Name**: `PH_TOKEN`
   - **Secret**: paste the Developer Token from Step 1
4. Click **Add secret**

### Step 3: Enable the GitHub Action

The workflow at `.github/workflows/fetch-products.yml` runs automatically every 6 hours. To trigger it manually:

1. Go to **Actions** tab in your repo
2. Click **Fetch Product Hunt Products** in the sidebar
3. Click **Run workflow** → **Run workflow**

The action will fetch ~40 products (20 trending + 20 newest), deduplicate them, merge with your manual products (ids 1-99 are preserved), and commit the updated `data/products.json`.

### Run fetch locally (optional)

```bash
PH_TOKEN=your_token_here node scripts/fetch-products.js
```

## Tech stack

- Pure HTML/CSS/JS — no framework
- PWA with service worker for offline support
- Data from static JSON + Product Hunt GraphQL API
- Screenshot previews via [image.thum.io](https://www.thum.io/)
- Hosted as a static site (GitHub Pages, Cloudflare Pages, Vercel, etc.)

## License

MIT
